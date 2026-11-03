//! Reachability probe for the torrent proxy.
//!
//! The settings screen used to test the proxy by fetching nyaa.si through the
//! scraper client, which accepts HTTP proxies and resolves names locally. That
//! said nothing about the path librqbit actually uses: SOCKS5, remote DNS, and
//! a TCP tunnel to a tracker. This probe performs the same handshake and
//! CONNECT, so a green result means the torrent path can reach a tracker.

use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const PROBE_TIMEOUT: Duration = Duration::from_secs(12);
const PROBE_HOST: &str = "rutracker.org";
const PROBE_PORT: u16 = 443;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProxyProbe {
    pub latency_ms: u64,
}

pub async fn probe(raw: &str) -> Result<ProxyProbe, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("proxy_empty".to_string());
    }
    let parsed = url::Url::parse(trimmed).map_err(|_| "proxy_invalid".to_string())?;
    let scheme = parsed.scheme().to_owned();
    if !matches!(scheme.as_str(), "socks5" | "socks5h" | "http") {
        return Err("proxy_scheme".to_string());
    }
    let host = parsed
        .host_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "proxy_invalid".to_string())?
        .to_string();
    let port = parsed.port().ok_or_else(|| "proxy_invalid".to_string())?;
    let username = (!parsed.username().is_empty()).then(|| decode_component(parsed.username()));
    let password = parsed.password().map(decode_component);

    let started = Instant::now();
    tokio::time::timeout(PROBE_TIMEOUT, async move {
        let mut stream = TcpStream::connect((host.as_str(), port))
            .await
            .map_err(|_| "proxy_connect".to_string())?;
        if scheme == "http" {
            http_connect(&mut stream, username.as_deref(), password.as_deref()).await?;
        } else {
            socks5_greeting(&mut stream, username.as_deref(), password.as_deref()).await?;
            socks5_connect(&mut stream).await?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|_| "proxy_timeout".to_string())??;

    Ok(ProxyProbe {
        latency_ms: started.elapsed().as_millis() as u64,
    })
}

fn decode_component(value: &str) -> String {
    urlencoding::decode(value).map_or_else(|_| value.to_string(), |decoded| decoded.into_owned())
}

async fn http_connect(
    stream: &mut TcpStream,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<(), String> {
    let target = format!("{PROBE_HOST}:{PROBE_PORT}");
    let mut request =
        format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\nProxy-Connection: keep-alive\r\n");
    if let (Some(username), Some(password)) = (username, password) {
        use base64::Engine as _;
        let credentials =
            base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
        request.push_str(&format!("Proxy-Authorization: Basic {credentials}\r\n"));
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|_| "proxy_connect".to_string())?;

    let mut buffer = Vec::with_capacity(512);
    let mut chunk = [0u8; 256];
    loop {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|_| "proxy_connect".to_string())?;
        if read == 0 {
            return Err("proxy_connect".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if buffer.len() > 16 * 1024 {
            return Err("proxy_protocol".to_string());
        }
    }
    let head = String::from_utf8_lossy(&buffer);
    let status = head.lines().next().unwrap_or_default();
    let code = status
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok());
    match code {
        Some(200..=299) => Ok(()),
        Some(_) => Err("proxy_target".to_string()),
        None => Err("proxy_protocol".to_string()),
    }
}

async fn socks5_greeting(
    stream: &mut TcpStream,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<(), String> {
    let with_auth = username.is_some();
    let methods: &[u8] = if with_auth { &[0x00, 0x02] } else { &[0x00] };
    let mut greeting = Vec::with_capacity(2 + methods.len());
    greeting.push(0x05);
    greeting.push(methods.len() as u8);
    greeting.extend_from_slice(methods);
    stream
        .write_all(&greeting)
        .await
        .map_err(|_| "proxy_connect".to_string())?;

    let mut reply = [0u8; 2];
    stream
        .read_exact(&mut reply)
        .await
        .map_err(|_| "proxy_connect".to_string())?;
    if reply[0] != 0x05 {
        return Err("proxy_protocol".to_string());
    }
    match reply[1] {
        0x00 => Ok(()),
        0x02 => socks5_auth(stream, username, password).await,
        _ => Err("proxy_auth".to_string()),
    }
}

async fn socks5_auth(
    stream: &mut TcpStream,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<(), String> {
    let Some(username) = username else {
        return Err("proxy_auth".to_string());
    };
    let password = password.unwrap_or_default();
    if username.len() > 255 || password.len() > 255 {
        return Err("proxy_auth".to_string());
    }
    let mut request = Vec::with_capacity(3 + username.len() + password.len());
    request.push(0x01);
    request.push(username.len() as u8);
    request.extend_from_slice(username.as_bytes());
    request.push(password.len() as u8);
    request.extend_from_slice(password.as_bytes());
    stream
        .write_all(&request)
        .await
        .map_err(|_| "proxy_auth".to_string())?;

    let mut reply = [0u8; 2];
    stream
        .read_exact(&mut reply)
        .await
        .map_err(|_| "proxy_auth".to_string())?;
    if reply[1] == 0x00 {
        Ok(())
    } else {
        Err("proxy_auth".to_string())
    }
}

async fn socks5_connect(stream: &mut TcpStream) -> Result<(), String> {
    if PROBE_HOST.len() > 255 {
        return Err("proxy_invalid".to_string());
    }
    let mut request = Vec::with_capacity(7 + PROBE_HOST.len());
    request.extend_from_slice(&[0x05, 0x01, 0x00, 0x03, PROBE_HOST.len() as u8]);
    request.extend_from_slice(PROBE_HOST.as_bytes());
    request.extend_from_slice(&PROBE_PORT.to_be_bytes());
    stream
        .write_all(&request)
        .await
        .map_err(|_| "proxy_connect".to_string())?;

    let mut head = [0u8; 4];
    stream
        .read_exact(&mut head)
        .await
        .map_err(|_| "proxy_connect".to_string())?;
    if head[0] != 0x05 {
        return Err("proxy_protocol".to_string());
    }
    if head[1] != 0x00 {
        return Err("proxy_target".to_string());
    }
    match head[3] {
        0x01 => skip(stream, 4).await?,
        0x04 => skip(stream, 16).await?,
        0x03 => {
            let mut len = [0u8; 1];
            stream
                .read_exact(&mut len)
                .await
                .map_err(|_| "proxy_connect".to_string())?;
            skip(stream, usize::from(len[0])).await?;
        }
        _ => return Err("proxy_protocol".to_string()),
    }
    let mut port = [0u8; 2];
    stream
        .read_exact(&mut port)
        .await
        .map_err(|_| "proxy_connect".to_string())?;
    Ok(())
}

async fn skip(stream: &mut TcpStream, len: usize) -> Result<(), String> {
    let mut buffer = vec![0u8; len];
    stream
        .read_exact(&mut buffer)
        .await
        .map_err(|_| "proxy_connect".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::probe;

    #[tokio::test]
    async fn rejects_empty_and_unsupported_urls_before_connecting() {
        assert_eq!(probe("  ").await.unwrap_err(), "proxy_empty");
        assert_eq!(
            probe("https://127.0.0.1:7890").await.unwrap_err(),
            "proxy_scheme"
        );
        assert_eq!(
            probe("http://127.0.0.1").await.unwrap_err(),
            "proxy_invalid"
        );
        assert_eq!(
            probe("socks5://127.0.0.1").await.unwrap_err(),
            "proxy_invalid"
        );
    }
}
