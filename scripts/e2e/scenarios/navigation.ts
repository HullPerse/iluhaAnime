import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { TAB, clickTabByAnyOf, sleep, tabLabels, waitForReady } from "../cdp";
import type { Scenario } from "../harness";
import { formatBytes, sampleProcessTree, type TreeSample } from "../process-tree";

interface RecordedSample extends TreeSample {
  phase: string;
  cycle: number;
}

const TAB_SET = [
  ["AniList", TAB.anilist],
  ["Collection", TAB.collection],
  ["Torrent", TAB.torrent],
  ["Search", TAB.search],
  ["Player", TAB.player],
  ["Settings", TAB.settings],
] as const;

async function ensureStartingScreen(page: Parameters<typeof clickTabByAnyOf>[0]): Promise<void> {
  const active = page.locator('[role="tab"][aria-selected="true"]').first();
  if ((await active.count()) > 0) {
    const label = (await active.textContent()) ?? "";
    if (/search|поиск/i.test(label)) return;
  }
  await clickTabByAnyOf(page, TAB.search);
}

function peakOf(samples: RecordedSample[]): number | null {
  const values = samples
    .map((sample) => sample.workingSetBytes)
    .filter((value): value is number => value !== null);
  return values.length === 0 ? null : Math.max(...values);
}

function summary(
  baseline: RecordedSample | null,
  afterTabs: RecordedSample | null,
  samples: RecordedSample[]
): string {
  const peak = peakOf(samples);
  const latest = samples.at(-1) ?? null;
  return [
    "# Navigation and idle memory report",
    "",
    `- baseline working set: ${formatBytes(baseline?.workingSetBytes ?? null)}`,
    `- after all tabs: ${formatBytes(afterTabs?.workingSetBytes ?? null)}`,
    `- latest working set: ${formatBytes(latest?.workingSetBytes ?? null)}`,
    `- peak working set: ${formatBytes(peak)}`,
    `- process count: ${latest?.processCount ?? "n/a"}`,
    `- thread count: ${latest?.threadCount ?? "n/a"}`,
    `- handle count: ${latest?.handleCount ?? "n/a"}`,
    `- network bytes: unavailable in Win32_Process`,
    "",
    "| phase | cycle | processes | working set | private | cpu one-core % | threads | handles |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...samples.map(
      (sample) =>
        `| ${sample.phase} | ${sample.cycle} | ${sample.processCount} | ${formatBytes(sample.workingSetBytes)} | ${formatBytes(sample.privateBytes)} | ${sample.cpuPercentOneCore?.toFixed(1) ?? "n/a"} | ${sample.threadCount ?? "n/a"} | ${sample.handleCount ?? "n/a"} |`
    ),
  ].join("\n");
}

function csv(samples: RecordedSample[]): string {
  const rows = [
    "phase,cycle,sampled_at,process_count,working_set_bytes,private_bytes,cpu_percent_one_core,threads,handles",
  ];
  for (const sample of samples) {
    rows.push(
      [
        sample.phase,
        sample.cycle,
        sample.sampledAt,
        sample.processCount,
        sample.workingSetBytes ?? "",
        sample.privateBytes ?? "",
        sample.cpuPercentOneCore ?? "",
        sample.threadCount ?? "",
        sample.handleCount ?? "",
      ].join(",")
    );
  }
  return rows.join("\n");
}

export const navigation: Scenario = {
  name: "navigation",
  async run({ page, outDir, step }) {
    const idleSeconds = Math.max(0, Number.parseInt(process.env.E2E_IDLE_SECONDS ?? "120", 10));
    const cycles = Math.max(1, Number.parseInt(process.env.E2E_NAV_CYCLES ?? "1", 10));
    const samples: RecordedSample[] = [];
    let previous: TreeSample | undefined;
    let baseline: RecordedSample | null = null;
    let afterTabs: RecordedSample | null = null;

    const take = async (phase: string, cycle: number): Promise<RecordedSample> => {
      const sample = await sampleProcessTree(previous);
      previous = sample;
      const recorded = { ...sample, phase, cycle };
      samples.push(recorded);
      return recorded;
    };

    try {
      await step("baseline process tree", async () => {
        await waitForReady(page);
        await ensureStartingScreen(page);
        await sleep(500);
        baseline = await take("baseline", 0);
        if (baseline.processes.length === 0) throw new Error("process tree is empty");
      });

      for (let cycle = 1; cycle <= cycles; cycle += 1) {
        await step(`visit all primary tabs (cycle ${cycle})`, async () => {
          for (const [name, labels] of TAB_SET) {
            await clickTabByAnyOf(page, labels);
            await sleep(500);
            await waitForReady(page);
            const tabs = await tabLabels(page);
            if (tabs.length === 0) throw new Error(`no tabs after opening ${name}`);
            await take(`tab:${name}`, cycle);
          }
        });
      }

      await step("return to starting screen", async () => {
        await ensureStartingScreen(page);
        await sleep(750);
        afterTabs = await take("after-tabs", cycles);
        if (afterTabs.processes.length === 0) throw new Error("process tree disappeared");
      });

      await step(`idle for ${idleSeconds}s`, async () => {
        if (idleSeconds === 0) return;
        for (let second = 1; second <= idleSeconds; second += 1) {
          await sleep(1000);
          await take(`idle:${second}s`, 0);
        }
      });
    } finally {
      writeFileSync(join(outDir, "navigation.json"), JSON.stringify({ baseline, afterTabs, samples }, null, 2));
      writeFileSync(join(outDir, "navigation-samples.csv"), csv(samples));
      writeFileSync(join(outDir, "navigation.md"), summary(baseline, afterTabs, samples));
    }
  },
};
