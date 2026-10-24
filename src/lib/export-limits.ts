export const MAX_EXPORT_ROWS = 10_000;
export const MAX_EXPORT_COLUMNS = 10;

export function exportLimitError(rowCount: number, columnCount: number) {
  if (rowCount > MAX_EXPORT_ROWS) return "maxRows" as const;
  if (columnCount > MAX_EXPORT_COLUMNS) return "maxColumns" as const;
  return null;
}
