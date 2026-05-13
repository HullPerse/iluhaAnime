use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpSocket, TcpStream};
use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LobbyUser {
    pub id: String,
    pub username: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LobbyStateInfo {
    pub is_host: bool,
    pub users: Vec<LobbyUser>,
    pub ip: String,
    pub port: u16,
}

#[derive(Deserialize)]
struct IncomingMsg {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    msg_type: String,
    user_id: Option<String>,
    username: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct OutgoingMsg {
    #[serde(rename = "type")]
    msg_type: String,
    user: Option<LobbyUser>,
    user_id: Option<String>,
    users: Option<Vec<LobbyUser>>,
}

pub struct LobbyManager {
    running: Arc<AtomicBool>,
    state: Arc<Mutex<Option<LobbyStateInfo>>>,
    users: Arc<Mutex<Vec<LobbyUser>>>,
    peer_writers: Arc<Mutex<Vec<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>>,
    listener_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    _handle: AppHandle,
}

impl LobbyManager {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            state: Arc::new(Mutex::new(None)),
            users: Arc::new(Mutex::new(Vec::new())),
            peer_writers: Arc::new(Mutex::new(Vec::new())),
            listener_task: Arc::new(Mutex::new(None)),
            _handle: handle,
        }
    }

    pub async fn create_lobby(
        &self,
        app: AppHandle,
        port: u16,
        user_id: String,
        username: String,
    ) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("Already in a lobby".into());
        }

        let socket = TcpSocket::new_v4()
            .map_err(|e| format!("Failed to create socket: {e}"))?;
        socket
            .set_reuseaddr(true)
            .map_err(|e| format!("Failed to set socket option: {e}"))?;
        let addr: std::net::SocketAddr = format!("0.0.0.0:{port}")
            .parse()
            .map_err(|e| format!("Invalid address: {e}"))?;
        socket
            .bind(addr)
            .map_err(|e| format!("Failed to bind: {e}"))?;
        let listener = socket
            .listen(1024)
            .map_err(|e| format!("Failed to listen: {e}"))?;
        let local_addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to get address: {e}"))?;

        let host_user = LobbyUser {
            id: user_id,
            username,
        };

        {
            let mut u = self.users.lock().await;
            u.push(host_user.clone());
        }

        *self.state.lock().await = Some(LobbyStateInfo {
            is_host: true,
            users: vec![host_user.clone()],
            ip: local_addr.ip().to_string(),
            port: local_addr.port(),
        });

        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let users = self.users.clone();
        let state = self.state.clone();
        let peer_writers = self.peer_writers.clone();

        let handle = tokio::spawn(async move {
            loop {
                let accept = tokio::time::timeout(
                    std::time::Duration::from_secs(1),
                    listener.accept(),
                )
                .await;

                match accept {
                    Ok(Ok((socket, _addr))) => {
                        let users = users.clone();
                        let state = state.clone();
                        let app = app.clone();
                        let running = running.clone();
                        let peer_writers = peer_writers.clone();

                        tokio::spawn(async move {
                            if let Err(e) =
                                handle_client(socket, users, state, app, running, peer_writers).await
                            {
                                eprintln!("lobby client error: {e}");
                            }
                        });
                    }
                    Ok(Err(e)) => {
                        eprintln!("lobby accept error: {e}");
                    }
                    Err(_) => {
                        if !running.load(Ordering::SeqCst) {
                            break;
                        }
                    }
                }
            }
        });

        *self.listener_task.lock().await = Some(handle);

        Ok(())
    }

    pub async fn join_lobby(
        &self,
        app: AppHandle,
        ip: String,
        port: u16,
        user_id: String,
        username: String,
    ) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("Already in a lobby".into());
        }

        let stream = TcpStream::connect(format!("{ip}:{port}"))
            .await
            .map_err(|e| format!("Failed to connect: {e}"))?;
        let (reader, mut writer) = stream.into_split();

        let my_user = LobbyUser {
            id: user_id,
            username,
        };

        let join_msg = OutgoingMsg {
            msg_type: "join".to_string(),
            user: Some(my_user.clone()),
            user_id: None,
            users: None,
        };
        let mut buf = serde_json::to_vec(&join_msg).unwrap();
        buf.push(b'\n');
        writer
            .write_all(&buf)
            .await
            .map_err(|e| format!("Failed to send join: {e}"))?;

        *self.state.lock().await = Some(LobbyStateInfo {
            is_host: false,
            users: vec![my_user.clone()],
            ip: ip.clone(),
            port,
        });

        self.running.store(true, Ordering::SeqCst);

        {
            let mut u = self.users.lock().await;
            u.push(my_user);
        }

        let running = self.running.clone();
        let users = self.users.clone();
        let state = self.state.clone();

        tokio::spawn(async move {
            let mut reader = BufReader::new(reader);
            let mut line = String::new();

            loop {
                line.clear();
                let read = tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    reader.read_line(&mut line),
                )
                .await;

                match read {
                    Ok(Ok(0)) => break,
                    Ok(Ok(_)) => {
                        if let Ok(msg) = serde_json::from_str::<OutgoingMsg>(&line) {
                            match msg.msg_type.as_str() {
                                "user_list" => {
                                    if let Some(list) = msg.users {
                                        let mut u = users.lock().await;
                                        *u = list.clone();
                                        let _ = app.emit("lobby-users", &list);

                                        let mut s = state.lock().await;
                                        if let Some(ref mut s) = *s {
                                            s.users = list;
                                        }
                                    }
                                }
                                "user_joined" => {
                                    if let Some(user) = msg.user {
                                        println!("[lobby] user joined: {:?}", user);
                                        let _ = app.emit("lobby-user-joined", &user);
                                    }
                                }
                                "user_left" => {
                                    if let Some(uid) = msg.user_id {
                                        let mut u = users.lock().await;
                                        u.retain(|x| x.id != uid);
                                        let _ = app.emit("lobby-user-left", &uid);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("lobby read error: {e}");
                        break;
                    }
                    Err(_) => {
                        if !running.load(Ordering::SeqCst) {
                            break;
                        }
                    }
                }
            }

            running.store(false, Ordering::SeqCst);
            *state.lock().await = None;
            let _ = app.emit("lobby-disconnected", ());
        });

        Ok(())
    }

    pub async fn leave_lobby(&self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.listener_task.lock().await.take() {
            handle.abort();
        }
        *self.state.lock().await = None;
        self.users.lock().await.clear();
        self.peer_writers.lock().await.clear();
        Ok(())
    }

    pub async fn get_state(&self) -> Option<LobbyStateInfo> {
        self.state.lock().await.clone()
    }
}

async fn handle_client(
    socket: TcpStream,
    users: Arc<Mutex<Vec<LobbyUser>>>,
    state: Arc<Mutex<Option<LobbyStateInfo>>>,
    app: AppHandle,
    running: Arc<AtomicBool>,
    peer_writers: Arc<Mutex<Vec<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>>,
) -> Result<(), String> {
    let (reader, mut writer) = socket.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    let msg: IncomingMsg =
        serde_json::from_str(&line).map_err(|e| format!("Parse error: {e}"))?;

    let user = LobbyUser {
        id: msg.user_id.unwrap_or_default(),
        username: msg.username.unwrap_or_default(),
    };

    // Register writer for broadcasting
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    {
        let mut pw = peer_writers.lock().await;
        pw.push(tx);
    }

    // Add user
    {
        let mut u = users.lock().await;
        if !u.iter().any(|x| x.id == user.id) {
            u.push(user.clone());
        }
    }

    // Broadcast updated user list
    let list = users.lock().await.clone();
    let list_msg = OutgoingMsg {
        msg_type: "user_list".to_string(),
        user: None,
        user_id: None,
        users: Some(list),
    };
    let buf = serde_json::to_vec(&list_msg).unwrap();
    broadcast_to_peers(&peer_writers, &buf).await;

    // Update state
    {
        let mut s = state.lock().await;
        if let Some(ref mut s) = *s {
            s.users = users.lock().await.clone();
        }
    }

    let _ = app.emit("lobby-user-joined", &user);

    // Forward broadcasts to client socket
    let running_clone = running.clone();
    let fwd_handle = tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    // Read loop (keep alive / detect disconnect)
    loop {
        line.clear();
        let read = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            reader.read_line(&mut line),
        )
        .await;

        match read {
            Ok(Ok(0)) => break,
            Ok(Err(_)) => break,
            Err(_) => {
                if !running_clone.load(Ordering::SeqCst) {
                    break;
                }
            }
            Ok(Ok(_)) => {}
        }
    }

    // User disconnected — remove and broadcast
    {
        let mut u = users.lock().await;
        u.retain(|x| x.id != user.id);
    }

    let list = users.lock().await.clone();
    let left_msg = OutgoingMsg {
        msg_type: "user_list".to_string(),
        user: None,
        user_id: None,
        users: Some(list),
    };
    let buf = serde_json::to_vec(&left_msg).unwrap();
    broadcast_to_peers(&peer_writers, &buf).await;

    {
        let mut s = state.lock().await;
        if let Some(ref mut s) = *s {
            s.users = users.lock().await.clone();
        }
    }

    let _ = app.emit("lobby-user-left", &user.id);
    fwd_handle.abort();

    Ok(())
}

async fn broadcast_to_peers(
    peer_writers: &Arc<Mutex<Vec<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>>,
    data: &[u8],
) {
    let mut pw = peer_writers.lock().await;
    pw.retain(|tx| tx.send(data.to_vec()).is_ok());
}
