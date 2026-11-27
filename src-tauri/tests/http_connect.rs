#[path = "../vendor/librqbit/src/stream_connect/http_connect.rs"]
mod http_connect;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

async fn response(bytes: Vec<u8>) -> TcpStream {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap())
        .await
        .unwrap();
    let (mut server, _) = listener.accept().await.unwrap();
    server.write_all(&bytes).await.unwrap();
    server.shutdown().await.unwrap();
    http_connect::read_connect_response(&mut client)
        .await
        .unwrap();
    client
}

#[tokio::test]
async fn connect_preserves_tunnel_bytes_sent_with_response_headers() {
    let mut client =
        response(b"HTTP/1.1 200 Connection established\r\n\r\npeer handshake".to_vec()).await;
    let mut payload = Vec::new();
    client.read_to_end(&mut payload).await.unwrap();
    assert_eq!(payload, b"peer handshake");
}

#[tokio::test]
async fn connect_rejects_oversized_headers_even_when_terminated() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap())
        .await
        .unwrap();
    let (mut server, _) = listener.accept().await.unwrap();
    let writer = tokio::spawn(async move {
        let mut bytes = b"HTTP/1.1 200 OK\r\nX: ".to_vec();
        bytes.resize(16 * 1024, b'x');
        bytes.extend_from_slice(b"\r\n\r\n");
        server.write_all(&bytes).await.unwrap();
    });
    let error = http_connect::read_connect_response(&mut client)
        .await
        .unwrap_err();
    assert!(error.to_string().contains("too large"));
    writer.await.unwrap();
}

#[tokio::test]
async fn connect_handles_fragmented_headers_and_rejects_refusal_or_truncation() {
    for bytes in [
        b"HTTP/1.1 200 OK\r\n\r\n".as_slice(),
        b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n",
        b"HTTP/1.1 200 OK\r\n",
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap())
            .await
            .unwrap();
        let (mut server, _) = listener.accept().await.unwrap();
        let writer = tokio::spawn(async move {
            for byte in bytes {
                server.write_all(&[*byte]).await.unwrap();
                tokio::task::yield_now().await;
            }
        });
        let result = http_connect::read_connect_response(&mut client).await;
        assert_eq!(result.is_ok(), bytes == b"HTTP/1.1 200 OK\r\n\r\n");
        writer.await.unwrap();
    }
}
