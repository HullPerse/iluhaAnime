//! Watch Party transport (P2): length-prefixed JSON frames over iroh QUIC
//! bi-streams.
//!
//! Each peer connection uses a single bidirectional stream. The initiator
//! (guest) opens a bi-stream and writes `ClientMessage` frames on the send half;
//! the host accepts the bi-stream and writes `ServerMessage` frames on its send
//! half. Because both directions are independent QUIC streams, framing never
//! interleaves.
//!
//! Message delivery is reliable: every frame (heartbeats included) travels over
//! the reliability-guaranteed bi-stream, never a datagram.

use iroh::endpoint::{presets, RecvStream, SendStream};
use iroh::{Endpoint, EndpointAddr, RelayMode, TransportAddr};
use serde::Serialize;
use thiserror::Error;

use crate::session::protocol::{
    encode_frame, DecodedFrame, FrameDecoder, ProtocolError, MAX_FRAME_BYTES, PROTOCOL_VERSION,
};

/// ALPN advertised by every Watch Party endpoint.
pub const ALPN: &[u8] = b"iluhaanime/watchparty/1";
/// A peer is marked `Stale` after this long without a frame.
pub const LIVENESS_TIMEOUT_MS: u64 = 6_000;
/// A peer is dropped after this long without a frame.
pub const LIVENESS_GRACE_MS: u64 = 30_000;
/// Upper bound requested from a single `read_chunk` call.
pub const MAX_READ_CHUNK: usize = 64 * 1024;

/// Transport-level failures.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum TransportError {
    /// The peer finished or reset the stream.
    #[error("stream closed by peer")]
    Closed,
    /// The frame failed protocol validation (bad version, oversize, bad JSON).
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    /// The underlying QUIC stream reported an error.
    #[error("transport failure: {0}")]
    Failure(String),
}

/// Write half of a peer connection: serializes messages into framed bytes.
pub struct FrameSender {
    send: SendStream,
    next_seq: u64,
}

impl FrameSender {
    /// Wrap a QUIC send stream.
    pub fn new(send: SendStream) -> Self {
        Self { send, next_seq: 0 }
    }

    /// Serialize and send one message, returning the frame sequence number.
    ///
    /// Frames whose JSON payload exceeds [`MAX_FRAME_BYTES`] are rejected before
    /// any bytes reach the wire.
    pub async fn send<T: Serialize>(&mut self, message: &T) -> Result<u64, TransportError> {
        let seq = self.next_seq;
        let frame = encode_frame(message, seq);
        if frame.len() - 4 > MAX_FRAME_BYTES as usize {
            return Err(TransportError::Protocol(ProtocolError::FrameTooLarge));
        }
        self.send
            .write_all(&frame)
            .await
            .map_err(|error| TransportError::Failure(error.to_string()))?;
        self.next_seq += 1;
        Ok(seq)
    }

    /// Gracefully finish the send half.
    pub fn finish(&mut self) {
        let _ = self.send.finish();
    }
}

/// Read half of a peer connection: feeds bytes into the incremental decoder.
pub struct FrameReader {
    recv: RecvStream,
    decoder: FrameDecoder,
}

impl FrameReader {
    /// Wrap a QUIC receive stream.
    pub fn new(recv: RecvStream) -> Self {
        Self {
            recv,
            decoder: FrameDecoder::default(),
        }
    }

    /// Read the next complete frame, waiting for more bytes as needed.
    pub async fn recv(&mut self) -> Result<DecodedFrame, TransportError> {
        loop {
            if let Some(frame) = self.decoder.next(PROTOCOL_VERSION)? {
                return Ok(frame);
            }
            match self
                .recv
                .read_chunk(MAX_READ_CHUNK)
                .await
                .map_err(|error| TransportError::Failure(error.to_string()))?
            {
                Some(chunk) => self.decoder.feed(&chunk),
                None => return Err(TransportError::Closed),
            }
        }
    }
}

/// Split a QUIC bi-stream into a framed sender and reader.
pub fn channel(send: SendStream, recv: RecvStream) -> (FrameSender, FrameReader) {
    (FrameSender::new(send), FrameReader::new(recv))
}

/// Bind a production endpoint: public n0 relay servers + DNS discovery, with
/// [`ALPN`] accepted.
pub async fn bind_endpoint() -> Result<Endpoint, String> {
    Endpoint::builder(presets::N0)
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await
        .map_err(|error| error.to_string())
}

/// Bind a loopback-only endpoint with relay and discovery disabled.
///
/// Used by tests and the debug loopback harness so no external service is
/// required.
pub async fn bind_offline_endpoint() -> Result<Endpoint, String> {
    Endpoint::builder(presets::Minimal)
        .relay_mode(RelayMode::Disabled)
        .clear_ip_transports()
        .bind_addr("127.0.0.1:0")
        .map_err(|error| error.to_string())?
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await
        .map_err(|error| error.to_string())
}

/// A dialable address for a loopback-only endpoint (direct sockets only).
pub fn loopback_addr(endpoint: &Endpoint) -> EndpointAddr {
    EndpointAddr::from_parts(
        endpoint.id(),
        endpoint.bound_sockets().into_iter().map(TransportAddr::Ip),
    )
}

/// Current wall-clock time in milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::time::timeout;

    use super::*;
    use crate::session::protocol::{ClientMessage, ServerMessage};

    const TEST_TIMEOUT: Duration = Duration::from_secs(10);

    async fn offline_pair() -> (Endpoint, Endpoint) {
        let host = bind_offline_endpoint().await.expect("host endpoint");
        let guest = bind_offline_endpoint().await.expect("guest endpoint");
        (host, guest)
    }

    #[tokio::test]
    async fn frames_round_trip_over_a_bi_stream() {
        let result = timeout(TEST_TIMEOUT, async {
            let (host, guest) = offline_pair().await;
            let host_addr = loopback_addr(&host);

            let server = tokio::spawn(async move {
                let incoming = host.accept().await.expect("incoming");
                let connection = incoming.await.expect("connection");
                let (send, recv) = connection.accept_bi().await.expect("accept_bi");
                let (mut sender, mut reader) = channel(send, recv);

                let hello = reader
                    .recv()
                    .await
                    .expect("hello")
                    .client()
                    .expect("client");
                assert!(matches!(hello, ClientMessage::Hello { .. }));

                sender
                    .send(&ServerMessage::Roster { peers: vec![] })
                    .await
                    .expect("roster");
                sender.finish();
                tokio::time::sleep(Duration::from_millis(200)).await;
                drop(host);
            });

            let connection = guest.connect(host_addr, ALPN).await.expect("guest connect");
            let (send, recv) = connection.open_bi().await.expect("open_bi");
            let (mut sender, mut reader) = channel(send, recv);

            let seq = sender
                .send(&ClientMessage::Hello {
                    peer_id: "guest-1".into(),
                    display_name: "Guest".into(),
                    token: "tok-tok".into(),
                    anilist_user_id: None,
                    app_version: env!("CARGO_PKG_VERSION").into(),
                })
                .await
                .expect("send hello");
            assert_eq!(seq, 0);

            let frame = reader.recv().await.expect("frame");
            assert!(matches!(
                frame.server().expect("server message"),
                ServerMessage::Roster { .. }
            ));

            guest.close().await;
            server.await.expect("server task");
        })
        .await;

        result.expect("test must finish before the timeout");
    }

    #[tokio::test]
    async fn several_frames_survive_a_single_chunk() {
        let result = timeout(TEST_TIMEOUT, async {
            let (host, guest) = offline_pair().await;
            let host_addr = loopback_addr(&host);

            let server = tokio::spawn(async move {
                let incoming = host.accept().await.expect("incoming");
                let connection = incoming.await.expect("connection");
                let (send, recv) = connection.accept_bi().await.expect("accept_bi");
                let (mut sender, mut reader) = channel(send, recv);
                let mut texts = Vec::new();
                for _ in 0..3 {
                    let frame = reader.recv().await.expect("frame");
                    match frame.client().expect("client") {
                        ClientMessage::Chat { text, .. } => texts.push(text),
                        other => panic!("unexpected: {other:?}"),
                    }
                }
                assert_eq!(texts, vec!["a", "b", "c"]);
                sender.finish();
                drop(host);
            });

            let connection = guest.connect(host_addr, ALPN).await.expect("connect");
            let (send, recv) = connection.open_bi().await.expect("open");
            let (mut sender, _reader) = channel(send, recv);
            for text in ["a", "b", "c"] {
                sender
                    .send(&ClientMessage::Chat {
                        id: "m1".into(),
                        text: text.into(),
                        reply_to: None,
                        attachment: None,
                    })
                    .await
                    .expect("send chat");
            }
            sender.finish();

            server.await.expect("server");
            guest.close().await;
        })
        .await;

        result.expect("test must finish before the timeout");
    }

    #[tokio::test]
    async fn oversized_send_is_rejected_before_the_wire() {
        let result = timeout(TEST_TIMEOUT, async {
            let (host, guest) = offline_pair().await;
            let host_addr = loopback_addr(&host);

            let server = tokio::spawn(async move {
                let incoming = host.accept().await.expect("incoming");
                let connection = incoming.await.expect("connection");
                let (send, recv) = connection.accept_bi().await.expect("accept_bi");
                let (_sender, mut reader) = channel(send, recv);
                // The oversize frame is rejected on the sender, so the reader
                // only observes the stream ending cleanly.
                assert!(matches!(reader.recv().await, Err(TransportError::Closed)));
                drop(host);
            });

            let connection = guest.connect(host_addr, ALPN).await.expect("connect");
            let (send, recv) = connection.open_bi().await.expect("open");
            let (mut sender, _reader) = channel(send, recv);
            let huge = "x".repeat(MAX_FRAME_BYTES as usize);
            let error = sender
                .send(&ClientMessage::Chat {
                    id: "huge".into(),
                    text: huge,
                    reply_to: None,
                    attachment: None,
                })
                .await
                .expect_err("oversize must be rejected");
            assert_eq!(
                error,
                TransportError::Protocol(ProtocolError::FrameTooLarge)
            );
            sender.finish();

            server.await.expect("server");
            guest.close().await;
        })
        .await;

        result.expect("test must finish before the timeout");
    }

    #[test]
    fn liveness_constants_are_locked() {
        assert_eq!(LIVENESS_TIMEOUT_MS, 6_000);
        assert_eq!(LIVENESS_GRACE_MS, 30_000);
        assert_eq!(ALPN, b"iluhaanime/watchparty/1");
    }
}
