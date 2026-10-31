import { readFastLaunch } from "@/lib/core/fastLaunch.utils";

import { BigLoader } from "@/components/shared/loader/big.loader";

export function BootPending() {
  if (!readFastLaunch()) return null;
  return <BigLoader />;
}
