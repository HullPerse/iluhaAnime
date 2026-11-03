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
  it("renders dark and light headings and puts custom themes last", () => {
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
      .getAllByText(/^(Dark|Light|Custom)$/)
      .map((node) => node.textContent);

    expect(headings).toEqual([
      translate("en", "settings.theme.mode.dark"),
      translate("en", "settings.theme.mode.light"),
      translate("en", "settings.theme.family.custom"),
    ]);
    expect(screen.getAllByText(/Mine/).length).toBeGreaterThan(0);
  });
});
