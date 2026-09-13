import { useEffect, useMemo, useState } from "react";

import Image from "@/components/ui/image.component";
import { invokeTyped } from "@/lib/utils/invoke.utils";

export function BlobImageCell({
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
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "image" | "not-image">("loading");
  const keysJson = useMemo(() => JSON.stringify(keys), [keys]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    invokeTyped<string | null>("get_sqlite_cell_blob", {
      database,
      table,
      column,
      keys: JSON.parse(keysJson),
    })
      .then((value) => {
        if (cancelled) return;
        if (value) {
          setSrc(value);
          setState("image");
        } else setState("not-image");
      })
      .catch(() => {
        if (!cancelled) setState("not-image");
      });
    return () => {
      cancelled = true;
    };
  }, [database, column, table, keysJson]);

  if (state === "loading") return <span className="text-hint block text-xs">...</span>;
  if (state === "not-image" || !src) return <span className="text-hint block text-xs">[BLOB]</span>;
  return (
    <div className="windows95-border mx-auto size-16 shrink-0 overflow-hidden bg-white">
      <Image src={src} alt={alt} type="contain" className="h-full w-full" />
    </div>
  );
}
