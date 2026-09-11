import {
  createDitherRenderContext,
  finishDitherImage,
  renderDitherRows,
} from "@/lib/utils/dither.render.utils";
import type {
  DitherWorkerProgress,
  DitherWorkerRequest,
  DitherWorkerResponse,
} from "@/types/dither";

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<DitherWorkerRequest>) => {
  const request = event.data;
  const source = new Uint8ClampedArray(request.pixels);
  const ctx = createDitherRenderContext(source, request.width, request.height, request.options);
  const total = request.height;
  for (let y = 0; y < total; y += 16) {
    const end = Math.min(total, y + 16);
    renderDitherRows(ctx, y, end);
    const progress: DitherWorkerProgress = {
      type: "progress",
      id: request.id,
      done: end,
      total,
    };
    scope.postMessage(progress, []);
  }
  const output = finishDitherImage(ctx);
  const response: DitherWorkerResponse = {
    type: "result",
    id: request.id,
    width: request.width,
    height: request.height,
    pixels: output.buffer,
  };
  scope.postMessage(response, [response.pixels]);
};
