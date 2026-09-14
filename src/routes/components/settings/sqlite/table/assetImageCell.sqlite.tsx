import { useEffect, useMemo, useState } from "react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

export function AssetImageCell({
  database,
  table,
  column,
  keys,
  alt,
}: {
  database: string;
  table: string;
  column: string;
  keys: string[];
  alt: string;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "image" | "missing">("loading");
  const keysJson = useMemo(() => JSON.stringify(keys), [keys]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    invokeTyped<string | null>("get_sqlite_cell_image", {
      database,
      table,
      column,
      keys: JSON.parse(keysJson),
    })
      .then((path) => {
        if (cancelled) return;
        if (path) {
          setSrc(assetUrl(path));
          setState("image");
        } else setState("missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [database, column, table, keysJson]);

  if (state === "loading") return <span className="text-hint block text-xs">...</span>;
  if (state === "missing" || !src)
    return (
      <span className="text-hint block text-xs">{t("settings.sqlite.image.missing")}</span>
    );
  return (
    <div className="windows95-border mx-auto size-16 shrink-0 overflow-hidden bg-white">
      <Image src={src} alt={alt} type="contain" className="h-full w-full" />
    </div>
  );
}
