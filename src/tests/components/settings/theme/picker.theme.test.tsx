import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { THEMES } from "@/config/graphics/themes.config";
import { translate } from "@/lib/locale/i18n.utils";
import { ThemePicker } from "@/routes/components/settings/theme/picker.theme";
import { settingsAtoms } from "@/store/settings.store";

const previousLanguage = settingsAtoms.language.get();

afterEach(() => {
  cleanup();
  settingsAtoms.language.set(previousLanguage);
});

describe("ThemePicker", () => {
  it("renders family headings in order and puts custom themes last", () => {
    settingsAtoms.language.set("en");
    const custom = { ...THEMES[0], label: "Mine", name: "mine" };

    render(
      <ThemePicker
        builtins={THEMES}
        customThemes={[custom]}
        currentTheme="win95"
        onSelect={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const headings = screen
      .getAllByText(/^(Windows|Brands|Terminals|Editors|Anime|Custom)$/)
      .map((node) => node.textContent);

    expect(headings).toEqual([
      translate("en", "settings.theme.family.windows"),
      translate("en", "settings.theme.family.brands"),
      translate("en", "settings.theme.family.terminal"),
      translate("en", "settings.theme.family.editor"),
      translate("en", "settings.theme.family.anime"),
      translate("en", "settings.theme.family.custom"),
    ]);
    expect(screen.getAllByText(/Mine/).length).toBeGreaterThan(0);
  });
});
