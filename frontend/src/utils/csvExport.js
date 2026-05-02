export function getExportTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

export function downloadCsvFile(filename, headers, rows) {
  const encodeCsvCell = (cell) => {
    if (typeof cell === "number" && Number.isFinite(cell)) {
      return String(cell);
    }
    const text = String(cell ?? "").replace(/"/g, '""');
    return `"${text}"`;
  };
  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => encodeCsvCell(cell))
        .join(",")
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
