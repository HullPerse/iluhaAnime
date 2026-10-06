import { useEffect, useRef } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { fmtSpeed } from "@/lib/torrent/common.utils";
import type { DhtStatus } from "@/types/torrent";

const GRAPH_POINTS = 120;
const GRAPH_WIDTH = 240;
const GRAPH_HEIGHT = 30;

function drawGraph(
  canvas: HTMLCanvasElement,
  download: number[],
  upload: number[],
  colors: { download: string; upload: string }
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = GRAPH_WIDTH * ratio;
  canvas.height = GRAPH_HEIGHT * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
  const max = Math.max(1, ...download, ...upload);
  const line = (values: number[], color: string) => {
    if (values.length < 2) return;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (GRAPH_POINTS - 1)) * GRAPH_WIDTH;
      const y = GRAPH_HEIGHT - 1 - (value / max) * (GRAPH_HEIGHT - 2);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  };
  line(upload, colors.upload);
  line(download, colors.download);
}

export function SpeedGraph({
  download,
  upload,
  peers,
  dht,
}: {
  download: number;
  upload: number;
  peers: number;
  dht: DhtStatus | null | undefined;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadRef = useRef<number[]>([]);
  const uploadRef = useRef<number[]>([]);

  useEffect(() => {
    downloadRef.current = [...downloadRef.current, download].slice(-GRAPH_POINTS);
    uploadRef.current = [...uploadRef.current, upload].slice(-GRAPH_POINTS);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const styles = getComputedStyle(document.documentElement);
    drawGraph(canvas, downloadRef.current, uploadRef.current, {
      download: styles.getPropertyValue("--color-highlight").trim() || "#4caf50",
      upload: styles.getPropertyValue("--color-text").trim() || "#888888",
    });
  }, [download, upload]);

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
