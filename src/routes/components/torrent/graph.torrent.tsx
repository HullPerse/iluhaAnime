import { useEffect, useRef } from "react";

import { GRAPH_HEIGHT, GRAPH_POINTS, GRAPH_WIDTH } from "@/config/torrent/graph.config";
import { useI18n } from "@/hooks/i18n.hook";
import { drawSpeedGraph } from "@/lib/core/speedGraph.utils";
import { fmtSpeed } from "@/lib/torrent/torrentCommon.utils";
import type { DhtStatus } from "@/types/torrent/torrent";

export function SpeedGraph({
  download,
  upload,
  peers,
  dht,
  active,
}: {
  download: number;
  upload: number;
  peers: number;
  dht: DhtStatus | null | undefined;
  active: boolean;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadRef = useRef<number[]>([]);
  const uploadRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active) return;
    downloadRef.current = [...downloadRef.current, download].slice(-GRAPH_POINTS);
    uploadRef.current = [...uploadRef.current, upload].slice(-GRAPH_POINTS);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const styles = getComputedStyle(document.documentElement);
    drawSpeedGraph(canvas, downloadRef.current, uploadRef.current, {
      download: styles.getPropertyValue("--color-highlight").trim() || "#4caf50",
      upload: styles.getPropertyValue("--color-text").trim() || "#888888",
    });
  }, [active, download, upload]);

  if (!active) {
    return (
      <section
        className="windows95-active-border bg-primary flex items-center gap-2 px-2 py-1"
        aria-label={t("torrent.graph.title")}
      >
        <span className="windows95-text text-hint text-xs" title={t("torrent.graph.peers")}>
          {t("torrent.graph.peers.short", { count: peers })}
        </span>
        {dht && (
          <span className="windows95-text text-hint text-xs" title={t("torrent.graph.dht")}>
            {t("torrent.graph.dht.short", { nodes: dht.nodes_v4 + dht.nodes_v6 })}
          </span>
        )}
      </section>
    );
  }

  return (
    <section
      className="windows95-active-border bg-primary flex items-center gap-2 px-2 py-1"
      aria-label={t("torrent.graph.title")}
    >
      <canvas
        ref={canvasRef}
        style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
        className="shrink-0"
        aria-hidden
      />
      <div className="windows95-text flex min-w-0 flex-col text-xs">
        <span className="truncate tabular-nums">
          {t("torrent.graph.down", { speed: fmtSpeed(download) })}
        </span>
        <span className="truncate tabular-nums">
          {t("torrent.graph.up", { speed: fmtSpeed(upload) })}
        </span>
      </div>
      <div className="windows95-text text-hint ml-auto flex shrink-0 items-center gap-2 text-xs">
        <span title={t("torrent.graph.peers")}>
          {t("torrent.graph.peers.short", { count: peers })}
        </span>
        {dht && (
          <span title={t("torrent.graph.dht")}>
            {t("torrent.graph.dht.short", { nodes: dht.nodes_v4 + dht.nodes_v6 })}
          </span>
        )}
      </div>
    </section>
  );
}
