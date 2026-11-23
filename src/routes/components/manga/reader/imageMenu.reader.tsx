import { Copy, Pencil, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { systemApi } from "@/api/system.api";
import ContextMenu from "@/components/shared/contextMenu.component";
import ScreenshotModal from "@/components/shared/screenshot/modal.screenshot";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/ui/notification.utils";
import type { ScreenshotCapture } from "@/types/core/screenshot";

function release(shot: ScreenshotCapture) {
  return attempt(systemApi.discardScreenshot(shot.path)).then(([, error]) => {
    if (error) reportBackgroundError("manga.image.discard", error);

    return null;
  });
}

export function ReaderImageMenu({
  data,
  children,
}: {
  data: Blob;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [capture, setCapture] = useState<ScreenshotCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const pending = useRef<ScreenshotCapture | null>(null);

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;

      if (pending.current) release(pending.current);
    };
  }, []);
  const close = () => {
    if (pending.current) release(pending.current);
    pending.current = null;
    setCapture(null);
  };

  const run = async (action: "copy" | "edit" | "save") => {
    if (busy) return;
    setBusy(true);

    try {
      const [, error] = await attempt(
        (async () => {
          const bytes = new Uint8Array(await data.arrayBuffer());

          if (action === "copy") {
            await writeImage(bytes);

            return;
          }

          const shot = await systemApi.importScreenshot(Array.from(bytes));

          if (!active.current) {
            release(shot);

            return;
          }

          if (action === "edit") {
            pending.current = shot;
            setCapture(shot);

            return;
          }

          const [path, pickerError] = await attempt(
            save({
              defaultPath: "manga-page.png",
              filters: [{ name: "PNG", extensions: ["png"] }],
            }),
          );

          if (!path || pickerError) {
            release(shot);

            if (pickerError) throw pickerError;

            return;
          }

          const split = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
          const [, saveError] = await attempt(
            systemApi.saveScreenshot({
              sourcePath: shot.path,
              dir: path.slice(0, split),
              name: path.slice(split + 1).replace(/\.png$/i, ""),
              format: "png",
              crop: null,
            }),
          );
          release(shot);

          if (saveError) throw saveError;
        })(),
      );

      if (active.current) {
        if (error) showError(t("common.error"), t("screenshot.copy.error"));
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };

  return (
    <>
      <ContextMenu
        entries={[
          {
            kind: "item",
            id: "copy",
            label: "manga.reader.copyImage",
            icon: Copy,
            disabled: busy,
            onSelect: () => run("copy"),
          },
          {
            kind: "item",
            id: "edit",
            label: "manga.reader.editImage",
            icon: Pencil,
            disabled: busy,
            onSelect: () => run("edit"),
          },
          {
            kind: "item",
            id: "save",
            label: "manga.reader.saveImage",
            icon: Save,
            disabled: busy,
            onSelect: () => run("save"),
          },
        ]}
      >
        {children}
      </ContextMenu>
      {capture && <ScreenshotModal capture={capture} onClose={close} />}
    </>
  );
}
