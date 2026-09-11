import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";

import { translate, useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";

const INITIAL_LOCALE = useSettingsStore.getState().language;

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

describe("translate", () => {
  it("returns Russian text for the ru locale", () => {
    expect(translate("ru", "app.search")).toBe("Поиск");
    expect(translate("ru", "torrent.all")).toBe("Все");
  });

  it("returns English text for the en locale", () => {
    expect(translate("en", "app.search")).toBe("Search");
    expect(translate("en", "common.delete")).toBe("Delete");
  });

  it("falls back to Russian for unknown locales", () => {
    expect(translate("de" as "en", "app.search")).toBe("Поиск");
  });

  it("returns the key itself when missing everywhere", () => {
    expect(translate("en", "does.not.exist" as "app.search")).toBe("does.not.exist");
  });

  it("replaces variables in templates", () => {
    expect(translate("en", "Hello {{name}}" as "app.search", { name: "Bob" })).toBe("Hello Bob");
  });

  it("keeps unresolved variables as-is", () => {
    expect(translate("en", "Hello {{name}}" as "app.search", {})).toBe("Hello {{name}}");
  });

  it("supports numeric variables", () => {
    expect(translate("en", "{{count}} items" as "app.search", { count: 5 })).toBe("5 items");
  });
});

describe("useI18n", () => {
  function Probe() {
    const { locale, t } = useI18n();
    return createElement("span", null, `${locale}:${t("app.search")}`);
  }

  it("exposes the store locale and a working t()", () => {
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toBe(`<span>${INITIAL_LOCALE}:${translate(INITIAL_LOCALE, "app.search")}</span>`);
  });
});

describe("translate plurals", () => {
  it("selects Russian one/few/many forms by count", () => {
    expect(translate("ru", "search.results.count", { count: 1 })).toBe("1 результат");
    expect(translate("ru", "search.results.count", { count: 2 })).toBe("2 результата");
    expect(translate("ru", "search.results.count", { count: 5 })).toBe("5 результатов");
    expect(translate("ru", "search.results.count", { count: 21 })).toBe("21 результат");
  });

  it("selects English one/other forms by count", () => {
    expect(translate("en", "search.results.count", { count: 1 })).toBe("1 result");
    expect(translate("en", "search.results.count", { count: 5 })).toBe("5 results");
  });

  it("falls back to the base key when no plural form exists", () => {
    expect(translate("ru", "torrent.summary.seeding", { count: 1 })).toBe("Раздаётся: 1");
    expect(translate("en", "torrent.summary.seeding", { count: 1 })).toBe("1 seeding");
  });

  it("ignores non-numeric count for plural selection", () => {
    expect(translate("ru", "search.results.count", { count: "5" })).toBe("5 результатов");
  });

  it("falls back to the Russian suffixed form when English lacks it", () => {
    expect(translate("en", "torrent.summary.active", { count: 1 })).toBe("Активный: 1");
  });

  it("selects many for zero and base for fractions in Russian", () => {
    expect(translate("ru", "search.results.count", { count: 0 })).toBe("0 результатов");
    expect(translate("ru", "search.results.count", { count: 1.5 })).toBe("1.5 результатов");
  });

  it("returns the key itself when nothing matches", () => {
    expect(translate("ru", "zzz.missing.key" as never)).toBe("zzz.missing.key");
  });
});
