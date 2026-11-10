import { defineConfig } from "@pmndrs/labs";

export default defineConfig({
  // labs reads V8 deopt logs after each child exits. On Windows that read
  // can hit EBUSY while the child still holds the log, killing the whole
  // run before any timing. An empty logfile makes labs skip that optional trace.
  nodeFlags: ["--allow-natives-syntax", "--expose-gc", "--logfile="],
  benchDir: "labs",
  benchMatch: "**/*.labs.bench.ts",
  blocks: 8,
  resultsDir: ".labs",
  alpha: 0.05,
  minDelta: 0.05,
  snapshotTolerance: 1e-9,
});
