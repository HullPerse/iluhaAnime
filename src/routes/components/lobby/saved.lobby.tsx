import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { SignalBars } from "@/components/shared/signalBars.component";
import { useSavedProbes } from "@/hooks/session/probe.hook";
import { useConnectionsStore } from "@/store/connections.store";
import { useI18n } from "@/hooks/i18n.hook";
import type { SavedLobbyProps } from "@/types/lobby";

export default function SavedLobby({ onUse }: SavedLobbyProps) {
  const { t } = useI18n();
  const connections = useConnectionsStore((s) => s.connections);
  const remove = useConnectionsStore((s) => s.remove);
  const rename = useConnectionsStore((s) => s.rename);
  const probes = useSavedProbes(connections);
  const [editing, setEditing] = useState<{ endpointId: string; name: string } | null>(null);

  if (connections.length === 0) return null;

  return (
    <aside className="hidden md:block h-full w-64 bg-surface p-2 windows95-border">
      <h2 className="windows95-text text-sm mb-2">{t("lobby.saved.title")}</h2>
      <ul className="flex flex-col gap-2">
        {connections.map((connection) => {
          const probe = probes.data?.[connection.endpointId];
          const checking = probes.isFetching;
          const online = probe?.online;
          return (
            <li key={connection.endpointId} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title={t("lobby.saved.use")}
                  className="windows95-border bg-field px-1 hover:bg-surface"
                  onClick={() => onUse(connection)}
                >
                  <KeyRound className="size-4" />
                </button>
                <button
                  type="button"
                  title={t("lobby.saved.rename")}
                  className="windows95-border bg-field px-1 hover:bg-surface"
                  onClick={() =>
                    setEditing({ endpointId: connection.endpointId, name: connection.name })
                  }
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  title={t("lobby.saved.remove")}
                  className="windows95-border bg-field px-1 hover:bg-surface"
                  onClick={() => remove(connection.endpointId)}
                >
                  <Trash2 className="size-4" />
                </button>
                {editing?.endpointId === connection.endpointId ? (
                  <input
                    autoFocus
                    className="windows95-border windows95-text text-sm bg-field flex-1 px-1"
                    value={editing.name}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, name: event.target.value } : null
                      )
                    }
                    onBlur={() => {
                      rename(connection.endpointId, editing.name);
                      setEditing(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        rename(connection.endpointId, editing.name);
                        setEditing(null);
                      } else if (event.key === "Escape") {
                        setEditing(null);
                      }
                    }}
                  />
                ) : (
                  <span className="windows95-text text-sm">{connection.name}</span>
                )}
              </div>
              <span className="windows95-text text-xs text-muted">{connection.nick}</span>
              <div className="flex items-center gap-2">
                <SignalBars rttMs={probe?.rttMs} checking={checking} />
                <span
                  className={
                    probe === undefined
                      ? "windows95-text text-xs text-hint"
                      : online
                        ? "windows95-text text-xs text-success"
                        : "windows95-text text-xs text-destructive"
                  }
                >
                  {probe === undefined
                    ? t("lobby.saved.unknown")
                    : online
                      ? t("lobby.saved.online")
                      : t("lobby.saved.offline")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}