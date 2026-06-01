// =============================================================================
// Material Flow ERP — Single Report Engine
// Phase 12: one engine, no page-local exporters (runbook rule).
//
// Exports:
//   exportReportXLSX({ filename, title, subtitle, headers, rows, totals, autoTotals })
//   exportReportPDF({ filename, title, subtitle, headers, rows, totals })
//   exportStatementPDF({ filename, title, entityName, dateRange, transactions, balance })
// =============================================================================

import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---------- Brand constants ---------------------------------------------------
const BRAND = {
  name: 'Material Flow ERP',
  primaryRGB: [37, 99, 235],      // blue-600
  headerTextRGB: [255, 255, 255],
  rowAltRGB: [239, 246, 255],     // blue-50
  rowNormalRGB: [255, 255, 255],
  totalRowRGB: [219, 234, 254],   // blue-100
  textDark: [15, 23, 42],
  textMuted: [100, 116, 139],
};

// ---------- Column analysis --------------------------------------------------
const NON_SUMMABLE = /^(#|no|sl|s\.?n|rate|price|unit|%|per|avg|average|cost_per|unit_cost|unit_price)/i;

function isNumericValue(v) {
  if (v === null || v === undefined || v === '') return false;
  const s = String(v).trim();
  // Reject if contains any letter — codes like B-023 must stay text.
  if (/[a-zA-Z]/.test(s)) return false;
  return !isNaN(parseFloat(s.replace(/,/g, '')));
}

function detectNumericCols(headers, rows) {
  return headers.map((h, i) => {
    if (NON_SUMMABLE.test(h)) return false;
    const vals = rows.map(r => Array.isArray(r) ? r[i] : r[h]);
    const nonEmpty = vals.filter(v => v !== null && v !== undefined && v !== '');
    if (!nonEmpty.length) return false;
    return nonEmpty.every(v => isNumericValue(v));
  });
}

function computeAutoTotals(headers, rows) {
  const numericCols = detectNumericCols(headers, rows);
  return headers.map((_, i) => {
    if (!numericCols[i]) return null;
    const sum = rows.reduce((acc, r) => {
      const v = Array.isArray(r) ? r[i] : r[headers[i]];
      return acc + (parseFloat(String(v || 0).replace(/,/g, '')) || 0);
    }, 0);
    return sum;
  });
}

function fmtNum(v) {
  if (v === null || v === undefined) return '';
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =============================================================================
// EXCEL EXPORT (exceljs — real fills, fonts, SUM formulas)
// =============================================================================

export async function exportReportXLSX({
  filename,
  title,
  subtitle,
  headers = [],
  rows = [],
  totals = null,
  autoTotals: useAutoTotals = false,
  sheetName = 'Report',
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);

  const colCount = headers.length || 1;
  const [pr, pg, pb] = BRAND.primaryRGB;
  const primaryHex = `FF${pr.toString(16).padStart(2,'0')}${pg.toString(16).padStart(2,'0')}${pb.toString(16).padStart(2,'0')}`.toUpperCase();
  const altHex = `FF${BRAND.rowAltRGB.map(c=>c.toString(16).padStart(2,'0')).join('')}`.toUpperCase();
  const totalHex = `FF${BRAND.totalRowRGB.map(c=>c.toString(16).padStart(2,'0')).join('')}`.toUpperCase();

  // Row 1 — Title (merged)
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title || BRAND.name;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryHex } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 36;

  // Row 2 — Subtitle / date range
  if (subtitle) {
    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = subtitle;
    subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF' + BRAND.textMuted.map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase() } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryHex } };
    subCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 20;
  }

  // Row 3 — Generated timestamp
  const metaRow = subtitle ? 3 : 2;
  ws.mergeCells(metaRow, 1, metaRow, colCount);
  const metaCell = ws.getCell(metaRow, 1);
  metaCell.value = `Generated: ${new Date().toLocaleString('en-US')}   |   ${BRAND.name}`;
  metaCell.font = { name: 'Calibri', size: 9, color: { argb: 'FFAAAAAA' } };
  metaCell.alignment = { horizontal: 'right' };
  ws.getRow(metaRow).height = 16;

  const headerRow = metaRow + 1;
  const dataStartRow = headerRow + 1;

  // Header row
  const numericCols = detectNumericCols(headers, rows);
  const hRow = ws.getRow(headerRow);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryHex } };
    cell.alignment = { vertical: 'middle', horizontal: numericCols[i] ? 'right' : 'left', wrapText: false };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } } };
  });
  hRow.height = 28;

  // Data rows
  rows.forEach((row, ri) => {
    const dRow = ws.getRow(dataStartRow + ri);
    const isAlt = ri % 2 === 1;
    headers.forEach((h, ci) => {
      const v = Array.isArray(row) ? row[ci] : row[h];
      const cell = dRow.getCell(ci + 1);
      if (numericCols[ci] && v !== null && v !== undefined && v !== '') {
        const n = parseFloat(String(v).replace(/,/g, ''));
        cell.value = isNaN(n) ? v : n;
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.value = v ?? '';
        cell.alignment = { horizontal: 'left' };
      }
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? altHex : 'FFFFFFFF' } };
    });
    dRow.height = 20;
  });

  // Totals row
  const finalTotals = totals || (useAutoTotals ? computeAutoTotals(headers, rows) : null);
  if (finalTotals) {
    const dataEndRow = dataStartRow + rows.length - 1;
    const tRow = ws.getRow(dataEndRow + 1);
    finalTotals.forEach((v, ci) => {
      const cell = tRow.getCell(ci + 1);
      if (v !== null && rows.length > 0) {
        const colLetter = String.fromCharCode(65 + ci);
        cell.value = { formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`, result: v };
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else if (ci === 0) {
        cell.value = 'TOTAL';
      }
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalHex } };
      cell.border = { top: { style: 'medium', color: { argb: primaryHex } } };
    });
    tRow.height = 24;
  }

  // Auto-fit columns
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    const maxLen = Math.max(
      h.length,
      ...rows.map(r => String(Array.isArray(r) ? r[i] : r[h] ?? '').length)
    );
    col.width = Math.min(Math.max(maxLen + 2, 10), 40);
  });

  // Download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// =============================================================================
// PDF EXPORT (jsPDF + autotable)
// =============================================================================

export function exportReportPDF({
  filename,
  title,
  subtitle,
  headers = [],
  rows = [],
  totals = null,
  autoTotals: useAutoTotals = false,
  orientation = 'landscape',
}) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const [pr, pg, pb] = BRAND.primaryRGB;

  // Brand header band
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, pageW, 22, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title || BRAND.name, 14, 12);

  // Subtitle
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, 14, 19);
  }

  // Brand name right-aligned
  doc.setFontSize(8);
  doc.text(BRAND.name, pageW - 14, 12, { align: 'right' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, pageW - 14, 19, { align: 'right' });

  doc.setTextColor(...BRAND.textDark);

  // Compute totals
  const numericCols = detectNumericCols(headers, rows);
  const finalTotals = totals || (useAutoTotals ? computeAutoTotals(headers, rows) : null);

  // Build body
  const body = rows.map(row =>
    headers.map((h, i) => {
      const v = Array.isArray(row) ? row[i] : row[h];
      return (numericCols[i] && v !== null && v !== undefined && v !== '') ? fmtNum(v) : (v ?? '');
    })
  );

  if (finalTotals) {
    const totalRow = finalTotals.map((v, i) =>
      i === 0 ? 'TOTAL' : (v !== null ? fmtNum(v) : '')
    );
    body.push(totalRow);
  }

  const [ar, ag, ab] = BRAND.rowAltRGB;
  const [tr, tg, tb] = BRAND.totalRowRGB;

  autoTable(doc, {
    head: [headers],
    body,
    startY: 26,
    margin: { left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, textColor: BRAND.textDark },
    headStyles: {
      fillColor: [pr, pg, pb],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: Object.fromEntries(
      headers.map((_, i) => [i, { halign: numericCols[i] ? 'right' : 'left' }])
    ),
    alternateRowStyles: { fillColor: [ar, ag, ab] },
    didParseCell(data) {
      if (finalTotals && data.row.index === body.length - 1) {
        data.cell.styles.fillColor = [tr, tg, tb];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage(data) {
      // Footer on each page
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(
        `Page ${data.pageNumber} — ${BRAND.name}`,
        pageW / 2, pageH - 5, { align: 'center' }
      );
    },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

// =============================================================================
// Thin backwards-compat wrappers (for any old call sites)
// =============================================================================

export function exportXLSX(filename, title, headers, rows, totalsRow, dateRange) {
  return exportReportXLSX({
    filename,
    title,
    subtitle: dateRange,
    headers,
    rows,
    totals: totalsRow || null,
    autoTotals: !totalsRow,
  });
}

export function exportPDF(filename, title, headers, rows, totalsRow, dateRange) {
  return exportReportPDF({
    filename,
    title,
    subtitle: dateRange,
    headers,
    rows,
    totals: totalsRow || null,
    autoTotals: !totalsRow,
  });
}
