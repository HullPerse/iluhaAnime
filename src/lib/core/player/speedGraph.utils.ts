import { GRAPH_HEIGHT, GRAPH_POINTS, GRAPH_WIDTH } from "@/config/torrent/graph.config";

export function drawSpeedGraph(
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
    if (values.length < 2 || values.every((value) => value === 0)) return;
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
