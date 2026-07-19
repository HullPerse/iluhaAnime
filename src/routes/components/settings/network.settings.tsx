import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export default function SettingsNetwork() {
  const {
    httpApiPort,
    ipv4Only,
    peerConnectTimeout,
    peerReadWriteTimeout,
    listenPort,
    enableUpnp,
    enableMdns,
    patch,
  } = useSettingsStore();

  const saveSessionConfig = useCallback(
    (partial: Partial<{
      httpApiPort: number;
      ipv4Only: boolean;
      peerConnectTimeout: number;
      peerReadWriteTimeout: number;
      listenPort: number;
      enableUpnp: boolean;
      enableMdns: boolean;
    }>) => {
      const current = {
        httpApiPort,
        ipv4Only,
        peerConnectTimeout,
        peerReadWriteTimeout,
        listenPort,
        enableUpnp,
        enableMdns,
        ...partial,
      };
      invoke("save_session_config", {
        config: {
          ipv4Only: current.ipv4Only,
          peerConnectTimeout: current.peerConnectTimeout,
          peerReadWriteTimeout: current.peerReadWriteTimeout,
          listenPort: current.listenPort,
          enableUpnp: current.enableUpnp,
        },
      }).catch(() => {});
    },
    [
      httpApiPort,
      ipv4Only,
      peerConnectTimeout,
      peerReadWriteTimeout,
      listenPort,
      enableUpnp,
      enableMdns,
    ],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted font-bold w-full">
        HTTP API
      </p>
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Порт HTTP API</span>
        <Input
          type="number"
          min={1}
          max={65535}
          value={httpApiPort}
          placeholder="11200"
          onChange={(e) => {
            const v = Number(e.target.value) || 11200;
            patch({ httpApiPort: v });
          }}
          className="w-20"
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">
        Соединения
      </p>
      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={ipv4Only}
          onChange={(v) => {
            patch({ ipv4Only: v });
            saveSessionConfig({ ipv4Only: v });
          }}
        />
        <span>Только IPv4</span>
      </label>
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Порт прослушивания</span>
        <Input
          type="number"
          min={0}
          max={65535}
          value={listenPort || ""}
          placeholder="0 (случайный)"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : 0;
            patch({ listenPort: v });
            saveSessionConfig({ listenPort: v });
          }}
          className="w-20"
        />
      </label>
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Таймаут подключения (сек)</span>
        <Input
          type="number"
          min={1}
          value={peerConnectTimeout}
          onChange={(e) => {
            const v = Number(e.target.value) || 30;
            patch({ peerConnectTimeout: v });
            saveSessionConfig({ peerConnectTimeout: v });
          }}
          className="w-20"
        />
      </label>
      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Таймаут чтения/записи (сек)</span>
        <Input
          type="number"
          min={1}
          value={peerReadWriteTimeout}
          onChange={(e) => {
            const v = Number(e.target.value) || 30;
            patch({ peerReadWriteTimeout: v });
            saveSessionConfig({ peerReadWriteTimeout: v });
          }}
          className="w-20"
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">
        Обнаружение
      </p>
      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={enableUpnp}
          onChange={(v) => {
            patch({ enableUpnp: v });
            saveSessionConfig({ enableUpnp: v });
          }}
        />
        <span>UPnP (проброс портов)</span>
      </label>
      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={enableMdns}
          onChange={(v) => {
            patch({ enableMdns: v });
          }}
        />
        <span>mDNS (локальное обнаружение)</span>
      </label>

    </div>
  );
}
