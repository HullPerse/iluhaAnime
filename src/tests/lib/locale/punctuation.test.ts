import { describe, expect, it } from "vitest";

// .docs/DEVELOPMENT.md anti-slop: no em dashes, en dashes, guillemets,
// ellipses, middle dots, or bullet separators in UI copy. Scrapers and
// test fixtures handle these characters for external release names, so
// they stay out of the scanned roots.
const FORBIDDEN = ["\u2014", "\u2013", "\u00AB", "\u00BB", "\u2026", "\u00B7", "\u2022"];

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
const hookFiles = import.meta.glob<string>("/src/hooks/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});
const libFiles = import.meta.glob<string>("/src/lib/**/*.{ts,tsx}", {
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
  it("scans the locale, route, hook, and lib trees", () => {
    expect(Object.keys(localeFiles).length).toBeGreaterThan(0);
    expect(Object.keys(routeFiles).length).toBeGreaterThan(0);
    expect(Object.keys(hookFiles).length).toBeGreaterThan(0);
    expect(Object.keys(libFiles).length).toBeGreaterThan(0);
  });

  it("keeps UI copy free of banned punctuation", () => {
    expect(
      [
        ...findViolations(localeFiles),
        ...findViolations(routeFiles),
        ...findViolations(hookFiles),
        ...findViolations(libFiles),
      ].join("\n")
    ).toBe("");
  });
});
