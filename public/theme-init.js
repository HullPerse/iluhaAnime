(function initTheme() {
  const FALLBACK_FONTS = '"MS Sans Serif", "Microsoft Sans Serif", "Segoe UI", system-ui';
  const WINDOW_EFFECTS = ["none", "acrylic", "mica", "tabbed"];
  const RETRO_STYLES = ["classic", "soft", "high-contrast"];
  const UI_DENSITIES = ["comfortable", "compact"];

  const root = document.documentElement;

  function setVar(name, value) {
    if (typeof value === "string" && value.length > 0) {
      root.style.setProperty(name, value, "important");
    }
  }

  function setColor(name, value) {
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
      root.style.setProperty(name, value, "important");
    }
  }

  function stored(key) {
    const data = localStorage.getItem(key);
    if (!data) return null;
    return data;
  }

  function readJson(key) {
    const raw = stored(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function oneOf(value, allowed) {
    return typeof value === "string" && allowed.includes(value);
  }

  // The settings store persists `{ f, store, sv, ts, data }` under
  // `iluha.v1.settings`. The old app wrote either `{ state }` or a flat object
  // under `settings`; both are still read so an upgrade keeps the first paint.
  function readStoredSettings() {
    const envelope = readJson("iluha.v1.settings");
    if (isRecord(envelope) && isRecord(envelope.data)) return envelope.data;
    const legacy = readJson("settings");
    if (!isRecord(legacy)) return null;
    return isRecord(legacy.state) ? legacy.state : legacy;
  }

  function applyVisualSettings(settings) {
    if (!isRecord(settings)) return "";
    if (oneOf(settings.windowEffect, WINDOW_EFFECTS)) {
      root.dataset.windowEffect = settings.windowEffect;
    }
    if (
      typeof settings.windowTintOpacity === "number" &&
      Number.isFinite(settings.windowTintOpacity)
    ) {
      const tint = Math.max(0, Math.min(1, settings.windowTintOpacity));
      setVar("--ui-window-opacity", `${Math.round(tint * 100)}%`);
    }
    if (oneOf(settings.retroStyle, RETRO_STYLES)) {
      root.dataset.retroStyle = settings.retroStyle;
    }
    if (oneOf(settings.uiDensity, UI_DENSITIES)) {
      root.dataset.uiDensity = settings.uiDensity;
    }
    if (typeof settings.yorhaScanlinesEnabled === "boolean") {
      root.dataset.yorhaScanlines = settings.yorhaScanlinesEnabled ? "on" : "off";
    }
    return typeof settings.appFont === "string" ? settings.appFont.trim() : "";
  }

  function applyAppFont(font) {
    if (typeof font !== "string" || font.trim().length === 0) return false;
    setVar("--font-family", `"${font.trim().replace(/"/g, '\\"')}", ${FALLBACK_FONTS}`);
    return true;
  }

  function applyPayloadV2(value) {
    const vars = value.vars;
    if (vars && typeof vars === "object") {
      for (const name of Object.keys(vars)) setVar(name, vars[name]);
    }
    const overrides = value.overrides;
    if (overrides && typeof overrides === "object") {
      for (const name of Object.keys(overrides)) setColor(name, overrides[name]);
    }
    const datasets = value.datasets;
    if (datasets && typeof datasets === "object") {
      for (const name of Object.keys(datasets)) {
        const entry = datasets[name];
        if (typeof entry === "string" && entry.length > 0 && root.dataset) {
          root.dataset[name] = entry;
        }
      }
    }
  }

  function applyPayloadV1(value) {
    setColor("--color-background", value.background);
    setColor("--color-primary", value.primary);
    setColor("--color-secondary", value.secondary);
    setColor("--color-text", value.text);
    setColor("--color-muted", value.muted);
    setColor("--color-autocomplete", value.autocomplete);
    setColor("--color-highlight", value.highlight);
    setColor("--color-destructive", value.destructive);
    setColor("--color-success", value.success);
    setColor("--color-link-hover", value.linkHover);
    setColor("--color-surface", value.surface);
    setColor("--color-field", value.field);
    setColor("--color-win-highlight", value.winHighlight);
    setColor("--color-win-shadow", value.winShadow);
    setColor("--color-title-text", value.titleText);
    if (
      typeof value.autocompleteOpacity === "number" &&
      Number.isFinite(value.autocompleteOpacity)
    ) {
      setVar("--autocomplete-opacity", String(Math.max(0, Math.min(1, value.autocompleteOpacity))));
    }
    if (typeof value.windowAlpha === "string") setVar("--ui-window-alpha", value.windowAlpha);
  }

  function applyThemePayload(hasAppFont) {
    const value = readJson("themeVars");
    if (!isRecord(value)) return;

    if (value.schema === 2) applyPayloadV2(value);
    else applyPayloadV1(value);

    if (!hasAppFont) setVar("--font-family", value.fontFamily);
    if (typeof value.themeName === "string" && value.themeName.length > 0 && root.dataset) {
      root.dataset.theme = value.themeName;
    }
  }

  try {
    const settings = readStoredSettings();
    const settingsFont = applyVisualSettings(settings);
    const legacyFont = stored("appFont");
    const hasAppFont = applyAppFont(
      settingsFont.length > 0 ? settingsFont : (legacyFont || "").trim()
    );
    applyThemePayload(hasAppFont);
  } catch (error) {
    console.error(error);
  }
})();
