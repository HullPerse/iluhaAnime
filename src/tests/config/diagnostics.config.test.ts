import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_GROUPS, DIAGNOSTIC_PROBES } from "@/config/diagnostics/probes.config";
import {
  SOURCE_DIAGNOSTIC_PROBE,
  SOURCE_INFOS,
} from "@/config/search/searchSources.config";

describe("diagnostics probe catalog", () => {
  it("has unique probe ids", () => {
    const ids = DIAGNOSTIC_PROBES.map((probe) => probe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses https URLs with a supported method and expected statuses", () => {
    for (const probe of DIAGNOSTIC_PROBES) {
      const url = new URL(probe.url);
      expect(url.protocol, probe.id).toBe("https:");
      expect(["GET", "HEAD", "POST"], probe.id).toContain(probe.method);
      expect(probe.expectedStatus.length, probe.id).toBeGreaterThan(0);
      if (probe.body !== undefined) expect(probe.method, probe.id).toBe("POST");
    }
  });

  it("references only declared groups", () => {
    const groups = new Set(DIAGNOSTIC_GROUPS.map((group) => group.id));
    for (const probe of DIAGNOSTIC_PROBES) {
      expect(groups.has(probe.group), probe.id).toBe(true);
    }
  });

  it("uses each search source's own proxy for its diagnostic probe", () => {
    for (const source of SOURCE_INFOS) {
      const probe = DIAGNOSTIC_PROBES.find(
        (entry) => entry.id === SOURCE_DIAGNOSTIC_PROBE[source.value]
      );
      expect(probe, source.value).toBeDefined();
      expect(probe?.proxy, source.value).toBe(`source:${source.value}`);
    }
  });

  it("keeps a short quick mode and a wider full mode", () => {
    const critical = DIAGNOSTIC_PROBES.filter((probe) => probe.weight === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(15);
    expect(critical.length).toBeLessThanOrEqual(25);
    expect(critical.length).toBeLessThan(DIAGNOSTIC_PROBES.length);
    expect(DIAGNOSTIC_PROBES.length).toBeLessThanOrEqual(25);
  });
});
