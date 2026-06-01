import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import { CheckCircle, AlertTriangle, XCircle, Upload, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// ---------- consistency checks ----------------------------------------------
function runConsistencyChecks({ sales, inventory, customers, products, payments, transfers }) {
  const checks = [];

  // Sales with no warehouse
  const salesNoWarehouse = sales.filter(s => !s.warehouse_id);
  checks.push({
    name: 'Sales must have a warehouse',
    status: salesNoWarehouse.length === 0 ? 'pass' : 'warn',
    detail: salesNoWarehouse.length ? `${salesNoWarehouse.length} sale(s) missing warehouse` : 'All sales have a warehouse',
  });

  // Negative inventory
  const negStock = inventory.filter(i => (i.quantity || 0) < 0);
  checks.push({
    name: 'No negative inventory',
    status: negStock.length === 0 ? 'pass' : 'fail',
    detail: negStock.length ? `${negStock.length} stock row(s) with negative qty` : 'All quantities ≥ 0',
  });

  // Customers with balance mismatch (total_credit - total_paid should ≈ balance)
  const balanceMismatches = customers.filter(c => {
    const expected = (c.total_credit || 0) - (c.total_paid || 0);
    return Math.abs(expected - (c.balance || 0)) > 1;
  });
  checks.push({
    name: 'Customer balance = credit − paid',
    status: balanceMismatches.length === 0 ? 'pass' : 'warn',
    detail: balanceMismatches.length ? `${balanceMismatches.length} customer(s) with balance mismatch` : 'All balances correct',
  });

  // Duplicate invoice numbers
  const invoiceNums = sales.map(s => s.invoice_number).filter(Boolean);
  const dupes = invoiceNums.filter((v, i, a) => a.indexOf(v) !== i);
  checks.push({
    name: 'No duplicate invoice numbers',
    status: dupes.length === 0 ? 'pass' : 'fail',
    detail: dupes.length ? `Duplicate invoices: ${[...new Set(dupes)].join(', ')}` : 'All invoice numbers unique',
  });

  // Transfers stuck in pending > 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const stuckTransfers = transfers.filter(t => t.status === 'pending' && t.created_at < thirtyDaysAgo);
  checks.push({
    name: 'No transfers stuck pending > 30 days',
    status: stuckTransfers.length === 0 ? 'pass' : 'warn',
    detail: stuckTransfers.length ? `${stuckTransfers.length} transfer(s) pending for over 30 days` : 'All transfers resolved promptly',
  });

  // Products with no inventory record
  const stockProductIds = new Set(inventory.map(i => i.product_id));
  const productsNoStock = products.filter(p => p.status === 'active' && !stockProductIds.has(p.id));
  checks.push({
    name: 'Active products have inventory records',
    status: productsNoStock.length === 0 ? 'pass' : 'warn',
    detail: productsNoStock.length ? `${productsNoStock.length} active product(s) with no stock record` : 'All active products have stock records',
  });

  return checks;
}

// ---------- Excel reconciliation --------------------------------------------
function detectHeaderRow(sheet) {
  const ref = sheet['!ref'];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  let bestRow = 0, bestScore = -1;
  for (let r = range.s.r; r <= Math.min(range.s.r + 9, range.e.r); r++) {
    let nonEmpty = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== undefined && cell.v !== '' && String(cell.v).length >= 3) nonEmpty++;
    }
    if (nonEmpty > bestScore) { bestScore = nonEmpty; bestRow = r; }
  }
  return bestRow;
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatch(excelHeaders, appHeaders) {
  return excelHeaders.map(eh => {
    const neh = normalizeKey(eh);
    if (!neh) return null;
    const match = appHeaders.find(ah => normalizeKey(ah).includes(neh) || neh.includes(normalizeKey(ah)));
    return match || null;
  });
}

function reconcileRows(excelRows, appRows, keyFields) {
  const normalize = v => String(v || '').trim().toLowerCase();
  const makeKey = (row, fields) => fields.map(f => normalize(row[f] || '')).join('||');

  const appMap = new Map(appRows.map(r => [makeKey(r, keyFields), r]));
  const results = { onlyInExcel: [], onlyInApp: [], mismatches: [] };

  const excelKeys = new Set();
  for (const eRow of excelRows) {
    const key = makeKey(eRow, keyFields);
    excelKeys.add(key);
    const aRow = appMap.get(key);
    if (!aRow) {
      results.onlyInExcel.push(eRow);
    } else {
      const diffs = [];
      for (const [k, ev] of Object.entries(eRow)) {
        if (!keyFields.includes(k)) {
          const av = aRow[k];
          if (normalize(String(ev)) !== normalize(String(av ?? ''))) {
            diffs.push({ field: k, excel: ev, app: av });
          }
        }
      }
      if (diffs.length) results.mismatches.push({ key, diffs });
    }
  }

  for (const [key, aRow] of appMap) {
    if (!excelKeys.has(key)) results.onlyInApp.push(aRow);
  }

  return results;
}

// ---------- Component -------------------------------------------------------
export default function DataAudit() {
  const [xlFile, setXlFile] = useState(null);
  const [xlRows, setXlRows] = useState(null);
  const [reconResult, setReconResult] = useState(null);
  const [parsing, setParsing] = useState(false);

  const { data: sales = [] }     = useQuery({ queryKey: ['sales'],     queryFn: () => base44.entities.Sale.list() });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: products = [] }  = useQuery({ queryKey: ['products'],  queryFn: () => base44.entities.Product.list() });
  const { data: payments = [] }  = useQuery({ queryKey: ['payments'],  queryFn: () => base44.entities.Payment.list() });
  const { data: transfers = [] } = useQuery({ queryKey: ['transfers'], queryFn: () => base44.entities.Transfer.list() });

  const checks = React.useMemo(() => runConsistencyChecks({ sales, inventory, customers, products, payments, transfers }),
    [sales, inventory, customers, products, payments, transfers]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setReconResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const headerRow = detectHeaderRow(ws);
      const data = XLSX.utils.sheet_to_json(ws, { range: headerRow, defval: '' });
      setXlRows(data);
      setXlFile(file.name);
    } catch (err) {
      alert('Failed to parse file: ' + err.message);
    } finally {
      setParsing(false);
    }
  }, []);

  function reconcileVsSales() {
    if (!xlRows) return;
    const appRows = sales.map(s => ({
      invoice_number: s.invoice_number,
      customer_name: s.customer_name || '',
      sale_date: s.sale_date || '',
      total: String(s.total || 0),
    }));
    const excelMapped = xlRows.map(r => {
      const headers = Object.keys(r);
      const matches = fuzzyMatch(headers, ['invoice_number', 'customer_name', 'sale_date', 'total']);
      const out = {};
      headers.forEach((h, i) => { if (matches[i]) out[matches[i]] = r[h]; });
      return out;
    }).filter(r => r.invoice_number);
    setReconResult(reconcileRows(excelMapped, appRows, ['invoice_number']));
  }

  const statusIcon = { pass: <CheckCircle className="w-4 h-4 text-emerald-600" />, warn: <AlertTriangle className="w-4 h-4 text-amber-500" />, fail: <XCircle className="w-4 h-4 text-red-500" /> };
  const statusBadge = { pass: 'default', warn: 'secondary', fail: 'destructive' };

  return (
    <div className="space-y-6">
      <PageHeader title="Data Audit" description="Consistency checks and Excel reconciliation" />

      {/* Consistency checks */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40">
          <h2 className="font-semibold text-sm">Consistency Checks</h2>
        </div>
        <ul className="divide-y">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5">{statusIcon[c.status]}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </div>
              <Badge variant={statusBadge[c.status]} className="shrink-0 capitalize">{c.status}</Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* Excel reconciliation */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40">
          <h2 className="font-semibold text-sm">Excel Reconciliation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Upload a spreadsheet to compare against the app's sales data.</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer">
              <input type="file" className="sr-only" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
              <Button variant="outline" size="sm" asChild disabled={parsing}>
                <span>
                  {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Parsing…</> : <><Upload className="w-4 h-4 mr-2" />Upload spreadsheet</>}
                </span>
              </Button>
            </label>
            {xlFile && <span className="text-xs text-muted-foreground">{xlFile} ({xlRows?.length} rows)</span>}
            {xlRows && (
              <Button size="sm" onClick={reconcileVsSales}>
                Reconcile vs Sales
              </Button>
            )}
          </div>

          {reconResult && (
            <div className="space-y-3">
              {reconResult.onlyInExcel.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-600 mb-1">In Excel only ({reconResult.onlyInExcel.length})</p>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {reconResult.onlyInExcel.slice(0, 20).map((r, i) => (
                      <li key={i} className="font-mono bg-amber-50 rounded px-2 py-1">{JSON.stringify(r)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reconResult.onlyInApp.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-blue-600 mb-1">In App only ({reconResult.onlyInApp.length})</p>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {reconResult.onlyInApp.slice(0, 20).map((r, i) => (
                      <li key={i} className="font-mono bg-blue-50 rounded px-2 py-1">{r.invoice_number || JSON.stringify(r)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reconResult.mismatches.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-600 mb-1">Value mismatches ({reconResult.mismatches.length})</p>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {reconResult.mismatches.slice(0, 20).map((m, i) => (
                      <li key={i} className="bg-red-50 rounded px-2 py-1">
                        <span className="font-mono font-medium">{m.key}</span>
                        {m.diffs.map((d, j) => (
                          <span key={j} className="ml-2 text-muted-foreground">{d.field}: Excel="{d.excel}" App="{d.app}"</span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reconResult.onlyInExcel.length === 0 && reconResult.onlyInApp.length === 0 && reconResult.mismatches.length === 0 && (
                <p className="text-sm text-emerald-600 font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Perfect match — Excel and app data are identical.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
