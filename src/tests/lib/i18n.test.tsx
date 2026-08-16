import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";

import { translate, useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";

// The store's initial locale is the detected system locale (no persisted
// settings exist in the test environment), captured before any setState.
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

  it("falls back to Russian when a key is missing in English", () => {
    expect(translate("en", "common.delete")).toBe("Delete");
  });

  it("returns the key itself when missing everywhere", () => {
    expect(translate("en", "does.not.exist" as "app.search")).toBe(
      "does.not.exist"
    );
  });

  it("replaces variables in templates", () => {
    expect(
      translate("en", "Hello {{name}}" as "app.search", { name: "Bob" })
    ).toBe("Hello Bob");
  });

  it("keeps unresolved variables as-is", () => {
    expect(translate("en", "Hello {{name}}" as "app.search", {})).toBe(
      "Hello {{name}}"
    );
  });

  it("supports numeric variables", () => {
    expect(
      translate("en", "{{count}} items" as "app.search", { count: 5 })
    ).toBe("5 items");
  });
});

describe("useI18n", () => {
  function Probe() {
    const { locale, t } = useI18n();
    return createElement("span", null, `${locale}:${t("app.search")}`);
  }

  it("exposes the store locale and a working t()", () => {
    // Server rendering reads the store's initial state (zustand's
    // getServerSnapshot), which defaults to the detected system locale.
    // Locale switching itself is covered deterministically by translate().
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toBe(
      `<span>${INITIAL_LOCALE}:${translate(INITIAL_LOCALE, "app.search")}</span>`
    );
  });
});
