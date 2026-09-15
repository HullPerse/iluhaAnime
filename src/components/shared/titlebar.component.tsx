import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";

const CONTROL_CLASS = "relative h-5 w-5";
const CONTROL_ICON_CLASS = "size-2.5";

function run(action: Promise<unknown>, scope: string) {
  action.catch((error) => reportBackgroundError(scope, error));
}

function startsOnControl(target: EventTarget | null) {
  return target instanceof Element && target.closest("button, [data-no-drag]") !== null;
}

export default function TitleBar({ title, children }: { title: string; children?: ReactNode }) {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const syncMaximized = () => {
      appWindow
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch((error) => reportBackgroundError("titlebar.maximized", error));
    };

    syncMaximized();
    appWindow
      .onResized(syncMaximized)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => reportBackgroundError("titlebar.resized", error));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const toggleMaximize = () => {
    run(getCurrentWindow().toggleMaximize(), "titlebar.toggleMaximize");
  };

  const maximizeLabel = maximized ? t("window.restore") : t("window.maximize");

  return (
    <div
      className="ui-titlebar justify-between select-none"
      onMouseDown={(event) => {
        if (event.button !== 0 || startsOnControl(event.target)) return;
        run(getCurrentWindow().startDragging(), "titlebar.drag");
      }}
      onDoubleClick={(event) => {
        if (startsOnControl(event.target)) return;
        toggleMaximize();
      }}
    >
      <span className="windows95-text text-title-text min-w-0 flex-1 truncate font-bold">
        {title}
      </span>
      <div className="flex shrink-0 flex-row items-center gap-0.5" data-no-drag>
        {children}
        <Button
          size="icon"
          className={CONTROL_CLASS}
          title={t("window.minimize")}
          aria-label={t("window.minimize")}
          onClick={() => run(getCurrentWindow().minimize(), "titlebar.minimize")}
        >
          <Minus className={CONTROL_ICON_CLASS} />
        </Button>
        <Button
          size="icon"
          className={CONTROL_CLASS}
          title={maximizeLabel}
          aria-label={maximizeLabel}
          onClick={toggleMaximize}
        >
          {maximized ? (
            <Copy className={CONTROL_ICON_CLASS} />
          ) : (
            <Square className={CONTROL_ICON_CLASS} />
          )}
        </Button>
        <Button
          size="icon"
          className={CONTROL_CLASS}
          title={t("common.close")}
          aria-label={t("common.close")}
          onClick={() => run(getCurrentWindow().close(), "titlebar.close")}
        >
          <X className={CONTROL_ICON_CLASS} />
        </Button>
      </div>
    </div>
  );
}
