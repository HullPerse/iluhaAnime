import type { ReactNode } from "react";

export function SqliteObjectGrid({
  pane,
  backup,
  tables,
  showBackup,
}: {
  pane: ReactNode;
  backup: ReactNode;
  tables: ReactNode;
  showBackup: boolean;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[110px_1fr] items-stretch gap-1">
      {pane}
      <div className="flex min-h-0 min-w-0 flex-col gap-1 overflow-y-auto">
        {showBackup ? backup : tables}
      </div>
    </div>
  );
}
