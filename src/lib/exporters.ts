import type { ExportResult } from '@/types';
import { downloadBlob } from './utils';

/**
 * Client-side export helpers. The libraries are loaded on demand so they do
 * not slow down the first page load. A backend could later generate these
 * files server-side instead; the UI would only swap the download call.
 */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportPdf(result: ExportResult) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: result.columns.length > 8 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(35, 105, 97);
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Mandera South Disease Surveillance System', 40, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Suspected disease reports: not a diagnosis. Demonstration data.', 40, 42);

  doc.setTextColor(15, 29, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(result.title, 40, 88);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 83);
  doc.text(result.subtitle, 40, 104);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, 40, 118);

  let x = 40;
  const y = 140;
  for (const s of result.summary) {
    doc.setFontSize(8);
    doc.setTextColor(107, 119, 117);
    doc.text(s.label.toUpperCase(), x, y);
    doc.setFontSize(12);
    doc.setTextColor(15, 29, 28);
    doc.text(s.value, x, y + 15);
    x += Math.max(90, doc.getTextWidth(s.value) + 30);
  }

  autoTable(doc, {
    startY: y + 32,
    head: [result.columns],
    body: result.rows.map((r) => r.map(String)),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [29, 85, 79] },
    alternateRowStyles: { fillColor: [245, 248, 247] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 80, h - 20);
      doc.text('CONFIDENTIAL: contains personal data. Handle according to data protection policy.', 40, h - 20);
    },
  });
  doc.save(`${slug(result.title)}-${stamp()}.pdf`);
}

export async function exportExcel(result: ExportResult) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const header = [[result.title], [result.subtitle], [], ...result.summary.map((s) => [s.label, s.value]), []];
  const ws = XLSX.utils.aoa_to_sheet([...header, result.columns, ...result.rows]);
  ws['!cols'] = result.columns.map((c) => ({ wch: Math.max(12, c.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slug(result.title)}-${stamp()}.xlsx`);
}

export function exportCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  downloadBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), `${slug(filename)}-${stamp()}.csv`);
}
