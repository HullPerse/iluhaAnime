type ToastType = "info" | "error" | "success";

const TOAST_DURATION = 3000;

export function showToast(message: string, type: ToastType = "info") {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;transition:opacity .2s;";

  const icons: Record<ToastType, string> = {
    info: "ⓘ",
    error: "✕",
    success: "✓",
  };

  el.innerHTML = `
    <div class="windows95-border bg-primary px-2 py-1 windows95-text flex items-center gap-1 shadow-md">
      <span style="color:${type === "error" ? "#c00" : type === "success" ? "#0a0" : "#00a"}">${icons[type]}</span>
      <span class="windows95-text">${escHtml(message)}</span>
    </div>
  `;

  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, TOAST_DURATION);
}

function escHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
