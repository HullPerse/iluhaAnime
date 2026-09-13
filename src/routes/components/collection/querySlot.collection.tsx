import type { ReactNode } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionDataResult } from "@/types/collection";

export function CollectionQuerySlot({
  status,
  isEmpty,
  children,
}: {
  status: Pick<CollectionDataResult, "isLoading" | "isFetching" | "isError" | "error" | "refetch">;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { isLoading, isFetching, isError, error, refetch } = status;
  if (isLoading || (isFetching && isEmpty)) return <TabLoader className="flex-1" />;
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6" role="alert">
        <span className="windows95-text text-destructive text-center">
          {t("collection.data.load.error", {
            error: error instanceof Error ? error.message : String(error ?? t("common.error")),
          })}
        </span>
        <Button onClick={() => refetch()} className="text-xs">
          {t("collection.data.retry")}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
