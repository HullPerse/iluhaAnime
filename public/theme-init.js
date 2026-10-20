(function initTheme() {
  const FALLBACK_FONTS = '"MS Sans Serif", "Microsoft Sans Serif", "Segoe UI", system-ui';

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

  // A window effect paints the desktop behind the webview: without this the first frames are
  // opaque and the glass only appears once the settings store rehydrates.
  function applyStoredWindowStyle() {
    const raw = stored("settings");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const state = (parsed && parsed.state) || parsed;
    if (!state) return;
    const effect = state.windowEffect;
    if (typeof effect === "string" && root.dataset) root.dataset.windowEffect = effect;
    const tint = state.windowTintOpacity;
    if (typeof tint === "number" && Number.isFinite(tint)) {
      setVar("--ui-window-opacity", `${Math.round(Math.max(0, Math.min(1, tint)) * 100)}%`);
    }
  }

  // Payload v2 carries the variable names and dataset names, so this file never needs the
  // token list that applyTheme owns. Keep it that way: a hardcoded color here drifts silently.
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

  // Payload v1 is the flat object written by releases before the token table. It stays for one
  // upgrade cycle so an existing install does not paint a half-themed first frame.
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

  try {
    applyStoredWindowStyle();

    const rawFont = stored("appFont");
    const appFont = typeof rawFont === "string" ? rawFont.trim() : "";
    if (appFont.length > 0) {
      setVar("--font-family", `"${appFont.replace(/"/g, '\\"')}", ${FALLBACK_FONTS}`);
    }

    const raw = stored("themeVars");
    if (!raw) return;
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return;

    if (value.schema === 2) applyPayloadV2(value);
    else applyPayloadV1(value);

    if (appFont.length === 0) setVar("--font-family", value.fontFamily);
    if (typeof value.themeName === "string" && value.themeName.length > 0 && root.dataset) {
      root.dataset.theme = value.themeName;
    }
  } catch {
    // First-paint bootstrapping must never break the app; a bad payload leaves the CSS defaults.
  }
})();
