function escapeCsvCell(value: string) {
  const normalized = value.replaceAll('"', '""')
  return `"${normalized}"`
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csvContent = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csvContent}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}
