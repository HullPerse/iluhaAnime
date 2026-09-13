import Image from "@/components/ui/image.component";
import { displayCell, previewCell } from "@/lib/sqlite/row.utils";
import { isImageUrl } from "@/lib/utils/image.utils";

import { BlobImageCell } from "./blobImageCell.sqlite";

export function RowCell({
  value,
  column,
  interactive,
  row,
  rowKeys,
  showImages,
  blobColumns,
  selectedDatabase,
  selectedTable,
  openCell,
}: {
  value: unknown;
  column: string;
  interactive: boolean;
  row: unknown[];
  rowKeys: string[] | null;
  showImages: boolean;
  blobColumns: Set<string>;
  selectedDatabase: string;
  selectedTable: string;
  openCell: (row: unknown[], column: string) => void;
}) {
  const rendered = displayCell(value, column);
  const preview = previewCell(value, column);
  if (!interactive) return <>{preview}</>;
  const showBlobImage = showImages && blobColumns.has(column);
  const showUrlImage = showImages && isImageUrl(value);
  return (
    <button
      type="button"
      className="block w-full text-left hover:cursor-pointer"
      title={rendered}
      onClick={() => openCell(row, column)}
    >
      {showBlobImage && rowKeys ? (
        <BlobImageCell
          database={selectedDatabase}
          table={selectedTable}
          column={column}
          keys={rowKeys}
          alt={column}
        />
      ) : showUrlImage ? (
        <Image
          src={value as string}
          alt={column}
          type="contain"
          className="h-12 w-12 bg-white object-contain"
        />
      ) : (
        preview
      )}
    </button>
  );
}
