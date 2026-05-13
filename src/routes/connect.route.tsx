import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { LobbyStateInfo, LobbyUser } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import Lobby from "@/components/shared/lobby.component";

const DEFAULT_PORT = 42069;

function ConnectRoute() {
  const [state, setState] = useState<LobbyStateInfo | null>(null);
  const [myId] = useState(() => crypto.randomUUID());
  const [myUsername, setMyUsername] = useState(
    () => localStorage.getItem("lobbyUsername") || "",
  );
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("lobbyState");
    if (saved) {
      invoke<LobbyStateInfo | null>("get_lobby_state")
        .then((s) => {
          if (s) setState(s);
          else localStorage.removeItem("lobbyState");
        })
        .catch(() => localStorage.removeItem("lobbyState"));
    }
  }, []);

  useEffect(() => {
    const unlistens: (() => void)[] = [];

    listen<LobbyUser[]>("lobby-users", (event) => {
      setState((prev) => (prev ? { ...prev, users: event.payload } : null));
    }).then((u) => unlistens.push(u));

    listen<LobbyUser>("lobby-user-joined", (event) => {
      console.log("[lobby] user joined:", event.payload);
      setState((prev) => {
        if (!prev || prev.users.some((u) => u.id === event.payload.id))
          return prev;
        return { ...prev, users: [...prev.users, event.payload] };
      });
    }).then((u) => unlistens.push(u));

    listen<string>("lobby-user-left", (event) => {
      console.log("[lobby] user left:", event.payload);
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.filter((u) => u.id !== event.payload),
        };
      });
    }).then((u) => unlistens.push(u));

    listen("lobby-disconnected", () => {
      setState(null);
      localStorage.removeItem("lobbyState");
    }).then((u) => unlistens.push(u));

    return () => {
      unlistens.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("lobbyUsername", myUsername);
  }, [myUsername]);

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const portNum = parseInt(port, 10) || DEFAULT_PORT;
      await invoke("create_lobby", {
        port: portNum,
        userId: myId,
        username: myUsername || myId,
      });
      setState({
        is_host: true,
        users: [{ id: myId, username: myUsername || myId }],
        ip: ip || "127.0.0.1",
        port: portNum,
      });
      localStorage.setItem(
        "lobbyState",
        JSON.stringify({ ip: ip || "127.0.0.1", port: portNum }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setError("");
    try {
      const portNum = parseInt(port, 10) || DEFAULT_PORT;
      await invoke("join_lobby", {
        ip,
        port: portNum,
        userId: myId,
        username: myUsername || myId,
      });
      setState({
        is_host: false,
        users: [{ id: myId, username: myUsername || myId }],
        ip,
        port: portNum,
      });
      localStorage.setItem("lobbyState", JSON.stringify({ ip, port: portNum }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    await invoke("leave_lobby");
    setState(null);
    localStorage.removeItem("lobbyState");
  };

  if (state) {
    return <Lobby state={state} onLeave={handleLeave} id={myId} />;
  }

  return (
    <main className="flex flex-col items-center h-full gap-1">
      <section className="flex flex-col leading-tight w-full">
        <span className="windows95-text">Имя пользователя</span>
        <Input
          type="text"
          placeholder="*Необязательное поле*"
          className="font-bold"
          value={myUsername}
          onChange={(e) => setMyUsername(e.currentTarget.value)}
        />
      </section>
      <section className="flex flex-col leading-tight w-full">
        <span className="windows95-text">IP</span>
        <Input
          type="text"
          placeholder="Адрес хоста"
          className="font-bold"
          value={ip}
          onChange={(e) => setIp(e.currentTarget.value)}
        />
      </section>
      <section className="flex flex-col leading-tight w-full">
        <span className="windows95-text">Порт</span>
        <Input
          type="number"
          placeholder="42069"
          className="font-bold"
          value={port}
          onChange={(e) => setPort(e.currentTarget.value)}
        />
      </section>

      {error && <div className="text-red-500 text-sm">{error}</div>}

      <section className="flex flex-row gap-1 items-center justify-end mt-auto border-t-2 border-muted p-1 w-full">
        <Button disabled={!ip || loading} onClick={handleJoin}>
          Присоединиться
        </Button>
        <Button disabled={loading} onClick={handleCreate}>
          Создать
        </Button>
      </section>
    </main>
  );
}

export default ConnectRoute;
