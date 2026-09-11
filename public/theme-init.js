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

  try {
    const rawFont = stored("appFont");
    const appFont = typeof rawFont === "string" ? rawFont.trim() : "";
    if (appFont.length > 0) {
      setVar("--font-family", `"${appFont.replace(/"/g, '\\"')}", ${FALLBACK_FONTS}`);
    }

    const raw = stored("themeVars");
    if (!raw) return;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return;

    setColor("--color-background", v.background);
    setColor("--color-primary", v.primary);
    setColor("--color-secondary", v.secondary);
    setColor("--color-text", v.text);
    setColor("--color-muted", v.muted);
    setColor("--color-autocomplete", v.autocomplete);
    setColor("--color-highlight", v.highlight);
    setColor("--color-destructive", v.destructive);
    setColor("--color-success", v.success);
    setColor("--color-link-hover", v.linkHover);
    setColor("--color-surface", v.surface);
    setColor("--color-win-highlight", v.winHighlight);
    setColor("--color-win-shadow", v.winShadow);
    setColor("--color-title-text", v.titleText);
    if (typeof v.autocompleteOpacity === "number" && Number.isFinite(v.autocompleteOpacity)) {
      setVar("--autocomplete-opacity", String(Math.max(0, Math.min(1, v.autocompleteOpacity))));
    }
    if (appFont.length === 0) setVar("--font-family", v.fontFamily);
    if (typeof v.themeName === "string" && v.themeName.length > 0 && root.dataset) {
      root.dataset.theme = v.themeName;
    }
  } catch {}
})();
