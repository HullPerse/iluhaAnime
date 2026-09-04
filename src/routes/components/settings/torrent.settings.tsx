import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { toSessionConfig } from "@/lib/session.utils";
import type { SessionConfigPayload } from "@/lib/session.utils";
import { useTorrentStore } from "@/store/download.store";
import { useSettingsStore } from "@/store/settings.store";

export default function SettingsTorrent() {
  const {
    dlLimit,
    ulLimit,
    notificationsEnabled,
    notifyOnComplete,
    notifyOnError,
    fastresumeEnabled,
    disablePersistence,
    resultsPerPage,
    patch,
  } = useSettingsStore();
  const setSpeedLimits = useTorrentStore((s) => s.setSpeedLimits);
  const { t } = useI18n();

  const saveSessionConfig = useCallback(
    (partial: Partial<Pick<SessionConfigPayload, "fastresume" | "disablePersistence">>) => {
      invoke("save_session_config", {
        config: { ...toSessionConfig(), ...partial },
      }).catch(() => {});
    },
    []
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-hint w-full font-bold">
        {t("settings.torrent.speed.limits")}
      </p>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.torrent.dl.limit")}</span>
        <Input
          type="number"
          min={0}
          value={dlLimit ?? ""}
          placeholder={t("settings.torrent.no.limit")}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            patch({ dlLimit: v });
            setSpeedLimits(v, ulLimit);
          }}
          className="w-20"
        />
      </label>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.torrent.ul.limit")}</span>
        <Input
          type="number"
          min={0}
          value={ulLimit ?? ""}
          placeholder={t("settings.torrent.no.limit")}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            patch({ ulLimit: v });
            setSpeedLimits(dlLimit, v);
          }}
          className="w-20"
        />
      </label>

      <hr className="border-muted my-1 w-full border-t" />

      <p className="windows95-text text-hint w-full font-bold">{t("settings.torrent.session")}</p>
      <span className="text-hint windows95-font text-xs">{t("settings.torrent.session.hint")}</span>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={fastresumeEnabled}
          onChange={(v) => {
            patch({ fastresumeEnabled: v });
            saveSessionConfig({ fastresume: v });
          }}
        />
        <span>{t("settings.torrent.fastresume")}</span>
      </label>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={disablePersistence}
          onChange={(v) => {
            patch({ disablePersistence: v });
            saveSessionConfig({ disablePersistence: v });
          }}
        />
        <span>{t("settings.torrent.disable.persistence")}</span>
      </label>

      <hr className="border-muted my-1 w-full border-t" />

      <p className="windows95-text text-hint w-full font-bold">
        {t("settings.torrent.notifications")}
      </p>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={notificationsEnabled}
          onChange={(v) => patch({ notificationsEnabled: v })}
        />
        <span>{t("settings.torrent.enable.notifications")}</span>
      </label>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
        <Checkbox
          checked={notifyOnComplete}
          disabled={!notificationsEnabled}
          onChange={(v) => patch({ notifyOnComplete: v })}
        />
        <span>{t("settings.torrent.on.complete")}</span>
      </label>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
        <Checkbox
          checked={notifyOnError}
          disabled={!notificationsEnabled}
          onChange={(v) => patch({ notifyOnError: v })}
        />
        <span>{t("settings.torrent.on.error")}</span>
      </label>

      <hr className="border-muted my-1 w-full border-t" />

      <p className="windows95-text text-hint w-full font-bold">{t("settings.torrent.search")}</p>

      <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
        <span className="windows95-text text-text text-xs font-bold">
          {t("settings.torrent.results.per.page")}
        </span>
        <div className="flex flex-col gap-0.5">
          <Input
            type="number"
            min={5}
            max={100}
            value={resultsPerPage}
            onChange={(e) => patch({ resultsPerPage: Number(e.target.value) })}
            className="w-16"
          />
          <span className="text-hint text-[12px]">{t("settings.torrent.results.per.page.hint")}</span>
        </div>
      </div>
    </div>
  );
}
