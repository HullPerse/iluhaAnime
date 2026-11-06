//! Staged reachability diagnosis for the HTTP paths the app depends on.
//!
//! A single "request failed" string cannot tell DNS from TCP, TLS, an HTTP
//! status, or an anti-bot interstitial. This module records every stage with
//! its own latency so the first failing one is explicit. It talks to the
//! target exactly like the scrapers do: same user agent, same IPv4-first
//! resolver, same optional proxy, HTTP/1.1 for `RuTracker`.

use std::collections::BTreeSet;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::net::TcpStream;
use tokio::time::timeout;
use url::Url;

use crate::scrapers::clients::{
    build_client_inner, is_cloudflare_challenge, is_rutracker_challenge, read_body_capped,
    resolve_proxy, RUTRACKER_DEFAULT_UA,
};
use crate::torrent::helpers::redact_proxy_url;

const DNS_TIMEOUT: Duration = Duration::from_secs(5);
const TCP_TIMEOUT: Duration = Duration::from_secs(5);
const HTTPS_TIMEOUT_SECS: u64 = 15;
const MAX_ADDRESSES_PER_FAMILY: usize = 3;
const MAX_BODY_BYTES: usize = 512 * 1024;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiagVerdict {
    Ok,
    DnsFailed,
    TcpFailed,
    TlsFailed,
    HttpStatus,
    AntiBot,
    RequestFailed,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DnsAnswer {
    pub address: String,
    pub family: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TcpProbe {
    pub address: String,
    pub family: String,
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HttpsProbe {
    pub ok: bool,
    pub status: Option<u16>,
    pub http_version: Option<String>,
    pub remote_address: Option<String>,
    pub latency_ms: u64,
    pub challenge: bool,
    pub error_stage: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnosis {
    pub host: String,
    pub port: u16,
    pub proxy: Option<String>,
    pub dns: Vec<DnsAnswer>,
    pub dns_error: Option<String>,
    pub tcp: Vec<TcpProbe>,
    pub ipv6_reachable: Option<bool>,
    pub https: HttpsProbe,
    pub verdict: DiagVerdict,
}

pub fn classify_request_error(error: &str) -> &'static str {
    let lower = error.to_ascii_lowercase();
    if lower.contains("certificate")
        || lower.contains("tls")
        || lower.contains("ssl")
        || lower.contains("handshake")
    {
        "tls"
    } else if lower.contains("dns")
        || lower.contains("resolve")
        || lower.contains("name or service")
    {
        "dns"
    } else if lower.contains("connect")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("unreachable")
        || lower.contains("refused")
    {
        "tcp"
    } else {
        "request"
    }
}

fn target(url: &str) -> Result<(Url, String, u16), String> {
    let parsed = Url::parse(url).map_err(|error| format!("invalid url: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only http and https are supported".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("credentials in the url are not supported".to_string());
    }
    let host = parsed
        .host_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "url has no host".to_string())?
        .to_string();
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| "url has no port".to_string())?;
    Ok((parsed, host, port))
}

const fn family_of(addr: &SocketAddr) -> &'static str {
    if addr.is_ipv4() {
        "ipv4"
    } else {
        "ipv6"
    }
}

async fn resolve(host: &str, port: u16) -> (Vec<SocketAddr>, Option<String>) {
    match timeout(DNS_TIMEOUT, tokio::net::lookup_host((host, port))).await {
        Ok(Ok(addrs)) => {
            let mut unique = BTreeSet::new();
            let mut v4 = Vec::new();
            let mut v6 = Vec::new();
            for addr in addrs {
                if !unique.insert(addr) {
                    continue;
                }
                if addr.is_ipv4() {
                    if v4.len() < MAX_ADDRESSES_PER_FAMILY {
                        v4.push(addr);
                    }
                } else if v6.len() < MAX_ADDRESSES_PER_FAMILY {
                    v6.push(addr);
                }
            }
            v4.extend(v6);
            (v4, None)
        }
        Ok(Err(error)) => (Vec::new(), Some(error.to_string())),
        Err(_) => (Vec::new(), Some("dns timeout".to_string())),
    }
}

async fn probe_tcp(addresses: &[SocketAddr]) -> Vec<TcpProbe> {
    let mut pending = tokio::task::JoinSet::new();
    for (index, addr) in addresses.iter().copied().enumerate() {
        pending.spawn(async move {
            let started = Instant::now();
            let result = timeout(TCP_TIMEOUT, TcpStream::connect(addr)).await;
            (
                index,
                TcpProbe {
                    address: addr.ip().to_string(),
                    family: family_of(&addr).to_string(),
                    ok: matches!(result, Ok(Ok(_))),
                    latency_ms: started.elapsed().as_millis() as u64,
                    error: match result {
                        Ok(Ok(_)) => None,
                        Ok(Err(error)) => Some(error.to_string()),
                        Err(_) => Some("tcp timeout".to_string()),
                    },
                },
            )
        });
    }
    let mut ordered: Vec<Option<TcpProbe>> = vec![None; addresses.len()];
    while let Some(joined) = pending.join_next().await {
        if let Ok((index, probe)) = joined {
            ordered[index] = Some(probe);
        }
    }
    ordered.into_iter().flatten().collect()
}

fn challenge_for(host: &str, body: &str) -> bool {
    if host == "rutracker.org" || host.ends_with(".rutracker.org") {
        is_rutracker_challenge(body)
    } else {
        is_cloudflare_challenge(body)
    }
}

async fn probe_https(parsed: &Url, host: &str, proxy: Option<&str>) -> HttpsProbe {
    let http1_only = host == "rutracker.org" || host.ends_with(".rutracker.org");
    let client = match build_client_inner(
        HTTPS_TIMEOUT_SECS,
        false,
        http1_only,
        RUTRACKER_DEFAULT_UA,
        proxy,
    ) {
        Ok(client) => client,
        Err(error) => {
            return HttpsProbe {
                ok: false,
                status: None,
                http_version: None,
                remote_address: None,
                latency_ms: 0,
                challenge: false,
                error_stage: Some("client".to_string()),
                error: Some(error),
            };
        }
    };

    let started = Instant::now();
    match client.get(parsed.clone()).send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let http_version = format!("{:?}", response.version());
            let remote_address = response.remote_addr().map(|addr| addr.to_string());
            let body = read_body_capped(response, MAX_BODY_BYTES)
                .await
                .unwrap_or_default();
            let text = String::from_utf8_lossy(&body);
            HttpsProbe {
                ok: (200..400).contains(&status),
                status: Some(status),
                http_version: Some(http_version),
                remote_address,
                latency_ms: started.elapsed().as_millis() as u64,
                challenge: challenge_for(host, &text),
                error_stage: None,
                error: None,
            }
        }
        Err(error) => {
            let message = error.to_string();
            HttpsProbe {
                ok: false,
                status: None,
                http_version: None,
                remote_address: None,
                latency_ms: started.elapsed().as_millis() as u64,
                challenge: false,
                error_stage: Some(classify_request_error(&message).to_string()),
                error: Some(message),
            }
        }
    }
}

fn verdict(https: &HttpsProbe, dns_empty: bool, proxy_configured: bool) -> DiagVerdict {
    if https.challenge {
        return DiagVerdict::AntiBot;
    }
    if https.error.is_some() {
        return match https.error_stage.as_deref() {
            Some("tls") => DiagVerdict::TlsFailed,
            Some("dns") => DiagVerdict::DnsFailed,
            Some("tcp") if !proxy_configured => DiagVerdict::TcpFailed,
            _ => DiagVerdict::RequestFailed,
        };
    }
    if https.ok {
        return DiagVerdict::Ok;
    }
    if https.status.is_some() {
        return DiagVerdict::HttpStatus;
    }
    if dns_empty {
        return DiagVerdict::DnsFailed;
    }
    DiagVerdict::RequestFailed
}

pub async fn diagnose(url: &str, proxy: Option<&str>) -> Result<NetworkDiagnosis, String> {
    let (parsed, host, port) = target(url)?;
    let (addresses, dns_error) = resolve(&host, port).await;
    let dns: Vec<DnsAnswer> = addresses
        .iter()
        .map(|addr| DnsAnswer {
            address: addr.ip().to_string(),
            family: family_of(addr).to_string(),
        })
        .collect();
    let tcp = probe_tcp(&addresses).await;
    let ipv6_reachable = {
        let mut seen = false;
        let mut ok = false;
        for probe in &tcp {
            if probe.family == "ipv6" {
                seen = true;
                ok |= probe.ok;
            }
        }
        seen.then_some(ok)
    };
    let https = probe_https(&parsed, &host, proxy).await;
    let verdict = verdict(&https, dns.is_empty(), proxy.is_some());
    Ok(NetworkDiagnosis {
        host,
        port,
        proxy: proxy.map(redact_proxy_url),
        dns,
        dns_error,
        tcp,
        ipv6_reachable,
        https,
        verdict,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn network_diagnose(
    url: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<NetworkDiagnosis, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    diagnose(&url, proxy.as_deref()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_https_targets_and_defaults_the_port() {
        let (_, host, port) = target("https://rutracker.org/forum/index.php").expect("target");
        assert_eq!(host, "rutracker.org");
        assert_eq!(port, 443);
        let (_, host, port) = target("http://127.0.0.1:8080/check").expect("target");
        assert_eq!(host, "127.0.0.1");
        assert_eq!(port, 8080);
    }

    #[test]
    fn rejects_non_http_schemes_and_embedded_credentials() {
        assert!(target("ftp://rutracker.org/file").is_err());
        assert!(target("https://user:secret@rutracker.org/").is_err());
        assert!(target("not a url").is_err());
    }

    #[test]
    fn classifies_request_errors_by_stage() {
        assert_eq!(
            classify_request_error("error sending request: connection refused (os error 10061)"),
            "tcp"
        );
        assert_eq!(
            classify_request_error("invalid peer certificate: UnknownIssuer"),
            "tls"
        );
        assert_eq!(
            classify_request_error("dns error: failed to lookup address information"),
            "dns"
        );
        assert_eq!(classify_request_error("operation timed out"), "tcp");
        assert_eq!(
            classify_request_error("error decoding response body"),
            "request"
        );
    }

    #[test]
    fn anti_bot_and_status_verdicts_are_distinct() {
        let blocked = HttpsProbe {
            ok: true,
            status: Some(200),
            http_version: None,
            remote_address: None,
            latency_ms: 1,
            challenge: true,
            error_stage: None,
            error: None,
        };
        assert_eq!(verdict(&blocked, false, false), DiagVerdict::AntiBot);

        let not_found = HttpsProbe {
            challenge: false,
            ok: false,
            status: Some(404),
            ..blocked
        };
        assert_eq!(verdict(&not_found, false, false), DiagVerdict::HttpStatus);
    }

    #[tokio::test]
    #[ignore = "live network: prints a real staged report"]
    async fn live_rutracker_diagnosis() {
        let report = diagnose("https://rutracker.org/forum/index.php", None)
            .await
            .expect("diagnosis");
        println!(
            "{}",
            serde_json::to_string_pretty(&report).expect("serialize report")
        );
    }
}
