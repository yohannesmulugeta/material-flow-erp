/**
 * Construction Materials ERP — Realistic Seed Data
 * Run: node scripts/seed-construction.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qpxdhnabiledsjcnbvnv.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFweGRobmFiaWxlZHNqY25idm52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDM0Mjk0OCwiZXhwIjoyMDk1OTE4OTQ4fQ.bl0LzvQ8SneL-I9zJjmysr5IuAF0Lpn9i8oJmosBmXM';

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const ok = (label, n) => console.log(`  ✓ ${label}: ${n}`);
const err = (label, e) => console.error(`  ✗ ${label}:`, e.message);

async function ins(table, rows) {
  const { data, error } = await db.from(table).insert(rows).select('id');
  if (error) { err(table, error); return []; }
  ok(table, rows.length);
  return data;
}

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function clearOldData() {
  console.log('\nClearing previous seed data...');
  const tables = ['container_items','inventory_stocks','stock_transactions','sales_returns',
    'stock_adjustments','damage_records','transfers','account_transactions',
    'payments','sales','containers','products','product_categories',
    'customers','suppliers','warehouses','accounts','activity_logs','approval_requests'];
  for (const t of tables) {
    await db.from(t).delete().not('id', 'is', null);
  }
  console.log('  ✓ Cleared\n');
}

async function seed() {
  console.log('🏗️  Seeding Construction Materials ERP...\n');

  await clearOldData();

  // ── Warehouses ───────────────────────────────────────────────────────────
  console.log('Warehouses...');
  const whs = await ins('warehouses', [
    { name: 'Main Store – Bole', location: 'Bole Industrial Zone, Addis Ababa', description: 'Primary receiving and dispatch store', status: 'active' },
    { name: 'Yard Store – Akaki', location: 'Akaki-Kality, Addis Ababa', description: 'Heavy materials and bulk storage yard', status: 'active' },
    { name: 'Branch – Adama', location: 'Adama Industrial Park, Oromia', description: 'Central Ethiopia branch depot', status: 'active' },
  ]);
  const [wh1, wh2, wh3] = whs.map(w => w.id);

  // ── Categories ────────────────────────────────────────────────────────────
  console.log('Categories...');
  const cats = await ins('product_categories', [
    { name: 'Cement & Concrete', description: 'Cement, mortar, concrete products', status: 'active' },
    { name: 'Steel & Metals', description: 'Rebar, wire mesh, structural steel', status: 'active' },
    { name: 'Tiles & Flooring', description: 'Ceramic tiles, porcelain, marble', status: 'active' },
    { name: 'Paints & Chemicals', description: 'Interior/exterior paints, primers, solvents', status: 'active' },
    { name: 'Plumbing & Sanitary', description: 'Pipes, fittings, sanitary ware', status: 'active' },
    { name: 'Electrical Materials', description: 'Cables, conduits, switches, sockets', status: 'active' },
    { name: 'Timber & Wood', description: 'Lumber, plywood, chipboard', status: 'active' },
    { name: 'Tools & Equipment', description: 'Hand tools, power tools, safety gear', status: 'active' },
  ]);
  const [catCem, catSteel, catTile, catPaint, catPlumb, catElec, catWood, catTool] = cats.map(c => c.id);

  // ── Suppliers ─────────────────────────────────────────────────────────────
  console.log('Suppliers...');
  const sups = await ins('suppliers', [
    { name: 'Mugher Cement Enterprise', country: 'Ethiopia', contact_person: 'Ato Girma Bekele', phone: '+251-11-441-5512', email: 'supply@mughercement.et', status: 'active' },
    { name: 'Derba Midroc Cement', country: 'Ethiopia', contact_person: 'W/o Tigist Alemu', phone: '+251-11-552-3344', email: 'sales@derbacement.et', status: 'active' },
    { name: 'Sino Steel Trading LLC', country: 'China', contact_person: 'Wang Fang', phone: '+86-21-6655-4433', email: 'wfang@sinosteel.cn', status: 'active' },
    { name: 'Addis Metal Works PLC', country: 'Ethiopia', contact_person: 'Ato Tesfaye Hailu', phone: '+251-11-443-7788', email: 'info@addismetal.et', status: 'active' },
    { name: 'Turkish Tiles & Ceramics A.S.', country: 'Turkey', contact_person: 'Ahmet Özdemir', phone: '+90-212-444-8899', email: 'ahmet@turktiles.tr', status: 'active' },
    { name: 'Gulf Paint & Coatings LLC', country: 'UAE', contact_person: 'Khalid Al Mansouri', phone: '+971-4-333-6677', email: 'khalid@gulfpaint.ae', status: 'active' },
    { name: 'Nile Plumbing Supplies', country: 'Ethiopia', contact_person: 'Ato Mulugeta Seyoum', phone: '+251-11-556-2233', email: 'mulugeta@nileplumb.et', status: 'active' },
  ]);
  const [sup1, sup2, sup3, sup4, sup5, sup6, sup7] = sups.map(s => s.id);
  const supNames = sups.map(s => s.name);

  // ── Products ──────────────────────────────────────────────────────────────
  console.log('Products...');
  const prods = await ins('products', [
    // Cement
    { name: 'Portland Cement OPC 42.5 – 50kg', sku: 'CEM-OPC-42-50', category_id: catCem, brand: 'Mugher', unit: 'bag', min_stock_level: 500, reorder_level: 1000, default_selling_price: 680, tax_rate: 0, status: 'active' },
    { name: 'Portland Cement OPC 32.5 – 50kg', sku: 'CEM-OPC-32-50', category_id: catCem, brand: 'Derba', unit: 'bag', min_stock_level: 300, reorder_level: 600, default_selling_price: 620, tax_rate: 0, status: 'active' },
    { name: 'White Cement – 40kg', sku: 'CEM-WHT-40', category_id: catCem, brand: 'Imported', unit: 'bag', min_stock_level: 100, reorder_level: 200, default_selling_price: 1850, tax_rate: 0, status: 'active' },
    { name: 'Concrete Block 20x20x40cm', sku: 'BLK-CON-20', category_id: catCem, brand: 'Local', unit: 'pcs', min_stock_level: 2000, reorder_level: 4000, default_selling_price: 42, tax_rate: 0, status: 'active' },
    // Steel
    { name: 'Deformed Steel Bar Ø8mm – 12m', sku: 'STL-RBR-08-12', category_id: catSteel, brand: 'Addis Metal', unit: 'pc', min_stock_level: 200, reorder_level: 500, default_selling_price: 620, tax_rate: 0, status: 'active' },
    { name: 'Deformed Steel Bar Ø10mm – 12m', sku: 'STL-RBR-10-12', category_id: catSteel, brand: 'Addis Metal', unit: 'pc', min_stock_level: 200, reorder_level: 500, default_selling_price: 920, tax_rate: 0, status: 'active' },
    { name: 'Deformed Steel Bar Ø12mm – 12m', sku: 'STL-RBR-12-12', category_id: catSteel, brand: 'Addis Metal', unit: 'pc', min_stock_level: 150, reorder_level: 400, default_selling_price: 1350, tax_rate: 0, status: 'active' },
    { name: 'Deformed Steel Bar Ø16mm – 12m', sku: 'STL-RBR-16-12', category_id: catSteel, brand: 'Sino Steel', unit: 'pc', min_stock_level: 100, reorder_level: 300, default_selling_price: 2400, tax_rate: 0, status: 'active' },
    { name: 'BRC Wire Mesh 2.4x6m (10x10)', sku: 'STL-MESH-10', category_id: catSteel, brand: 'Sino Steel', unit: 'sheet', min_stock_level: 50, reorder_level: 150, default_selling_price: 4800, tax_rate: 0, status: 'active' },
    // Tiles
    { name: 'Ceramic Floor Tile 40x40 (Glossy)', sku: 'TIL-CER-40G', category_id: catTile, brand: 'Turkish', unit: 'm²', min_stock_level: 200, reorder_level: 500, default_selling_price: 320, tax_rate: 15, status: 'active' },
    { name: 'Porcelain Wall Tile 30x60 (White)', sku: 'TIL-POR-30W', category_id: catTile, brand: 'Turkish', unit: 'm²', min_stock_level: 150, reorder_level: 400, default_selling_price: 480, tax_rate: 15, status: 'active' },
    { name: 'Granite Tile 60x60 (Dark Grey)', sku: 'TIL-GRN-60D', category_id: catTile, brand: 'Imported', unit: 'm²', min_stock_level: 100, reorder_level: 300, default_selling_price: 850, tax_rate: 15, status: 'active' },
    // Paint
    { name: 'Exterior Emulsion Paint 20L (White)', sku: 'PNT-EXT-20W', category_id: catPaint, brand: 'Gulf Paint', unit: 'can', min_stock_level: 100, reorder_level: 200, default_selling_price: 1850, tax_rate: 15, status: 'active' },
    { name: 'Interior Emulsion Paint 20L (Magnolia)', sku: 'PNT-INT-20M', category_id: catPaint, brand: 'Gulf Paint', unit: 'can', min_stock_level: 80, reorder_level: 160, default_selling_price: 1650, tax_rate: 15, status: 'active' },
    { name: 'Waterproof Coating 18L', sku: 'PNT-WTR-18', category_id: catPaint, brand: 'Gulf Paint', unit: 'can', min_stock_level: 50, reorder_level: 100, default_selling_price: 2800, tax_rate: 15, status: 'active' },
    // Plumbing
    { name: 'uPVC Pipe 1/2" x 4m', sku: 'PLB-PVC-12-4', category_id: catPlumb, brand: 'Nile', unit: 'pc', min_stock_level: 100, reorder_level: 300, default_selling_price: 185, tax_rate: 0, status: 'active' },
    { name: 'uPVC Pipe 2" x 4m', sku: 'PLB-PVC-2-4', category_id: catPlumb, brand: 'Nile', unit: 'pc', min_stock_level: 100, reorder_level: 300, default_selling_price: 480, tax_rate: 0, status: 'active' },
    { name: 'Squatting Pan WC (White)', sku: 'PLB-WC-SQT', category_id: catPlumb, brand: 'Imported', unit: 'pcs', min_stock_level: 20, reorder_level: 40, default_selling_price: 1200, tax_rate: 15, status: 'active' },
    // Electrical
    { name: 'NYM 2.5mm² Twin+Earth Cable 100m', sku: 'ELC-NYM-25-100', category_id: catElec, brand: 'Imported', unit: 'roll', min_stock_level: 30, reorder_level: 60, default_selling_price: 4200, tax_rate: 15, status: 'active' },
    { name: 'Single Socket Outlet (White)', sku: 'ELC-SKT-SGL', category_id: catElec, brand: 'Imported', unit: 'pcs', min_stock_level: 100, reorder_level: 200, default_selling_price: 185, tax_rate: 15, status: 'active' },
  ]);
  const pIds = prods.map(p => p.id);
  const pNames = prods.map(p => p.name);

  // ── Customers ─────────────────────────────────────────────────────────────
  console.log('Customers...');
  const custs = await ins('customers', [
    { name: 'Sunshine Construction PLC', phone: '+251-11-557-3311', email: 'info@sunshineconstruction.et', address: 'CMC, Addis Ababa', credit_limit: 500000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Ethio Real Estate Development', phone: '+251-11-662-4455', email: 'procurement@ethiorealestate.et', address: 'Bole, Addis Ababa', credit_limit: 1000000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Nifas Silk Contractors', phone: '+251-11-438-7722', email: 'nifassilk@contractors.et', address: 'Nifas Silk, Addis Ababa', credit_limit: 300000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Hawassa Industrial Village PLC', phone: '+251-46-221-5566', email: 'procurement@hiv.et', address: 'Hawassa, SNNPR', credit_limit: 800000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Adama Building Solutions', phone: '+251-22-113-4488', email: 'adama@buildingsolutions.et', address: 'Adama, Oromia', credit_limit: 400000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Great Rift General Contractor', phone: '+251-46-335-2211', email: 'grift@contractor.et', address: 'Ziway, Oromia', credit_limit: 250000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Bold Design & Build', phone: '+251-11-553-9900', email: 'bold@designbuild.et', address: 'Yeka, Addis Ababa', credit_limit: 350000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Jimma Road Contractors', phone: '+251-47-112-8833', email: 'jimma@roadcontractors.et', address: 'Jimma, Oromia', credit_limit: 200000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Atlas Infrastructure Ltd', phone: '+251-11-441-6655', email: 'atlas@infrastructure.et', address: 'Kirkos, Addis Ababa', credit_limit: 2000000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Gondarin Housing Development', phone: '+251-58-220-3377', email: 'gondarin@housing.et', address: 'Gondar, Amhara', credit_limit: 600000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
  ]);
  const cIds = custs.map(c => c.id);
  const cNames = custs.map(c => c.name);

  // ── Accounts ──────────────────────────────────────────────────────────────
  console.log('Accounts...');
  const accs = await ins('accounts', [
    { name: 'Cash Register', type: 'informal', balance: 125000, description: 'On-site cash', status: 'active' },
    { name: 'CBE Business Account', type: 'formal', balance: 3850000, description: 'Commercial Bank of Ethiopia', status: 'active' },
    { name: 'Awash Bank Account', type: 'formal', balance: 1250000, description: 'Awash International Bank', status: 'active' },
  ]);
  const [acc1, acc2, acc3] = accs.map(a => a.id);

  // ── Containers ────────────────────────────────────────────────────────────
  console.log('Containers...');
  const cons = await ins('containers', [
    { container_number: 'TCKU-2024-C01', supplier_id: sup5, supplier_name: supNames[4], country: 'Turkey', arrival_date: daysAgo(75), currency: 'USD', exchange_rate: 56.8, freight_cost: 62000, insurance_cost: 18000, customs_cost: 115000, transport_cost: 28000, loading_cost: 10000, unloading_cost: 12000, other_costs: 8000, total_product_cost_usd: 68500, total_import_cost_etb: 253000, status: 'received', receiving_warehouse_id: wh1, notes: 'Ceramic and porcelain tiles batch' },
    { container_number: 'MSCU-2024-C02', supplier_id: sup6, supplier_name: supNames[5], country: 'UAE', arrival_date: daysAgo(45), currency: 'USD', exchange_rate: 57.2, freight_cost: 48000, insurance_cost: 14000, customs_cost: 88000, transport_cost: 22000, loading_cost: 8500, unloading_cost: 9500, other_costs: 6000, total_product_cost_usd: 42000, total_import_cost_etb: 196000, status: 'received', receiving_warehouse_id: wh1, notes: 'Paint and waterproofing products' },
    { container_number: 'HDMU-2024-C03', supplier_id: sup3, supplier_name: supNames[2], country: 'China', arrival_date: daysAgo(20), currency: 'USD', exchange_rate: 57.5, freight_cost: 72000, insurance_cost: 22000, customs_cost: 148000, transport_cost: 35000, loading_cost: 14000, unloading_cost: 16000, other_costs: 10000, total_product_cost_usd: 125000, total_import_cost_etb: 317000, status: 'arrived', receiving_warehouse_id: wh2, notes: 'Steel rebar and wire mesh' },
    { container_number: 'OOLU-2024-C04', supplier_id: sup5, supplier_name: supNames[4], country: 'Turkey', arrival_date: daysAgo(100), currency: 'USD', exchange_rate: 56.0, freight_cost: 58000, insurance_cost: 16000, customs_cost: 108000, transport_cost: 26000, loading_cost: 9000, unloading_cost: 11000, other_costs: 7000, total_product_cost_usd: 55000, total_import_cost_etb: 235000, status: 'closed', receiving_warehouse_id: wh1 },
  ]);
  const [con1, con2, con3] = cons.map(c => c.id);

  // ── Inventory Stocks ──────────────────────────────────────────────────────
  console.log('Inventory stocks...');
  await ins('inventory_stocks', [
    // Cement — Akaki yard
    { product_id: pIds[0], product_name: pNames[0], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 3500, avg_cost_etb: 408, total_value_etb: 1428000 },
    { product_id: pIds[1], product_name: pNames[1], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 2200, avg_cost_etb: 372, total_value_etb: 818400 },
    { product_id: pIds[2], product_name: pNames[2], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 180, avg_cost_etb: 1110, total_value_etb: 199800 },
    { product_id: pIds[3], product_name: pNames[3], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 15000, avg_cost_etb: 25, total_value_etb: 375000 },
    // Steel — Akaki yard
    { product_id: pIds[4], product_name: pNames[4], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 850, avg_cost_etb: 372, total_value_etb: 316200 },
    { product_id: pIds[5], product_name: pNames[5], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 620, avg_cost_etb: 552, total_value_etb: 342240 },
    { product_id: pIds[6], product_name: pNames[6], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 480, avg_cost_etb: 810, total_value_etb: 388800 },
    { product_id: pIds[7], product_name: pNames[7], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 200, avg_cost_etb: 1440, total_value_etb: 288000 },
    { product_id: pIds[8], product_name: pNames[8], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 120, avg_cost_etb: 2880, total_value_etb: 345600 },
    // Tiles — Main store
    { product_id: pIds[9], product_name: pNames[9], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 850, avg_cost_etb: 192, total_value_etb: 163200 },
    { product_id: pIds[10], product_name: pNames[10], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 60, avg_cost_etb: 288, total_value_etb: 17280 }, // LOW STOCK alert
    { product_id: pIds[11], product_name: pNames[11], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 320, avg_cost_etb: 510, total_value_etb: 163200 },
    // Paint
    { product_id: pIds[12], product_name: pNames[12], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 280, avg_cost_etb: 1110, total_value_etb: 310800 },
    { product_id: pIds[13], product_name: pNames[13], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 220, avg_cost_etb: 990, total_value_etb: 217800 },
    { product_id: pIds[14], product_name: pNames[14], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 95, avg_cost_etb: 1680, total_value_etb: 159600 },
    // Plumbing
    { product_id: pIds[15], product_name: pNames[15], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 450, avg_cost_etb: 111, total_value_etb: 49950 },
    { product_id: pIds[16], product_name: pNames[16], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 280, avg_cost_etb: 288, total_value_etb: 80640 },
    { product_id: pIds[17], product_name: pNames[17], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 85, avg_cost_etb: 720, total_value_etb: 61200 },
    // Electrical
    { product_id: pIds[18], product_name: pNames[18], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 75, avg_cost_etb: 2520, total_value_etb: 189000 },
    { product_id: pIds[19], product_name: pNames[19], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 420, avg_cost_etb: 111, total_value_etb: 46620 },
    // Adama branch
    { product_id: pIds[0], product_name: pNames[0], warehouse_id: wh3, warehouse_name: 'Branch – Adama', quantity: 800, avg_cost_etb: 408, total_value_etb: 326400 },
    { product_id: pIds[5], product_name: pNames[5], warehouse_id: wh3, warehouse_name: 'Branch – Adama', quantity: 150, avg_cost_etb: 552, total_value_etb: 82800 },
    { product_id: pIds[9], product_name: pNames[9], warehouse_id: wh3, warehouse_name: 'Branch – Adama', quantity: 200, avg_cost_etb: 192, total_value_etb: 38400 },
  ]);

  // ── Sales ─────────────────────────────────────────────────────────────────
  console.log('Sales...');
  const salesTemplates = [
    { items: [{ i: 0, q: 500, p: 680, c: 408 }, { i: 4, q: 100, p: 620, c: 372 }, { i: 5, q: 80, p: 920, c: 552 }], ci: 0, wh: wh2 },
    { items: [{ i: 9, q: 200, p: 320, c: 192 }, { i: 10, q: 150, p: 480, c: 288 }, { i: 11, q: 100, p: 850, c: 510 }], ci: 1, wh: wh1 },
    { items: [{ i: 12, q: 50, p: 1850, c: 1110 }, { i: 13, q: 40, p: 1650, c: 990 }, { i: 14, q: 20, p: 2800, c: 1680 }], ci: 2, wh: wh1 },
    { items: [{ i: 6, q: 100, p: 1350, c: 810 }, { i: 7, q: 50, p: 2400, c: 1440 }, { i: 8, q: 30, p: 4800, c: 2880 }], ci: 3, wh: wh2 },
    { items: [{ i: 1, q: 400, p: 620, c: 372 }, { i: 3, q: 2000, p: 42, c: 25 }], ci: 4, wh: wh2 },
    { items: [{ i: 15, q: 100, p: 185, c: 111 }, { i: 16, q: 80, p: 480, c: 288 }, { i: 17, q: 30, p: 1200, c: 720 }], ci: 5, wh: wh1 },
    { items: [{ i: 18, q: 15, p: 4200, c: 2520 }, { i: 19, q: 100, p: 185, c: 111 }], ci: 6, wh: wh1 },
    { items: [{ i: 0, q: 1000, p: 680, c: 408 }, { i: 5, q: 200, p: 920, c: 552 }, { i: 6, q: 150, p: 1350, c: 810 }], ci: 8, wh: wh2 },
    { items: [{ i: 9, q: 300, p: 320, c: 192 }, { i: 12, q: 60, p: 1850, c: 1110 }], ci: 9, wh: wh1 },
    { items: [{ i: 2, q: 40, p: 1850, c: 1110 }, { i: 11, q: 80, p: 850, c: 510 }], ci: 7, wh: wh1 },
  ];

  const salesData = [];
  let invNum = 5001;
  for (let day = 90; day >= 1; day -= rnd(2, 5)) {
    const tmpl = pick(salesTemplates);
    const saleItems = tmpl.items.map(it => ({
      product_id: pIds[it.i], product_name: pNames[it.i],
      quantity: it.q, unit_price: it.p, unit_cost: it.c,
      discount: 0, total: it.q * it.p, profit: it.q * (it.p - it.c)
    }));
    const subtotal = saleItems.reduce((s, i) => s + i.total, 0);
    const disc = pick([0, 0, 0, 3, 5]);
    const discAmt = subtotal * disc / 100;
    const total = subtotal - discAmt;
    const totalCost = saleItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
    const saleType = pick(['cash', 'cash', 'credit', 'credit', 'credit']);
    salesData.push({
      invoice_number: `INV-2024-${invNum++}`,
      customer_id: cIds[tmpl.ci],
      customer_name: cNames[tmpl.ci],
      warehouse_id: tmpl.wh,
      warehouse_name: tmpl.wh === wh1 ? 'Main Store – Bole' : tmpl.wh === wh2 ? 'Yard Store – Akaki' : 'Branch – Adama',
      sale_type: saleType,
      items: JSON.stringify(saleItems),
      subtotal, discount: discAmt, tax: 0, total,
      total_cost: totalCost, total_profit: total - totalCost,
      paid_amount: saleType === 'cash' ? total : 0,
      status: 'completed',
      sale_date: daysAgo(day),
    });
  }
  await ins('sales', salesData);

  // ── Payments ──────────────────────────────────────────────────────────────
  console.log('Payments...');
  await ins('payments', [
    { type: 'customer_payment', reference_id: cIds[8], reference_name: cNames[8], amount: 800000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(3), notes: 'Partial settlement', status: 'active' },
    { type: 'customer_payment', reference_id: cIds[1], reference_name: cNames[1], amount: 500000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(8), status: 'active' },
    { type: 'customer_payment', reference_id: cIds[0], reference_name: cNames[0], amount: 250000, payment_method: 'Cheque', account_id: acc3, account_name: 'Awash Bank Account', payment_date: daysAgo(12), status: 'active' },
    { type: 'customer_payment', reference_id: cIds[3], reference_name: cNames[3], amount: 380000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(5), status: 'active' },
    { type: 'customer_payment', reference_id: cIds[4], reference_name: cNames[4], amount: 145000, payment_method: 'Cash', account_id: acc1, account_name: 'Cash Register', payment_date: daysAgo(2), notes: 'Cash payment at branch', status: 'active' },
    { type: 'supplier_payment', reference_id: sup5, reference_name: supNames[4], amount: 3900000, payment_method: 'SWIFT Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(70), notes: 'Container TCKU-2024-C01 + OOLU-2024-C04', status: 'active' },
    { type: 'supplier_payment', reference_id: sup6, reference_name: supNames[5], amount: 2400000, payment_method: 'SWIFT Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(40), notes: 'Container MSCU-2024-C02 payment', status: 'active' },
    { type: 'supplier_payment', reference_id: sup1, reference_name: supNames[0], amount: 1850000, payment_method: 'Bank Transfer', account_id: acc3, account_name: 'Awash Bank Account', payment_date: daysAgo(15), notes: 'Cement bulk order Q4', status: 'active' },
  ]);

  // ── Transfers ─────────────────────────────────────────────────────────────
  console.log('Transfers...');
  await ins('transfers', [
    { product_id: pIds[0], product_name: pNames[0], quantity: 500, source_warehouse_id: wh2, source_warehouse_name: 'Yard Store – Akaki', destination_warehouse_id: wh3, destination_warehouse_name: 'Branch – Adama', reason: 'Adama branch restocking', status: 'completed', transfer_date: daysAgo(30) },
    { product_id: pIds[9], product_name: pNames[9], quantity: 200, source_warehouse_id: wh1, source_warehouse_name: 'Main Store – Bole', destination_warehouse_id: wh3, destination_warehouse_name: 'Branch – Adama', reason: 'Tile stock for Adama project', status: 'completed', transfer_date: daysAgo(22) },
    { product_id: pIds[5], product_name: pNames[5], quantity: 100, source_warehouse_id: wh2, source_warehouse_name: 'Yard Store – Akaki', destination_warehouse_id: wh3, destination_warehouse_name: 'Branch – Adama', reason: 'Emergency order fulfillment', status: 'pending', transfer_date: daysAgo(1) },
    { product_id: pIds[12], product_name: pNames[12], quantity: 50, source_warehouse_id: wh1, source_warehouse_name: 'Main Store – Bole', destination_warehouse_id: wh3, destination_warehouse_name: 'Branch – Adama', reason: 'Paint stock for Adama customers', status: 'pending', transfer_date: daysAgo(1) },
  ]);

  // ── Damage Records ────────────────────────────────────────────────────────
  console.log('Damage records...');
  await ins('damage_records', [
    { product_id: pIds[9], product_name: pNames[9], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 12, reason: 'Tiles broken during unloading', type: 'damage', recorded_by: 'Warehouse Supervisor', status: 'approved' },
    { product_id: pIds[3], product_name: pNames[3], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', quantity: 150, reason: 'Blocks cracked due to improper stacking', type: 'damage', recorded_by: 'Yard Supervisor', status: 'approved' },
    { product_id: pIds[13], product_name: pNames[13], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', quantity: 5, reason: 'Burst paint cans — storage temperature issue', type: 'loss', recorded_by: 'Store Keeper', status: 'pending' },
  ]);

  // ── Stock Adjustments ─────────────────────────────────────────────────────
  console.log('Stock adjustments...');
  await ins('stock_adjustments', [
    { product_id: pIds[10], product_name: pNames[10], warehouse_id: wh1, warehouse_name: 'Main Store – Bole', system_quantity: 80, actual_quantity: 60, difference: -20, reason: 'Physical count discrepancy — some tiles allocated to showroom samples not recorded', requested_by: 'Store Manager', status: 'approved' },
    { product_id: pIds[0], product_name: pNames[0], warehouse_id: wh2, warehouse_name: 'Yard Store – Akaki', system_quantity: 3480, actual_quantity: 3500, difference: 20, reason: 'Recount after delivery from Mugher — extra bags found', requested_by: 'Yard Supervisor', status: 'pending' },
  ]);

  // ── Container Items ───────────────────────────────────────────────────────
  console.log('Container items...');
  await ins('container_items', [
    { container_id: con1, product_id: pIds[9], product_name: pNames[9], quantity: 1200, unit_cost_usd: 14, total_cost_usd: 16800, landed_cost_per_unit_etb: 188, total_landed_cost_etb: 225600 },
    { container_id: con1, product_id: pIds[10], product_name: pNames[10], quantity: 800, unit_cost_usd: 18, total_cost_usd: 14400, landed_cost_per_unit_etb: 282, total_landed_cost_etb: 225600 },
    { container_id: con1, product_id: pIds[11], product_name: pNames[11], quantity: 500, unit_cost_usd: 42, total_cost_usd: 21000, landed_cost_per_unit_etb: 504, total_landed_cost_etb: 252000 },
    { container_id: con2, product_id: pIds[12], product_name: pNames[12], quantity: 350, unit_cost_usd: 52, total_cost_usd: 18200, landed_cost_per_unit_etb: 1092, total_landed_cost_etb: 382200 },
    { container_id: con2, product_id: pIds[13], product_name: pNames[13], quantity: 280, unit_cost_usd: 44, total_cost_usd: 12320, landed_cost_per_unit_etb: 978, total_landed_cost_etb: 273840 },
    { container_id: con2, product_id: pIds[14], product_name: pNames[14], quantity: 120, unit_cost_usd: 78, total_cost_usd: 9360, landed_cost_per_unit_etb: 1662, total_landed_cost_etb: 199440 },
    { container_id: con3, product_id: pIds[7], product_name: pNames[7], quantity: 300, unit_cost_usd: 88, total_cost_usd: 26400, landed_cost_per_unit_etb: 1428, total_landed_cost_etb: 428400 },
    { container_id: con3, product_id: pIds[8], product_name: pNames[8], quantity: 180, unit_cost_usd: 152, total_cost_usd: 27360, landed_cost_per_unit_etb: 2838, total_landed_cost_etb: 510840 },
  ]);

  // ── Activity Logs ─────────────────────────────────────────────────────────
  console.log('Activity logs...');
  await ins('activity_logs', [
    { user_name: 'Yohannes Mulugeta', module: 'Sale', action: 'created', entity_type: 'Sale', description: `Large order: 1000 bags OPC cement + 200 Ø10mm rebar for Atlas Infrastructure` },
    { user_name: 'Yohannes Mulugeta', module: 'Container', action: 'received', entity_type: 'Container', description: 'Received TCKU-2024-C01 from Turkey — 2,500 m² tiles' },
    { user_name: 'Yohannes Mulugeta', module: 'Payment', action: 'created', entity_type: 'Payment', description: 'Received ETB 800,000 from Atlas Infrastructure Ltd' },
    { user_name: 'System', module: 'Transfer', action: 'approved', entity_type: 'Transfer', description: 'Approved transfer of 500 cement bags to Adama branch' },
    { user_name: 'Yohannes Mulugeta', module: 'Damage', action: 'approved', entity_type: 'DamageRecord', description: 'Approved damage record — 12 ceramic tiles broken during unloading' },
    { user_name: 'Yohannes Mulugeta', module: 'StockAdjustment', action: 'created', entity_type: 'StockAdjustment', description: 'Adjustment request: Porcelain Wall Tile — physical count shows -20 shortage' },
  ]);

  console.log('\n✅ Construction ERP seed complete!\n');
  console.log('Summary:');
  console.log('  3 warehouses: Bole Main Store, Akaki Yard Store, Adama Branch');
  console.log('  8 categories, 20 products (cement, steel, tiles, paint, plumbing, electrical)');
  console.log('  7 suppliers (2 local cement, 1 Chinese steel, 1 local metal, 1 Turkish tiles, 1 UAE paint, 1 local plumbing)');
  console.log('  10 customers (construction companies & contractors across Ethiopia)');
  console.log('  4 containers, 23 inventory rows');
  console.log(`  ~30 sales transactions (ETB values from 7,000 to 2,000,000+)`);
  console.log('  8 payments, 4 transfers, 3 damage records, 2 adjustments');
  console.log('\n📌 Porcelain Wall Tile is LOW STOCK (60 < min 150) to trigger notifications.');
}

seed().catch(e => { console.error(e); process.exit(1); });
