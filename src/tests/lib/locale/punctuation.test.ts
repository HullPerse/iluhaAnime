import { describe, expect, it } from "vitest";

// .docs/DEVELOPMENT.md anti-slop: no em dashes, en dashes, or guillemets
// in UI copy. Scrapers and test fixtures handle these characters for
// external release names, so they stay out of the scanned roots.
const FORBIDDEN = ["\u2014", "\u2013", "\u00AB", "\u00BB"];

const localeFiles = import.meta.glob<string>("/src/lib/locale/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});
const routeFiles = import.meta.glob<string>("/src/routes/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

function findViolations(files: Record<string, string>): Array<string> {
  const hits: Array<string> = [];
  for (const [file, content] of Object.entries(files)) {
    content.split("\n").forEach((line, index) => {
      const bad = FORBIDDEN.filter((char) => line.includes(char));
      if (bad.length > 0) {
        hits.push(`${file}:${index + 1} (${bad.join("")})`);
      }
    });
  }
  return hits;
}

describe("locale/punctuation guard", () => {
  it("scans the locale and route trees", () => {
    expect(Object.keys(localeFiles).length).toBeGreaterThan(0);
    expect(Object.keys(routeFiles).length).toBeGreaterThan(0);
  });

  it("keeps UI copy free of em dashes, en dashes, and guillemets", () => {
    expect([...findViolations(localeFiles), ...findViolations(routeFiles)].join("\n")).toBe("");
  });
});
