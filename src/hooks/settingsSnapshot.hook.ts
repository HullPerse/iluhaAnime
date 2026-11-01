import { useEffect, useState } from "react";

import { getSettingsSnapshot, subscribeSettings } from "@/store/settings.store";
import type { SettingsData } from "@/types/store/settings";

export function useSettingsSnapshot(): SettingsData {
  const [snapshot, setSnapshot] = useState<SettingsData>(getSettingsSnapshot);

  useEffect(() => subscribeSettings(() => setSnapshot(getSettingsSnapshot())), []);

  return snapshot;
}
