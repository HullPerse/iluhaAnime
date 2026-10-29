use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadHalf, WriteHalf};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const PIPE_PREFIX: &str = r"\\?\pipe\discord-ipc-";
const PIPE_COUNT: u8 = 10;
const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

static NONCE: AtomicU64 = AtomicU64::new(1);

pub struct DiscordIpc {
    pipe: NamedPipeClient,
}

pub enum FrameEvent {
    Frame { opcode: u32, payload: Value },
    Closed(String),
}

pub struct DiscordConnection {
    writer: WriteHalf<NamedPipeClient>,
    pub frames: mpsc::Receiver<FrameEvent>,
    read_task: JoinHandle<()>,
}

impl DiscordIpc {
    pub async fn connect() -> Result<Self, String> {
        let mut last_error = String::new();
        for index in 0..PIPE_COUNT {
            let path = format!("{PIPE_PREFIX}{index}");
            match ClientOptions::new().open(&path) {
                Ok(pipe) => return Ok(Self { pipe }),
                Err(error) => last_error = format!("{path}: {error}"),
            }
        }
        Err(format!("no Discord IPC pipe found ({last_error})"))
    }

    pub async fn handshake(&mut self, client_id: &str) -> Result<(), String> {
        write_frame(
            &mut self.pipe,
            OP_HANDSHAKE,
            &json!({"v": 1, "client_id": client_id}),
        )
        .await?;
        loop {
            let (opcode, payload) = read_frame(&mut self.pipe).await?;
            match opcode {
                OP_FRAME if payload.get("evt").and_then(Value::as_str) == Some("READY") => {
                    return Ok(());
                }
                OP_PING => write_frame(&mut self.pipe, OP_PONG, &payload).await?,
                OP_CLOSE => {
                    return Err("Discord closed the IPC pipe during the handshake".to_string());
                }
                _ => {}
            }
        }
    }

    pub fn split(self) -> DiscordConnection {
        let (reader, writer) = tokio::io::split(self.pipe);
        let (tx, frames) = mpsc::channel(16);
        let read_task = tokio::spawn(read_loop(reader, tx));
        DiscordConnection {
            writer,
            frames,
            read_task,
        }
    }
}

impl DiscordConnection {
    pub async fn set_activity(&mut self, activity: Option<&Value>) -> Result<(), String> {
        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": activity,
            },
            "nonce": next_nonce(),
        });
        write_frame(&mut self.writer, OP_FRAME, &payload).await
    }

    pub async fn send_pong(&mut self, payload: &Value) -> Result<(), String> {
        write_frame(&mut self.writer, OP_PONG, payload).await
    }

    pub async fn close(&mut self) -> Result<(), String> {
        write_frame(&mut self.writer, OP_CLOSE, &json!({})).await
    }
}

impl Drop for DiscordConnection {
    fn drop(&mut self) {
        self.read_task.abort();
    }
}

async fn read_loop(mut reader: ReadHalf<NamedPipeClient>, tx: mpsc::Sender<FrameEvent>) {
    loop {
        match read_frame(&mut reader).await {
            Ok((opcode, payload)) => {
                if tx
                    .send(FrameEvent::Frame { opcode, payload })
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Err(error) => {
                let _ = tx.send(FrameEvent::Closed(error)).await;
                break;
            }
        }
    }
}

async fn write_frame<W>(writer: &mut W, opcode: u32, payload: &Value) -> Result<(), String>
where
    W: AsyncWrite + Unpin,
{
    let bytes =
        serde_json::to_vec(payload).map_err(|error| format!("encode Discord payload: {error}"))?;
    let frame = encode_frame(opcode, &bytes)?;
    writer
        .write_all(&frame)
        .await
        .map_err(|error| format!("write Discord frame: {error}"))
}

async fn read_frame<R>(reader: &mut R) -> Result<(u32, Value), String>
where
    R: AsyncRead + Unpin,
{
    let mut header = [0u8; 8];
    reader
        .read_exact(&mut header)
        .await
        .map_err(|error| format!("read Discord header: {error}"))?;
    let opcode = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let length = usize::try_from(u32::from_le_bytes([
        header[4], header[5], header[6], header[7],
    ]))
    .map_err(|_| "Discord frame length overflow".to_string())?;
    if length > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Discord frame is larger than {MAX_PAYLOAD_BYTES} bytes"
        ));
    }
    let mut payload = vec![0u8; length];
    if length > 0 {
        reader
            .read_exact(&mut payload)
            .await
            .map_err(|error| format!("read Discord payload: {error}"))?;
    }
    let value = if payload.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&payload)
            .map_err(|error| format!("decode Discord payload: {error}"))?
    };
    Ok((opcode, value))
}

fn encode_frame(opcode: u32, payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Discord frame is larger than {MAX_PAYLOAD_BYTES} bytes"
        ));
    }
    let length =
        u32::try_from(payload.len()).map_err(|_| "Discord frame length overflow".to_string())?;
    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.extend_from_slice(&opcode.to_le_bytes());
    frame.extend_from_slice(&length.to_le_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

fn next_nonce() -> String {
    let sequence = NONCE.fetch_add(1, Ordering::Relaxed);
    format!("{}-{sequence}", std::process::id())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_has_a_little_endian_header_and_one_payload() {
        let frame = encode_frame(OP_FRAME, b"{\"cmd\":\"SET_ACTIVITY\"}").expect("frame");
        assert_eq!(&frame[0..4], &[1, 0, 0, 0]);
        assert_eq!(&frame[4..8], &[22, 0, 0, 0]);
        assert_eq!(&frame[8..], b"{\"cmd\":\"SET_ACTIVITY\"}");
    }

    #[test]
    fn frame_rejects_oversized_payloads() {
        let payload = vec![0u8; MAX_PAYLOAD_BYTES + 1];
        assert!(encode_frame(OP_FRAME, &payload).is_err());
    }

    #[test]
    fn nonces_are_unique() {
        assert_ne!(next_nonce(), next_nonce());
    }
}
