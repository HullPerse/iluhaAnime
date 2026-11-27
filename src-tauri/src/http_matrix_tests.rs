//! U3 reqwest migration matrix over local loopback fixtures.
//!
//! These tests bind 127.0.0.1 ephemeral ports only. They never contact an
//! external host, never read credentials and never touch system proxy
//! settings, so they stay inside the offline contract. Every client disables
//! system proxy explicitly (except the one under test) to stay deterministic.
//!
//! Covered: cookies, JSON, streaming bodies, total timeouts, same-scheme and
//! cross-scheme redirects, no-redirect clients, explicit proxy versus the
//! direct path, self-signed certificate handling with the staged-diagnosis
//! classifier, ALPN negotiation and the default retry policy's request count.

use std::fmt::Write as _;
use std::io;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine as _;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio_rustls::TlsAcceptor;

use crate::netdiag::{classify_http_error, classify_request_error};

const CA_CERTIFICATE_PEM: &str = include_str!("../tests/fixtures/tls/test-ca.cert.pem");
const SERVER_CERTIFICATE_PEM: &str = include_str!("../tests/fixtures/tls/localhost.cert.pem");
const SERVER_KEY_PEM: &str = include_str!("../tests/fixtures/tls/localhost.key.pem");

#[derive(Clone, Debug)]
struct RecordedRequest {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl RecordedRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[derive(Clone, Debug)]
struct FixtureResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    delay: Option<Duration>,
    close_delimited: bool,
}

impl FixtureResponse {
    fn ok(body: impl Into<Vec<u8>>) -> Self {
        Self {
            status: 200,
            headers: Vec::new(),
            body: body.into(),
            delay: None,
            close_delimited: false,
        }
    }

    fn status(status: u16) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: Vec::new(),
            delay: None,
            close_delimited: false,
        }
    }

    fn header(mut self, name: &str, value: impl Into<String>) -> Self {
        self.headers.push((name.to_owned(), value.into()));
        self
    }

    fn delay(mut self, delay: Duration) -> Self {
        self.delay = Some(delay);
        self
    }

    fn close_delimited(mut self) -> Self {
        self.close_delimited = true;
        self
    }
}

type Handler = Arc<dyn Fn(&RecordedRequest) -> FixtureResponse + Send + Sync>;

struct Fixture {
    origin: String,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    negotiated_alpn: Arc<Mutex<Vec<Option<String>>>>,
    task: JoinHandle<()>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl Fixture {
    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.origin)
    }

    fn requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().expect("fixture requests").clone()
    }

    fn negotiated_alpn(&self) -> Vec<Option<String>> {
        self.negotiated_alpn.lock().expect("fixture alpn").clone()
    }
}

fn pem_der(pem: &str, label: &str) -> Vec<u8> {
    let body: String = pem
        .lines()
        .skip_while(|line| !line.contains(label))
        .skip(1)
        .take_while(|line| !line.contains("-----END"))
        .collect();
    base64::engine::general_purpose::STANDARD
        .decode(body.as_bytes())
        .expect("fixture pem base64")
}

fn fixture_ca_der() -> Vec<u8> {
    pem_der(CA_CERTIFICATE_PEM, "BEGIN CERTIFICATE")
}

fn error_chain(error: &dyn std::error::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(next) = source {
        message.push_str(": ");
        message.push_str(&next.to_string());
        source = next.source();
    }
    message
}

fn install_crypto_provider() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
}

async fn spawn_plain(handler: Handler) -> Fixture {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture listener");
    let address = listener.local_addr().expect("fixture address");
    let requests: Arc<Mutex<Vec<RecordedRequest>>> = Arc::new(Mutex::new(Vec::new()));
    let negotiated_alpn = Arc::new(Mutex::new(Vec::new()));
    let shared = requests.clone();
    let task = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let handler = handler.clone();
            let records = shared.clone();
            tokio::spawn(async move {
                let _ = serve_connection(stream, handler, records).await;
            });
        }
    });
    Fixture {
        origin: format!("http://{address}"),
        requests,
        negotiated_alpn,
        task,
    }
}

async fn spawn_tls(handler: Handler, alpn: Vec<Vec<u8>>) -> Fixture {
    install_crypto_provider();
    let chain = vec![
        CertificateDer::from(pem_der(SERVER_CERTIFICATE_PEM, "BEGIN CERTIFICATE")),
        CertificateDer::from(fixture_ca_der()),
    ];
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(pem_der(
        SERVER_KEY_PEM,
        "BEGIN PRIVATE KEY",
    )));
    let mut config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(chain, key)
        .expect("fixture server config");
    config.alpn_protocols = alpn;
    let acceptor = TlsAcceptor::from(Arc::new(config));

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind tls fixture listener");
    let address = listener.local_addr().expect("tls fixture address");
    let requests: Arc<Mutex<Vec<RecordedRequest>>> = Arc::new(Mutex::new(Vec::new()));
    let negotiated_alpn: Arc<Mutex<Vec<Option<String>>>> = Arc::new(Mutex::new(Vec::new()));
    let shared = requests.clone();
    let shared_alpn = negotiated_alpn.clone();
    let task = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let acceptor = acceptor.clone();
            let handler = handler.clone();
            let records = shared.clone();
            let alpn_records = shared_alpn.clone();
            tokio::spawn(async move {
                let Ok(stream) = acceptor.accept(stream).await else {
                    return;
                };
                let negotiated = stream
                    .get_ref()
                    .1
                    .alpn_protocol()
                    .map(|bytes| String::from_utf8_lossy(bytes).into_owned());
                alpn_records.lock().expect("alpn records").push(negotiated);
                let _ = serve_connection(stream, handler, records).await;
            });
        }
    });
    Fixture {
        origin: format!("https://{address}"),
        requests,
        negotiated_alpn,
        task,
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        302 => "Found",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

fn headers_end(raw: &[u8]) -> Option<usize> {
    raw.windows(4).position(|window| window == b"\r\n\r\n")
}

async fn serve_connection<S>(
    mut stream: S,
    handler: Handler,
    records: Arc<Mutex<Vec<RecordedRequest>>>,
) -> io::Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let mut raw = Vec::new();
    let head_end = loop {
        if let Some(position) = headers_end(&raw) {
            break position;
        }
        let mut buffer = [0_u8; 1024];
        let read = stream.read(&mut buffer).await?;
        if read == 0 {
            return Ok(());
        }
        raw.extend_from_slice(&buffer[..read]);
        if raw.len() > 64 * 1024 {
            return Ok(());
        }
    };

    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next().unwrap_or_default().split_whitespace();
    let method = request_line.next().unwrap_or_default().to_owned();
    let target = request_line.next().unwrap_or_default().to_owned();
    let mut headers = Vec::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_owned(), value.trim().to_owned()));
        }
    }

    let mut body = raw[head_end + 4..].to_vec();
    let content_length = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    while body.len() < content_length {
        let mut buffer = [0_u8; 1024];
        let read = stream.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&buffer[..read]);
    }
    body.truncate(content_length);

    let request = RecordedRequest {
        method,
        target,
        headers,
        body,
    };
    records
        .lock()
        .expect("fixture records")
        .push(request.clone());

    let response = handler(&request);
    if let Some(delay) = response.delay {
        tokio::time::sleep(delay).await;
    }

    let mut head = format!(
        "HTTP/1.1 {} {}\r\n",
        response.status,
        reason(response.status)
    );
    for (name, value) in &response.headers {
        write!(head, "{name}: {value}\r\n").expect("write response header");
    }
    if !response.close_delimited {
        write!(head, "Content-Length: {}\r\n", response.body.len()).expect("write response length");
    }
    head.push_str("Connection: close\r\n\r\n");
    stream.write_all(head.as_bytes()).await?;

    if response.close_delimited {
        let piece = response.body.len().div_ceil(3).max(1);
        for chunk in response.body.chunks(piece) {
            stream.write_all(chunk).await?;
            stream.flush().await?;
        }
    } else {
        stream.write_all(&response.body).await?;
    }
    stream.flush().await?;
    stream.shutdown().await?;
    Ok(())
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("fixture client")
}

fn trusted_tls_client() -> reqwest::Client {
    let certificate = reqwest::Certificate::from_der(&fixture_ca_der()).expect("fixture ca");
    reqwest::Client::builder()
        .no_proxy()
        .tls_certs_only([certificate])
        .build()
        .expect("trusted fixture client")
}

#[tokio::test]
async fn cookie_store_replays_a_session_cookie_on_the_same_host() {
    let fixture = spawn_plain(Arc::new(|request| {
        if request.target == "/set" {
            FixtureResponse::ok("set").header("Set-Cookie", "sid=abc; Path=/")
        } else {
            FixtureResponse::ok("echo")
        }
    }))
    .await;
    let client = reqwest::Client::builder()
        .no_proxy()
        .cookie_store(true)
        .build()
        .expect("cookie client");

    client
        .get(fixture.url("/set"))
        .send()
        .await
        .expect("set cookie");
    client
        .get(fixture.url("/echo"))
        .send()
        .await
        .expect("echo cookie");

    let requests = fixture.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].target, "/echo");
    assert_eq!(requests[1].header("cookie"), Some("sid=abc"));
}

#[tokio::test]
async fn json_request_and_response_round_trip() {
    let fixture = spawn_plain(Arc::new(|request| {
        let payload: serde_json::Value =
            serde_json::from_slice(&request.body).expect("request json");
        FixtureResponse::ok(serde_json::json!({ "received": payload["answer"] }).to_string())
            .header("Content-Type", "application/json")
    }))
    .await;

    let value: serde_json::Value = client()
        .post(fixture.url("/json"))
        .json(&serde_json::json!({ "answer": 42 }))
        .send()
        .await
        .expect("json request")
        .json()
        .await
        .expect("json response");

    assert_eq!(value, serde_json::json!({ "received": 42 }));
    let requests = fixture.requests();
    assert_eq!(requests[0].header("content-type"), Some("application/json"));
}

#[tokio::test]
async fn query_and_form_encoding_match_the_wire_format() {
    let fixture = spawn_plain(Arc::new(|_| FixtureResponse::ok("ok"))).await;

    client()
        .get(fixture.url("/search"))
        .query(&[("q", "a b"), ("lang", "ru")])
        .send()
        .await
        .expect("query request");
    client()
        .post(fixture.url("/login"))
        .form(&[("login_username", "user name"), ("login", "Вход")])
        .send()
        .await
        .expect("form request");

    let requests = fixture.requests();
    assert_eq!(requests[0].method, "GET");
    assert_eq!(requests[1].method, "POST");
    assert_eq!(requests[0].target, "/search?q=a+b&lang=ru");
    assert_eq!(
        requests[1].header("content-type"),
        Some("application/x-www-form-urlencoded")
    );
    assert_eq!(
        String::from_utf8_lossy(&requests[1].body),
        "login_username=user+name&login=%D0%92%D1%85%D0%BE%D0%B4"
    );
}

#[tokio::test]
async fn streaming_body_is_delivered_without_a_content_length() {
    use futures::StreamExt as _;

    let expected = "streamed-payload-".repeat(40);
    let fixture = spawn_plain(Arc::new({
        let expected = expected.clone();
        move |_| {
            FixtureResponse::ok(expected.clone())
                .header("Content-Type", "application/octet-stream")
                .close_delimited()
        }
    }))
    .await;

    let response = client()
        .get(fixture.url("/stream"))
        .send()
        .await
        .expect("stream request");
    assert!(response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .is_none());

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        body.extend_from_slice(&chunk.expect("stream chunk"));
    }

    assert_eq!(String::from_utf8_lossy(&body), expected);
}

#[tokio::test]
async fn total_timeout_is_exceeded_by_a_slow_response() {
    let fixture = spawn_plain(Arc::new(|_| {
        FixtureResponse::ok("late").delay(Duration::from_millis(600))
    }))
    .await;

    let error = client()
        .get(fixture.url("/slow"))
        .timeout(Duration::from_millis(150))
        .send()
        .await
        .expect_err("slow response must time out");

    assert!(error.is_timeout(), "{error}");
    assert_eq!(classify_http_error(&error), "tcp");
}

#[tokio::test]
async fn same_scheme_redirect_preserves_manual_cookie_and_authorization() {
    let fixture = spawn_plain(Arc::new(|request| {
        if request.target == "/start" {
            FixtureResponse::status(302).header("Location", "/final")
        } else {
            FixtureResponse::ok("final")
        }
    }))
    .await;

    let response = client()
        .get(fixture.url("/start"))
        .header("Cookie", "manual=1")
        .header("Authorization", "Bearer token")
        .send()
        .await
        .expect("redirect request");
    assert_eq!(response.status(), reqwest::StatusCode::OK);

    let requests = fixture.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].target, "/final");
    assert_eq!(requests[1].header("cookie"), Some("manual=1"));
    assert_eq!(requests[1].header("authorization"), Some("Bearer token"));
}

#[tokio::test]
async fn cross_scheme_redirect_strips_cookie_and_authorization() {
    let plain = spawn_plain(Arc::new(|_| FixtureResponse::ok("plain"))).await;
    let location = plain.url("/final");
    let secure = spawn_tls(
        Arc::new(move |_| FixtureResponse::status(302).header("Location", location.clone())),
        Vec::new(),
    )
    .await;

    let response = trusted_tls_client()
        .get(secure.url("/start"))
        .header("Cookie", "manual=1")
        .header("Authorization", "Bearer token")
        .send()
        .await
        .expect("cross-scheme redirect");
    assert_eq!(response.status(), reqwest::StatusCode::OK);

    let requests = plain.requests();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].target, "/final");
    assert_eq!(requests[0].header("cookie"), None);
    assert_eq!(requests[0].header("authorization"), None);
}

#[tokio::test]
async fn no_redirect_client_returns_the_redirect_response() {
    let fixture = spawn_plain(Arc::new(|_| {
        FixtureResponse::status(302).header("Location", "/final")
    }))
    .await;

    let response = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("no-redirect client")
        .get(fixture.url("/start"))
        .send()
        .await
        .expect("no-redirect request");

    assert_eq!(response.status(), reqwest::StatusCode::FOUND);
    assert_eq!(fixture.requests().len(), 1);
}

#[tokio::test]
async fn explicit_proxy_receives_absolute_form_and_direct_client_bypasses_it() {
    let proxy = spawn_plain(Arc::new(|_| FixtureResponse::ok("proxied"))).await;
    let proxy_url = proxy.origin.clone();
    let origin = spawn_plain(Arc::new(|_| FixtureResponse::ok("direct"))).await;

    let proxied = reqwest::Client::builder()
        .proxy(reqwest::Proxy::all(&proxy_url).expect("proxy url"))
        .build()
        .expect("proxy client")
        .get("http://fixture.example/path?x=1")
        .send()
        .await
        .expect("proxied request");
    assert_eq!(proxied.text().await.expect("proxy body"), "proxied");

    let proxy_requests = proxy.requests();
    assert_eq!(proxy_requests.len(), 1);
    assert_eq!(proxy_requests[0].target, "http://fixture.example/path?x=1");

    client()
        .get(origin.url("/direct"))
        .send()
        .await
        .expect("direct request");

    assert_eq!(proxy.requests().len(), 1);
    assert_eq!(origin.requests().len(), 1);
}

#[tokio::test]
async fn self_signed_certificate_is_rejected_by_default_and_trusted_when_pinned() {
    let fixture = spawn_tls(Arc::new(|_| FixtureResponse::ok("secure")), Vec::new()).await;

    let error = client()
        .get(fixture.url("/"))
        .send()
        .await
        .expect_err("untrusted certificate must be rejected");
    let chain = error_chain(&error);
    assert_eq!(classify_request_error(&chain), "tls", "{chain}");
    assert_eq!(classify_http_error(&error), "tls");
    assert!(fixture.requests().is_empty());

    let body = trusted_tls_client()
        .get(fixture.url("/"))
        .send()
        .await
        .expect("pinned certificate request")
        .text()
        .await
        .expect("secure body");
    assert_eq!(body, "secure");
    assert_eq!(fixture.requests().len(), 1);
}

#[tokio::test]
async fn default_client_offers_http2_over_alpn_and_http1_only_clients_fail_against_h2() {
    let fixture = spawn_tls(
        Arc::new(|_| FixtureResponse::ok("never")),
        vec![b"h2".to_vec()],
    )
    .await;

    let _ = trusted_tls_client().get(fixture.url("/")).send().await;
    assert_eq!(
        fixture.negotiated_alpn(),
        vec![Some("h2".to_owned())],
        "the rustls default client must advertise h2"
    );

    let http1 = reqwest::Client::builder()
        .no_proxy()
        .http1_only()
        .build()
        .expect("http1 client");
    assert!(
        http1.get(fixture.url("/")).send().await.is_err(),
        "an HTTP/1.1-only client cannot complete an h2-only handshake"
    );
}

#[tokio::test]
async fn default_retry_policy_does_not_duplicate_successful_or_5xx_requests() {
    let fixture = spawn_plain(Arc::new(|request| {
        if request.target == "/unavailable" {
            FixtureResponse::status(503).header("Retry-After", "1")
        } else {
            FixtureResponse::ok("ok")
        }
    }))
    .await;

    let client = client();
    client
        .get(fixture.url("/ok"))
        .send()
        .await
        .expect("ok request");
    let unavailable = client
        .get(fixture.url("/unavailable"))
        .send()
        .await
        .expect("503 request");
    assert_eq!(
        unavailable.status(),
        reqwest::StatusCode::SERVICE_UNAVAILABLE
    );

    let requests = fixture.requests();
    assert_eq!(requests.len(), 2, "no transparent retry for status codes");
    assert_eq!(requests[0].target, "/ok");
    assert_eq!(requests[1].target, "/unavailable");
}
