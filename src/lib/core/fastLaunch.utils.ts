import { attemptSync } from "@hullperse/hp_utils/attempt";

export const readFastLaunch = (): boolean => {
  if (typeof localStorage === "undefined") return false;
  const [raw, readError] = attemptSync(() => localStorage.getItem("iluha.v1.settings"));
  if (readError !== null || !raw) return false;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return false;
  const data = (parsed as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
  return (data as { fastLaunch?: unknown }).fastLaunch === true;
};
