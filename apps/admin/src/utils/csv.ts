/**
 * 简易 CSV 导出（无依赖，浏览器 API）。
 * 加 BOM 前缀以兼容 Excel 中文。仅导出匿名聚合，不含用户标识。
 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (cell: string | number | null | undefined) => {
    const text = String(cell ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
