import { renderDitherImage } from "@/lib/utils/dither.utils";
import type {
  DitherWorkerProgress,
  DitherWorkerRequest,
  DitherWorkerResponse,
} from "@/types/dither";

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<DitherWorkerRequest>) => {
  const request = event.data;
  const source = new Uint8ClampedArray(request.pixels);
  const output = renderDitherImage(
    source,
    request.width,
    request.height,
    request.options,
    (doneRows) => {
      const progress: DitherWorkerProgress = {
        type: "progress",
        id: request.id,
        done: doneRows,
        total: request.height,
      };
      scope.postMessage(progress, []);
    }
  );
  const response: DitherWorkerResponse = {
    type: "result",
    id: request.id,
    width: request.width,
    height: request.height,
    pixels: output.buffer,
  };
  scope.postMessage(response, [response.pixels]);
};
