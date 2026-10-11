// Measures the real Tauri IPC round-trip time inside the running app WebView.
// The app must already run with CDP exposed:
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//   bun run tauri dev
// Then: bun scripts/e2e/measure-ipc.ts (or bun run bench:ipc).
// The timing loop runs inside one page.evaluate so CDP transport cost is
// excluded; what remains is serialization plus the Rust dispatch.

import { connectCdp, mainPage, waitForReady } from "./cdp";

const WARMUP = 50;
const SAMPLES = 1000;

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("no samples collected");
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  const browser = await connectCdp(60_000);
  try {
    const page = await mainPage(browser);
    await waitForReady(page);
    const samples = (await page.evaluate(
      async (input: { warmup: number; samples: number }) => {
        const internals = (
          window as unknown as {
            __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
          }
        ).__TAURI_INTERNALS__;
        if (!internals) throw new Error("Tauri runtime not present in page");
        for (let i = 0; i < input.warmup; i++) await internals.invoke("ping");
        const out: number[] = [];
        for (let i = 0; i < input.samples; i++) {
          const start = performance.now();
          const pong = await internals.invoke("ping");
          if (pong !== "pong") throw new Error(`unexpected ping reply: ${String(pong)}`);
          out.push(performance.now() - start);
        }
        return out;
      },
      { warmup: WARMUP, samples: SAMPLES }
    )) as number[];
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    console.log(`ipc ping: n=${samples.length} warmup=${WARMUP}`);
    console.log(`min=${samples.at(0)?.toFixed(3)}ms`);
    console.log(`p50=${percentile(samples, 0.5).toFixed(3)}ms`);
    console.log(`mean=${mean.toFixed(3)}ms`);
    console.log(`p99=${percentile(samples, 0.99).toFixed(3)}ms`);
    console.log(`max=${samples.at(-1)?.toFixed(3)}ms`);
  } finally {
    await browser.close();
  }
}

await main();
