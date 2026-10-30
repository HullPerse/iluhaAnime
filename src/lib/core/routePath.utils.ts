export function readRoutePath(): string {
  if (typeof window !== "undefined" && typeof window.location?.pathname === "string") {
    return window.location.pathname;
  }
  return "/";
}
