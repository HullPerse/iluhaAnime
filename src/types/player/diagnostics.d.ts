export interface PlayerDiagnostics {
  active: boolean;
  preparation: "starting" | "ready" | "failed" | "closed";
  startup: {
    windowCreatedAtMs: number | null;
    nativeReadyAtMs: number | null;
    frontendReadyAtMs: number | null;
  };
  decoder: string | null;
  hwdec: string | null;
  videoOutput: string | null;
  gpuContext: string | null;
  audioOutput: string | null;
}
