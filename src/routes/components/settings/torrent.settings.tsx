import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useTorrentStore } from "@/store/download.store";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export default function SettingsTorrent() {
  const {
    dlLimit,
    ulLimit,
    notificationsEnabled,
    notifyOnComplete,
    notifyOnError,
    fastresumeEnabled,
    disablePersistence,
    patch,
  } = useSettingsStore();
  const setSpeedLimits = useTorrentStore((s) => s.setSpeedLimits);

  const saveSessionConfig = useCallback(
    (partial: Partial<{ fastresumeEnabled: boolean; disablePersistence: boolean }>) => {
      const current = { fastresumeEnabled, disablePersistence, ...partial };
      invoke("save_session_config", {
        config: {
          fastresume: current.fastresumeEnabled,
          ipv4Only: false,
          peerConnectTimeout: 30,
          peerReadWriteTimeout: 30,
          listenPort: 0,
          enableUpnp: false,
          disablePersistence: current.disablePersistence,
        },
      }).catch(() => {});
    },
    [fastresumeEnabled, disablePersistence],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted font-bold w-full">
        Лимиты скорости
      </p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Лимит загрузки (КБ/с)</span>
        <Input
          type="number"
          min={0}
          value={dlLimit ?? ""}
          placeholder="Нет лимита"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            patch({ dlLimit: v });
            setSpeedLimits(v, ulLimit);
          }}
          className="w-20"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Лимит отдачи (КБ/с)</span>
        <Input
          type="number"
          min={0}
          value={ulLimit ?? ""}
          placeholder="Нет лимита"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            patch({ ulLimit: v });
            setSpeedLimits(dlLimit, v);
          }}
          className="w-20"
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">Сохранение сессии торрента</p>
      <span className="text-[10px] text-muted windows95-font">Управление быстрым восстановлением и сохранением состояния загрузки</span>

      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={fastresumeEnabled}
          onChange={(v) => {
            patch({ fastresumeEnabled: v });
            saveSessionConfig({ fastresumeEnabled: v });
          }}
        />
        <span>Fastresume (быстрое восстановление)</span>
      </label>

      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
        <Checkbox
          checked={disablePersistence}
          onChange={(v) => {
            patch({ disablePersistence: v });
            saveSessionConfig({ disablePersistence: v });
          }}
        />
        <span>Отключить персистентность сессии</span>
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">Уведомления</p>

        <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
          <Checkbox
            checked={notificationsEnabled}
            onChange={(v) => patch({ notificationsEnabled: v })}
          />
          <span>Включить уведомления</span>
        </label>

        <label className="flex items-center gap-2 windows95-text text-text pl-4 cursor-pointer select-none">
          <Checkbox
            checked={notifyOnComplete}
            disabled={!notificationsEnabled}
            onChange={(v) => patch({ notifyOnComplete: v })}
          />
          <span>При завершении загрузки</span>
        </label>

        <label className="flex items-center gap-2 windows95-text text-text pl-4 cursor-pointer select-none">
          <Checkbox
            checked={notifyOnError}
            disabled={!notificationsEnabled}
            onChange={(v) => patch({ notifyOnError: v })}
          />
          <span>При ошибке</span>
        </label>
    </div>
  );
}
