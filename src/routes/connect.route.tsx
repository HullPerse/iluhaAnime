import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { Connection } from "@/types";
import { useState } from "react";

function ConnectRoute() {
  const [connection, setConnection] = useState<Connection | null>(null);

  const [username, setUsername] = useState<string>("");
  const [ip, setIp] = useState<string>("");

  return (
    <main className="flex flex-col items-center h-full gap-1">
      <section className="flex flex-col leading-tight w-full">
        <span className="windows95-text">Имя пользователя</span>
        <Input
          type="text"
          placeholder="*Необязательное поле*"
          className="font-bold"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
        />
      </section>
      <section className="flex flex-col leading-tight w-full">
        <span className="windows95-text">IP</span>
        <Input
          type="text"
          placeholder="Адрес хоста"
          className="font-bold"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
        />
      </section>

      <section className="flex flex-row gap-1 items-center justify-end mt-auto border-t-2 border-muted p-1 w-full">
        <Button disabled={!ip}>Присоединиться</Button>
        <Button>Создать</Button>
      </section>
    </main>
  );
}

export default ConnectRoute;
