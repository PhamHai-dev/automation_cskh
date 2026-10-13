/**
 * Client-side CSV export helper.
 * Builds a CSV string from an array of row objects and triggers a download.
 * Quoting follows RFC-4180 (wrap in quotes if it contains , " or newline).
 */
export function downloadCSV(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: string[],
): void {
  if (!rows.length) return;

  const headers = columns && columns.length ? columns : Object.keys(rows[0]);

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [];
  lines.push(headers.map(escape).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }

  // BOM so Excel reads UTF-8 (Vietnamese diacritics) correctly
  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
