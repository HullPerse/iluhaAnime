use anyhow::{bail, Context};
use tokio::io::AsyncReadExt;

pub async fn read_connect_response(stream: &mut tokio::net::TcpStream) -> anyhow::Result<()> {
    let mut buffer = Vec::with_capacity(1024);
    loop {
        let byte = stream
            .read_u8()
            .await
            .context("error reading HTTP proxy response")?;
        // Read only the bounded header, leaving coalesced tunnel bytes in the socket.
        buffer.push(byte);
        if buffer.len() > 16 * 1024 {
            bail!("HTTP proxy response is too large");
        }
        if buffer.ends_with(b"\r\n\r\n") {
            break;
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
