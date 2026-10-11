import { attemptSync } from "@/lib/utils/attempt.utils";

import { BigLoader } from "./loader.component";

export function readFastLaunch(): boolean {
  if (typeof localStorage === "undefined") return false;
  const [raw, readError] = attemptSync(() => localStorage.getItem("iluha.v1.settings"));
  if (readError !== null || !raw) return false;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return false;
  const data = (parsed as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
  return (data as { fastLaunch?: unknown }).fastLaunch === true;
}

export function BootPending() {
  if (!readFastLaunch()) return null;
  return <BigLoader />;
}
