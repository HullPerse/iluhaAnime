use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::{Context, bail};
use base64::Engine as _;
use librqbit_dualstack_sockets::ConnectOpts;
use librqbit_utp::{BindDevice, UtpSocketUdp};
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::debug;

use crate::{
    Error, PeerConnectionOptions, Result,
    type_aliases::{BoxAsyncReadVectored, BoxAsyncWrite},
    vectored_traits::AsyncReadVectoredIntoCompat,
};

#[derive(Debug, Clone, Copy, Serialize)]
pub enum ConnectionKind {
    #[serde(rename = "tcp")]
    Tcp,
    #[serde(rename = "utp")]
    Utp,
    #[serde(rename = "socks")]
    Socks,
    #[serde(rename = "http")]
    Http,
}

impl std::fmt::Display for ConnectionKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectionKind::Tcp => f.write_str("tcp"),
            ConnectionKind::Utp => f.write_str("uTP"),
            ConnectionKind::Socks => f.write_str("socks"),
            ConnectionKind::Http => f.write_str("http"),
        }
    }
}

pub struct ConnectionOptions {
    // socks5://[username:password@]host:port or http://[username:password@]host:port
    // If set, all outgoing connections will go through the proxy over TCP.
    pub proxy_url: Option<String>,
    // TCP outgoing connections are enabled by default
    pub enable_tcp: bool,
    pub peer_opts: Option<PeerConnectionOptions>,
}

impl Default for ConnectionOptions {
    fn default() -> Self {
        Self {
            enable_tcp: true,
            proxy_url: None,
            peer_opts: None,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SocksProxyConfig {
    pub host: String,
    pub port: u16,
    pub username_password: Option<(String, String)>,
}

#[derive(Debug, Clone)]
pub(crate) struct HttpProxyConfig {
    pub host: String,
    pub port: u16,
    pub username_password: Option<(String, String)>,
}

#[derive(Debug, Clone)]
pub(crate) enum ProxyConfig {
    Socks(SocksProxyConfig),
    Http(HttpProxyConfig),
}

#[derive(Default, Debug, Clone)]
pub(crate) struct StreamConnectorArgs {
    pub enable_tcp: bool,
    pub proxy_config: Option<ProxyConfig>,
    pub utp_socket: Option<Arc<UtpSocketUdp>>,
    pub bind_device: Option<BindDevice>,
    pub ipv4_only: bool,
}

fn decode_component(value: &str) -> String {
    urlencoding::decode(value).map_or_else(|_| value.to_owned(), |decoded| decoded.into_owned())
}

impl SocksProxyConfig {
    pub fn parse(url: &str) -> anyhow::Result<Self> {
        let url = ::url::Url::parse(url).context("invalid proxy URL")?;
        if !matches!(url.scheme(), "socks5" | "socks5h") {
            anyhow::bail!("proxy URL should have socks5 or socks5h scheme");
        }
        let host = url.host_str().context("missing host")?;
        let port = url.port().context("missing port")?;
        let up = url
            .password()
            .map(|p| (decode_component(url.username()), decode_component(p)));
        Ok(Self {
            host: host.to_owned(),
            port,
            username_password: up,
        })
    }

    async fn connect(
        &self,
        addr: SocketAddr,
    ) -> tokio_socks::Result<(
        impl tokio::io::AsyncRead + Unpin + 'static,
        impl tokio::io::AsyncWrite + Unpin + 'static,
    )> {
        let proxy_addr = (self.host.as_str(), self.port);

        let stream = if let Some((username, password)) = self.username_password.as_ref() {
            tokio_socks::tcp::Socks5Stream::connect_with_password(
                proxy_addr,
                addr,
                username.as_str(),
                password.as_str(),
            )
            .await?
        } else {
            tokio_socks::tcp::Socks5Stream::connect(proxy_addr, addr).await?
        };

        Ok(tokio::io::split(stream))
    }
}

impl HttpProxyConfig {
    pub fn parse(url: &str) -> anyhow::Result<Self> {
        let url = ::url::Url::parse(url).context("invalid proxy URL")?;
        if url.scheme() != "http" {
            anyhow::bail!("proxy URL should have http scheme");
        }
        let host = url.host_str().context("missing host")?;
        let port = url.port().context("missing port")?;
        let up = url
            .password()
            .map(|p| (decode_component(url.username()), decode_component(p)));
        Ok(Self {
            host: host.to_owned(),
            port,
            username_password: up,
        })
    }

    async fn connect(&self, addr: SocketAddr) -> anyhow::Result<tokio::net::TcpStream> {
        let mut stream = tokio::net::TcpStream::connect((self.host.as_str(), self.port))
            .await
            .with_context(|| format!("error connecting to HTTP proxy {}:{}", self.host, self.port))?;
        let target = addr.to_string();
        let mut request = format!(
            "CONNECT {target} HTTP/1.1\r\nHost: {target}\r\nProxy-Connection: keep-alive\r\n"
        );
        if let Some((username, password)) = self.username_password.as_ref() {
            let credentials = base64::engine::general_purpose::STANDARD
                .encode(format!("{username}:{password}"));
            request.push_str(&format!("Proxy-Authorization: Basic {credentials}\r\n"));
        }
        request.push_str("\r\n");
        stream
            .write_all(request.as_bytes())
            .await
            .context("error writing HTTP CONNECT request")?;
        read_connect_response(&mut stream).await?;
        Ok(stream)
    }
}

impl ProxyConfig {
    pub fn parse(url: &str) -> anyhow::Result<Self> {
        let scheme = ::url::Url::parse(url)
            .context("invalid proxy URL")?
            .scheme()
            .to_owned();
        match scheme.as_str() {
            "socks5" | "socks5h" => Ok(Self::Socks(SocksProxyConfig::parse(url)?)),
            "http" => Ok(Self::Http(HttpProxyConfig::parse(url)?)),
            other => bail!("unsupported proxy scheme: {other}"),
        }
    }

    fn kind(&self) -> ConnectionKind {
        match self {
            Self::Socks(_) => ConnectionKind::Socks,
            Self::Http(_) => ConnectionKind::Http,
        }
    }

    async fn connect(&self, addr: SocketAddr) -> anyhow::Result<(BoxAsyncReadVectored, BoxAsyncWrite)> {
        match self {
            Self::Socks(config) => {
                let (r, w) = config.connect(addr).await?;
                Ok((Box::new(r.into_vectored_compat()), Box::new(w)))
            }
            Self::Http(config) => {
                let stream = config.connect(addr).await?;
                let (r, w) = stream.into_split();
                Ok((Box::new(r), Box::new(w)))
            }
        }
    }
}

async fn read_connect_response(stream: &mut tokio::net::TcpStream) -> anyhow::Result<()> {
    let mut buffer = Vec::with_capacity(1024);
    let mut chunk = [0u8; 512];
    loop {
        let read = stream
            .read(&mut chunk)
            .await
            .context("error reading HTTP proxy response")?;
        if read == 0 {
            bail!("HTTP proxy closed the connection during CONNECT");
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if buffer.len() > 16 * 1024 {
            bail!("HTTP proxy response is too large");
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
        Some(code) => bail!("HTTP proxy refused CONNECT with status {code}"),
        None => bail!("invalid HTTP proxy response: {status}"),
    }
}

gen_stats!(SingleStatAtomic SingleStatSnapshot, [
    attempts u64,
    successes u64,
    errors u64
], []);
gen_stats!(PerFamilyAtomic PerFamilySnapshot, [], [
    v4 SingleStatAtomic SingleStatSnapshot,
    v6 SingleStatAtomic SingleStatSnapshot
]);
gen_stats!(ConnectStatsAtomic ConnectStatsSnapshot, [], [
    socks PerFamilyAtomic PerFamilySnapshot,
    http PerFamilyAtomic PerFamilySnapshot,
    tcp PerFamilyAtomic PerFamilySnapshot,
    utp PerFamilyAtomic PerFamilySnapshot
]);

#[derive(Debug)]
pub(crate) struct StreamConnector {
    proxy_config: Option<ProxyConfig>,
    enable_tcp: bool,
    bind_device: Option<BindDevice>,
    utp_socket: Option<Arc<librqbit_utp::UtpSocketUdp>>,
    stats: ConnectStatsAtomic,
    ipv4_only: bool,
}

impl StreamConnector {
    pub async fn new(config: StreamConnectorArgs) -> anyhow::Result<Self> {
        #[allow(clippy::single_match)]
        match (
            config.proxy_config.is_some(),
            config.enable_tcp,
            config.utp_socket.is_some(),
        ) {
            (false, false, false) => {
                bail!("no way to connect to peers, enable TCP, uTP or a proxy")
            }
            _ => {
                // TODO: maybe validate other combinations. For now there's no way to disable TCP
            }
        }

        Ok(Self {
            proxy_config: config.proxy_config,
            enable_tcp: config.enable_tcp,
            utp_socket: config.utp_socket,
            bind_device: config.bind_device,
            stats: Default::default(),
            ipv4_only: config.ipv4_only,
        })
    }

    fn get_stat(&self, kind: ConnectionKind, is_v6: bool) -> &SingleStatAtomic {
        let stat = match kind {
            ConnectionKind::Tcp => &self.stats.tcp,
            ConnectionKind::Utp => &self.stats.utp,
            ConnectionKind::Socks => &self.stats.socks,
            ConnectionKind::Http => &self.stats.http,
        };
        if is_v6 { &stat.v6 } else { &stat.v4 }
    }

    async fn with_stat<R, E>(
        &self,
        kind: ConnectionKind,
        is_v6: bool,
        fut: impl Future<Output = std::result::Result<R, E>>,
    ) -> std::result::Result<R, E> {
        let stat = self.get_stat(kind, is_v6);
        stat.attempts(1);
        fut.await
            .inspect(|_| stat.successes(1))
            .inspect_err(|_| stat.errors(1))
    }

    async fn tcp_connect(
        &self,
        addr: SocketAddr,
    ) -> librqbit_dualstack_sockets::Result<tokio::net::TcpStream> {
        self.with_stat(
            ConnectionKind::Tcp,
            addr.is_ipv6(),
            librqbit_dualstack_sockets::tcp_connect(
                addr,
                ConnectOpts {
                    // Setting source port doesn't work with cloudflare warp on linux
                    // source_port: self.tcp_source_port,
                    source_port: None,
                    bind_device: self.bind_device.as_ref(),
                },
            ),
        )
        .await
    }

    pub fn stats(&self) -> &ConnectStatsAtomic {
        &self.stats
    }

    pub async fn connect(
        &self,
        addr: SocketAddr,
    ) -> Result<(ConnectionKind, BoxAsyncReadVectored, BoxAsyncWrite)> {
        if addr.port() == 0 {
            return Err(Error::Anyhow(anyhow::anyhow!(
                "invalid peer address (port 0): {}",
                addr
            )));
        }

        if self.ipv4_only && addr.is_ipv6() {
            return Err(Error::Anyhow(anyhow::anyhow!(
                "ipv6 disabled, skipping connection to {}",
                addr
            )));
        }

        if let Some(proxy) = self.proxy_config.as_ref() {
            let kind = proxy.kind();
            let (r, w) = self
                .with_stat(kind, addr.is_ipv6(), async {
                    proxy.connect(addr).await.map_err(Error::Anyhow)
                })
                .await?;
            debug!(?addr, ?kind, "connected through proxy");
            return Ok((kind, r, w));
        }

        // Try to connect over TCP first. If in 1 second we haven't connected, try uTP also (if configured).
        // Whoever connects first wins.
        let tcp_connect = async {
            if !self.enable_tcp {
                return Ok(None);
            }
            let conn = self.tcp_connect(addr).await?;
            debug!(?addr, "connected over TCP");
            Ok::<_, librqbit_dualstack_sockets::Error>(Some(conn))
        };

        let tcp_failed_notify = tokio::sync::Notify::new();

        let utp_connect = async {
            let sock = match self.utp_socket.as_ref() {
                Some(sock) => sock,
                None => return Ok(None),
            };

            // Give TCP priority as it's more mature and simpler.
            if self.enable_tcp {
                // wait until either 1 second has passed or TCP failed.
                tokio::select! {
                    _ = tcp_failed_notify.notified() => {},
                    _ = tokio::time::sleep(Duration::from_secs(1)) => {}
                }
            }

            let conn = self
                .with_stat(ConnectionKind::Utp, addr.is_ipv6(), sock.connect(addr))
                .await?;

            debug!(?addr, "connected over uTP");
            Ok(Some(conn))
        };

        tokio::pin!(tcp_connect);
        tokio::pin!(utp_connect);

        let mut tcp_err: Option<Option<librqbit_dualstack_sockets::Error>> = None;
        let mut utp_err: Option<Option<librqbit_utp::Error>> = None;

        // wait until all fail, or one succeeds.
        loop {
            if let (Some(tcp), Some(utp)) = (tcp_err.as_mut(), utp_err.as_mut()) {
                match (tcp.take(), utp.take()) {
                    (Some(tcp), Some(utp)) => return Err(Error::Connect { tcp, utp }),
                    (Some(tcp), None) => return Err(Error::TcpConnect(tcp)),
                    (None, Some(utp)) => return Err(Error::UtpConnect(utp)),
                    (None, None) => return Err(Error::ConnectDisabled),
                }
            }
            tokio::select! {
                tcp_res = &mut tcp_connect, if tcp_err.is_none() => {
                    match tcp_res {
                        Ok(Some(stream)) => {
                            let (r, w) = stream.into_split();
                            return Ok((ConnectionKind::Tcp, Box::new(r), Box::new(w)));
                        },
                        Ok(None) => {
                            tcp_err = Some(None);
                            tcp_failed_notify.notify_waiters();
                        }
                        Err(e) => {
                            tcp_err = Some(Some(e));
                            tcp_failed_notify.notify_waiters();
                        }
                    }
                },
                utp_res = &mut utp_connect, if utp_err.is_none() => {
                    match utp_res {
                        Ok(Some(stream)) => {
                            let (r, w) = stream.split();
                            return Ok((ConnectionKind::Utp, Box::new(r), Box::new(w)));
                        },
                        Ok(None) => {
                            utp_err = Some(None);
                        }
                        Err(e) => {
                            utp_err = Some(Some(e));
                        }
                    }
                },
            };
        }
    }
}
