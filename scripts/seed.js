/**
 * Realistic seed data for Material Flow ERP
 * Ethiopian import/warehouse business context
 *
 * Run: node scripts/seed.js
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env.local manually
const envFile = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFweGRobmFiaWxlZHNqY25idm52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDM0Mjk0OCwiZXhwIjoyMDk1OTE4OTQ4fQ.bl0LzvQ8SneL-I9zJjmysr5IuAF0Lpn9i8oJmosBmXM';

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function insert(table, rows) {
  const { data, error } = await db.from(table).insert(rows).select('id');
  if (error) { console.error(`  ✗ ${table}:`, error.message); return []; }
  console.log(`  ✓ ${table}: inserted ${rows.length}`);
  return data;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  console.log('\n🌱 Seeding Material Flow ERP with realistic data...\n');

  // ── Warehouses ─────────────────────────────────────────────────────────────
  console.log('Warehouses...');
  const warehouses = await insert('warehouses', [
    { name: 'Bole Main Warehouse', location: 'Bole Sub-City, Addis Ababa', description: 'Primary receiving and dispatch warehouse', status: 'active' },
    { name: 'Merkato Branch', location: 'Addis Ketema, Merkato, Addis Ababa', description: 'Retail distribution hub', status: 'active' },
    { name: 'Dire Dawa Depot', location: 'Dire Dawa Industrial Zone', description: 'Eastern Ethiopia distribution depot', status: 'active' },
  ]);
  const [wh1, wh2, wh3] = warehouses.map(w => w.id);

  // ── Product Categories ──────────────────────────────────────────────────────
  console.log('Categories...');
  const categories = await insert('product_categories', [
    { name: 'Electronics', description: 'Consumer electronics and accessories', status: 'active' },
    { name: 'Home Appliances', description: 'Household appliances and equipment', status: 'active' },
    { name: 'Clothing & Textiles', description: 'Garments and fabric goods', status: 'active' },
    { name: 'Stationery & Office', description: 'Office supplies and stationery', status: 'active' },
    { name: 'Construction Materials', description: 'Building and construction supplies', status: 'active' },
    { name: 'Food & Beverages', description: 'Imported food products', status: 'active' },
  ]);
  const [catElec, catAppl, catCloth, catStat, catCons, catFood] = categories.map(c => c.id);

  // ── Suppliers ───────────────────────────────────────────────────────────────
  console.log('Suppliers...');
  const suppliers = await insert('suppliers', [
    { name: 'Guangzhou Sunrise Electronics', country: 'China', contact_person: 'Li Wei', phone: '+86-20-8888-5521', email: 'liwei@sunrise-elec.cn', status: 'active' },
    { name: 'Emirates Trading Group LLC', country: 'UAE', contact_person: 'Mohammed Al Rashid', phone: '+971-4-222-8800', email: 'trading@etg.ae', status: 'active' },
    { name: 'Istanbul Global Imports A.S.', country: 'Turkey', contact_person: 'Mehmet Yilmaz', phone: '+90-212-555-0199', email: 'mehmet@istanbul-global.tr', status: 'active' },
    { name: 'Shenzhen Tech Wholesale', country: 'China', contact_person: 'Zhang Ming', phone: '+86-755-9900-3344', email: 'zhang@sztechws.com', status: 'active' },
  ]);
  const [sup1, sup2, sup3, sup4] = suppliers.map(s => s.id);

  // ── Products ────────────────────────────────────────────────────────────────
  console.log('Products...');
  const products = await insert('products', [
    // Electronics
    { name: 'Samsung 65" QLED Smart TV', sku: 'SAM-TV-65Q', category_id: catElec, brand: 'Samsung', unit: 'pcs', min_stock_level: 3, reorder_level: 5, default_selling_price: 38500, tax_rate: 15, status: 'active' },
    { name: 'LG 27" Full HD Monitor', sku: 'LG-MON-27FH', category_id: catElec, brand: 'LG', unit: 'pcs', min_stock_level: 5, reorder_level: 10, default_selling_price: 12800, tax_rate: 15, status: 'active' },
    { name: 'HP Laptop 15" i5 SSD', sku: 'HP-LPT-15I5', category_id: catElec, brand: 'HP', unit: 'pcs', min_stock_level: 3, reorder_level: 8, default_selling_price: 48000, tax_rate: 15, status: 'active' },
    { name: 'Canon EOS M50 Camera', sku: 'CAN-CAM-M50', category_id: catElec, brand: 'Canon', unit: 'pcs', min_stock_level: 2, reorder_level: 4, default_selling_price: 32000, tax_rate: 15, status: 'active' },
    { name: 'JBL Charge 5 Speaker', sku: 'JBL-SPK-CH5', category_id: catElec, brand: 'JBL', unit: 'pcs', min_stock_level: 10, reorder_level: 20, default_selling_price: 6200, tax_rate: 15, status: 'active' },
    // Home Appliances
    { name: 'Samsung 350L Refrigerator', sku: 'SAM-FRG-350L', category_id: catAppl, brand: 'Samsung', unit: 'pcs', min_stock_level: 3, reorder_level: 5, default_selling_price: 28500, tax_rate: 15, status: 'active' },
    { name: 'LG 7kg Front Load Washer', sku: 'LG-WM-7KG', category_id: catAppl, brand: 'LG', unit: 'pcs', min_stock_level: 2, reorder_level: 5, default_selling_price: 22000, tax_rate: 15, status: 'active' },
    { name: 'Haier 1.5T Split AC', sku: 'HAI-AC-15T', category_id: catAppl, brand: 'Haier', unit: 'pcs', min_stock_level: 3, reorder_level: 6, default_selling_price: 18500, tax_rate: 15, status: 'active' },
    { name: 'Midea 16L Air Fryer', sku: 'MID-AF-16L', category_id: catAppl, brand: 'Midea', unit: 'pcs', min_stock_level: 5, reorder_level: 10, default_selling_price: 4800, tax_rate: 15, status: 'active' },
    { name: 'Philips 600W Blender', sku: 'PHI-BLN-600W', category_id: catAppl, brand: 'Philips', unit: 'pcs', min_stock_level: 8, reorder_level: 15, default_selling_price: 2400, tax_rate: 15, status: 'active' },
    // Clothing
    { name: "Men's Formal Shirt (XL) 12pk", sku: 'MFS-XL-12PK', category_id: catCloth, brand: 'Generic', unit: 'pack', min_stock_level: 5, reorder_level: 10, default_selling_price: 1800, tax_rate: 0, status: 'active' },
    { name: "Women's Blazer Assorted", sku: 'WBL-AST-01', category_id: catCloth, brand: 'Generic', unit: 'pcs', min_stock_level: 10, reorder_level: 20, default_selling_price: 950, tax_rate: 0, status: 'active' },
    { name: 'Cotton T-Shirts 6pk Unisex', sku: 'CTN-TS-6PK', category_id: catCloth, brand: 'Generic', unit: 'pack', min_stock_level: 20, reorder_level: 40, default_selling_price: 480, tax_rate: 0, status: 'active' },
    // Stationery
    { name: 'A4 Copy Paper 500 sheets/ream', sku: 'A4-PAP-REM', category_id: catStat, brand: 'Double A', unit: 'ream', min_stock_level: 50, reorder_level: 100, default_selling_price: 285, tax_rate: 0, status: 'active' },
    { name: 'Ergonomic Office Chair', sku: 'OFF-CHR-ERG', category_id: catStat, brand: 'Generic', unit: 'pcs', min_stock_level: 3, reorder_level: 6, default_selling_price: 5500, tax_rate: 15, status: 'active' },
    // Construction
    { name: 'Portland Cement 50kg Bag', sku: 'CEM-PORT-50', category_id: catCons, brand: 'Mugher', unit: 'bag', min_stock_level: 100, reorder_level: 200, default_selling_price: 620, tax_rate: 0, status: 'active' },
    { name: 'Steel Rebar 12mm 12m', sku: 'STL-RBR-12MM', category_id: catCons, brand: 'Generic', unit: 'pc', min_stock_level: 50, reorder_level: 100, default_selling_price: 1150, tax_rate: 0, status: 'active' },
    // Food
    { name: 'Sunflower Cooking Oil 5L', sku: 'SUN-OIL-5L', category_id: catFood, brand: 'Sunola', unit: 'bottle', min_stock_level: 50, reorder_level: 100, default_selling_price: 650, tax_rate: 0, status: 'active' },
    { name: 'Wheat Flour 50kg Bag', sku: 'WHT-FLR-50KG', category_id: catFood, brand: 'Dire Dawa Flour', unit: 'bag', min_stock_level: 30, reorder_level: 60, default_selling_price: 1850, tax_rate: 0, status: 'active' },
    { name: 'Sugar 50kg Sack', sku: 'SGR-50KG', category_id: catFood, brand: 'WONJI', unit: 'sack', min_stock_level: 30, reorder_level: 60, default_selling_price: 2400, tax_rate: 0, status: 'active' },
  ]);
  const pIds = products.map(p => p.id);
  const pNames = ['Samsung 65" QLED Smart TV','LG 27" Full HD Monitor','HP Laptop 15" i5 SSD','Canon EOS M50 Camera','JBL Charge 5 Speaker','Samsung 350L Refrigerator','LG 7kg Front Load Washer','Haier 1.5T Split AC','Midea 16L Air Fryer','Philips 600W Blender',"Men's Formal Shirt (XL) 12pk","Women's Blazer Assorted",'Cotton T-Shirts 6pk Unisex','A4 Copy Paper 500 sheets/ream','Ergonomic Office Chair','Portland Cement 50kg Bag','Steel Rebar 12mm 12m','Sunflower Cooking Oil 5L','Wheat Flour 50kg Bag','Sugar 50kg Sack'];

  // ── Customers ───────────────────────────────────────────────────────────────
  console.log('Customers...');
  const customers = await insert('customers', [
    { name: 'Adama Trading PLC', phone: '+251-22-112-3456', email: 'info@adamatrading.et', address: 'Adama, Oromia', credit_limit: 150000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Hawassa Commerce & Distribution', phone: '+251-46-220-8877', email: 'hawassa@commerce.et', address: 'Hawassa, SNNPR', credit_limit: 200000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Jimma Wholesale Center', phone: '+251-47-111-5544', email: 'jimma@wholesale.et', address: 'Jimma, Oromia', credit_limit: 100000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Bahir Dar Enterprise', phone: '+251-58-220-3322', email: 'bahrdar@enterprise.et', address: 'Bahir Dar, Amhara', credit_limit: 250000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Gondar Import & Export', phone: '+251-58-111-7766', email: 'gondar@importexport.et', address: 'Gondar, Amhara', credit_limit: 180000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Mekelle Trading Company', phone: '+251-34-441-2233', email: 'mekelle@trading.et', address: 'Mekelle, Tigray', credit_limit: 120000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Dire Dawa Merchants Union', phone: '+251-25-113-5566', email: 'ddmu@merchants.et', address: 'Dire Dawa', credit_limit: 300000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Dessie General Trading', phone: '+251-33-111-4455', email: 'dessie@general.et', address: 'Dessie, Amhara', credit_limit: 80000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Sheger Electronics Retail', phone: '+251-11-553-7788', email: 'sheger@electronics.et', address: 'Addis Ababa, Bole', credit_limit: 500000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
    { name: 'Nekemte Commerce House', phone: '+251-57-661-3344', email: 'nekemte@commerce.et', address: 'Nekemte, Oromia', credit_limit: 90000, total_credit: 0, total_paid: 0, balance: 0, status: 'active' },
  ]);
  const custIds = customers.map(c => c.id);
  const custNames = customers.map(c => c.name);

  // ── Accounts ────────────────────────────────────────────────────────────────
  console.log('Accounts...');
  await db.from('accounts').delete().in('name', ['Cash', 'Bank — Main']);
  const accounts = await insert('accounts', [
    { name: 'Cash Register', type: 'informal', balance: 85000, description: 'Physical cash in office', status: 'active' },
    { name: 'CBE Business Account', type: 'formal', balance: 1250000, description: 'Commercial Bank of Ethiopia', status: 'active' },
    { name: 'Awash Bank Account', type: 'formal', balance: 430000, description: 'Awash International Bank', status: 'active' },
  ]);
  const [acc1, acc2, acc3] = accounts.map(a => a.id);

  // ── Containers ──────────────────────────────────────────────────────────────
  console.log('Containers...');
  const containers = await insert('containers', [
    { container_number: 'TCNU-2024-001', supplier_id: sup1, supplier_name: 'Guangzhou Sunrise Electronics', country: 'China', arrival_date: daysAgo(90), currency: 'USD', exchange_rate: 56.8, freight_cost: 48000, insurance_cost: 12000, customs_cost: 85000, transport_cost: 22000, loading_cost: 8000, unloading_cost: 9000, other_costs: 5000, total_product_cost_usd: 42500, total_import_cost_etb: 189000, status: 'received', receiving_warehouse_id: wh1, notes: 'Electronics batch — Q3 2024' },
    { container_number: 'MSKU-2024-002', supplier_id: sup2, supplier_name: 'Emirates Trading Group LLC', country: 'UAE', arrival_date: daysAgo(60), currency: 'USD', exchange_rate: 57.2, freight_cost: 32000, insurance_cost: 9000, customs_cost: 62000, transport_cost: 18000, loading_cost: 6500, unloading_cost: 7000, other_costs: 3500, total_product_cost_usd: 28000, total_import_cost_etb: 138000, status: 'received', receiving_warehouse_id: wh1, notes: 'Home appliances Q3 2024' },
    { container_number: 'CMAU-2024-003', supplier_id: sup3, supplier_name: 'Istanbul Global Imports A.S.', country: 'Turkey', arrival_date: daysAgo(30), currency: 'USD', exchange_rate: 57.5, freight_cost: 25000, insurance_cost: 7000, customs_cost: 48000, transport_cost: 15000, loading_cost: 5000, unloading_cost: 5500, other_costs: 2500, total_product_cost_usd: 18500, total_import_cost_etb: 108000, status: 'received', receiving_warehouse_id: wh2, notes: 'Textiles and clothing' },
    { container_number: 'TGHU-2024-004', supplier_id: sup4, supplier_name: 'Shenzhen Tech Wholesale', country: 'China', arrival_date: daysAgo(10), currency: 'USD', exchange_rate: 57.8, freight_cost: 38000, insurance_cost: 10000, customs_cost: 72000, transport_cost: 19000, loading_cost: 7000, unloading_cost: 8000, other_costs: 4000, total_product_cost_usd: 35000, total_import_cost_etb: 158000, status: 'arrived', receiving_warehouse_id: wh1, notes: 'Mixed electronics batch' },
    { container_number: 'HLXU-2024-005', supplier_id: sup1, supplier_name: 'Guangzhou Sunrise Electronics', country: 'China', arrival_date: daysAgo(120), currency: 'USD', exchange_rate: 56.2, freight_cost: 52000, insurance_cost: 14000, customs_cost: 92000, transport_cost: 24000, loading_cost: 9000, unloading_cost: 10000, other_costs: 6000, total_product_cost_usd: 55000, total_import_cost_etb: 207000, status: 'closed', receiving_warehouse_id: wh1, notes: 'Q2 2024 electronics' },
  ]);
  const [con1, con2, con3] = containers.map(c => c.id);

  // ── Inventory Stocks ─────────────────────────────────────────────────────────
  console.log('Inventory stocks...');
  const stockData = [
    // Electronics in Bole
    { product_id: pIds[0], product_name: pNames[0], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 12, avg_cost_etb: 22800, total_value_etb: 273600 },
    { product_id: pIds[1], product_name: pNames[1], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 28, avg_cost_etb: 7650, total_value_etb: 214200 },
    { product_id: pIds[2], product_name: pNames[2], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 15, avg_cost_etb: 28500, total_value_etb: 427500 },
    { product_id: pIds[3], product_name: pNames[3], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 8, avg_cost_etb: 19200, total_value_etb: 153600 },
    { product_id: pIds[4], product_name: pNames[4], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 45, avg_cost_etb: 3750, total_value_etb: 168750 },
    // Appliances in Bole
    { product_id: pIds[5], product_name: pNames[5], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 18, avg_cost_etb: 17100, total_value_etb: 307800 },
    { product_id: pIds[6], product_name: pNames[6], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 10, avg_cost_etb: 13200, total_value_etb: 132000 },
    { product_id: pIds[7], product_name: pNames[7], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 14, avg_cost_etb: 11100, total_value_etb: 155400 },
    { product_id: pIds[8], product_name: pNames[8], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 35, avg_cost_etb: 2880, total_value_etb: 100800 },
    { product_id: pIds[9], product_name: pNames[9], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 52, avg_cost_etb: 1440, total_value_etb: 74880 },
    // Clothing in Merkato
    { product_id: pIds[10], product_name: pNames[10], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 60, avg_cost_etb: 1080, total_value_etb: 64800 },
    { product_id: pIds[11], product_name: pNames[11], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 120, avg_cost_etb: 570, total_value_etb: 68400 },
    { product_id: pIds[12], product_name: pNames[12], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 200, avg_cost_etb: 288, total_value_etb: 57600 },
    // Stationery
    { product_id: pIds[13], product_name: pNames[13], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 3, avg_cost_etb: 171, total_value_etb: 513 }, // LOW STOCK — for alert demo
    { product_id: pIds[14], product_name: pNames[14], warehouse_id: wh1, warehouse_name: 'Bole Main Warehouse', quantity: 22, avg_cost_etb: 3300, total_value_etb: 72600 },
    // Construction in Dire Dawa
    { product_id: pIds[15], product_name: pNames[15], warehouse_id: wh3, warehouse_name: 'Dire Dawa Depot', quantity: 850, avg_cost_etb: 372, total_value_etb: 316200 },
    { product_id: pIds[16], product_name: pNames[16], warehouse_id: wh3, warehouse_name: 'Dire Dawa Depot', quantity: 320, avg_cost_etb: 690, total_value_etb: 220800 },
    // Food in Merkato + Dire Dawa
    { product_id: pIds[17], product_name: pNames[17], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 180, avg_cost_etb: 390, total_value_etb: 70200 },
    { product_id: pIds[18], product_name: pNames[18], warehouse_id: wh3, warehouse_name: 'Dire Dawa Depot', quantity: 90, avg_cost_etb: 1110, total_value_etb: 99900 },
    { product_id: pIds[19], product_name: pNames[19], warehouse_id: wh3, warehouse_name: 'Dire Dawa Depot', quantity: 75, avg_cost_etb: 1440, total_value_etb: 108000 },
  ];
  await insert('inventory_stocks', stockData);

  // ── Sales (last 90 days) ─────────────────────────────────────────────────────
  console.log('Sales...');
  const salesData = [];
  const saleItemsStore = {};

  const saleTemplates = [
    // high-value electronics sales
    { items: [{ pid: 0, pn: pNames[0], qty: 2, price: 38500, cost: 22800 }, { pid: 4, pn: pNames[4], qty: 3, price: 6200, cost: 3750 }], custIdx: 8 },
    { items: [{ pid: 2, pn: pNames[2], qty: 5, price: 48000, cost: 28500 }, { pid: 1, pn: pNames[1], qty: 5, price: 12800, cost: 7650 }], custIdx: 8 },
    { items: [{ pid: 5, pn: pNames[5], qty: 3, price: 28500, cost: 17100 }, { pid: 6, pn: pNames[6], qty: 2, price: 22000, cost: 13200 }], custIdx: 3 },
    { items: [{ pid: 7, pn: pNames[7], qty: 4, price: 18500, cost: 11100 }], custIdx: 6 },
    { items: [{ pid: 8, pn: pNames[8], qty: 15, price: 4800, cost: 2880 }, { pid: 9, pn: pNames[9], qty: 20, price: 2400, cost: 1440 }], custIdx: 1 },
    { items: [{ pid: 10, pn: pNames[10], qty: 10, price: 1800, cost: 1080 }, { pid: 11, pn: pNames[11], qty: 25, price: 950, cost: 570 }], custIdx: 2 },
    { items: [{ pid: 12, pn: pNames[12], qty: 40, price: 480, cost: 288 }, { pid: 13, pn: pNames[13], qty: 100, price: 285, cost: 171 }], custIdx: 4 },
    { items: [{ pid: 15, pn: pNames[15], qty: 200, price: 620, cost: 372 }, { pid: 16, pn: pNames[16], qty: 50, price: 1150, cost: 690 }], custIdx: 6 },
    { items: [{ pid: 17, pn: pNames[17], qty: 60, price: 650, cost: 390 }], custIdx: 5 },
    { items: [{ pid: 18, pn: pNames[18], qty: 30, price: 1850, cost: 1110 }, { pid: 19, pn: pNames[19], qty: 20, price: 2400, cost: 1440 }], custIdx: 9 },
    { items: [{ pid: 3, pn: pNames[3], qty: 2, price: 32000, cost: 19200 }], custIdx: 0 },
    { items: [{ pid: 0, pn: pNames[0], qty: 1, price: 38500, cost: 22800 }, { pid: 2, pn: pNames[2], qty: 3, price: 48000, cost: 28500 }], custIdx: 7 },
  ];

  let invoiceNum = 1001;
  // Generate ~40 sales over 90 days
  for (let day = 90; day >= 1; day -= randInt(1, 4)) {
    const tmpl = pick(saleTemplates);
    const saleItems = tmpl.items.map(it => ({
      product_id: pIds[it.pid], product_name: it.pn,
      quantity: it.qty, unit_price: it.price, unit_cost: it.cost,
      discount: 0, total: it.qty * it.price, profit: it.qty * (it.price - it.cost)
    }));
    const subtotal = saleItems.reduce((s, i) => s + i.total, 0);
    const discPct = pick([0, 0, 0, 2, 5]);
    const discAmt = subtotal * discPct / 100;
    const total = subtotal - discAmt;
    const totalCost = saleItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
    const saleType = pick(['cash', 'cash', 'cash', 'credit']);
    const custIdx = tmpl.custIdx;
    const sale = {
      invoice_number: `INV-2024-${invoiceNum++}`,
      customer_id: custIds[custIdx],
      customer_name: custNames[custIdx],
      warehouse_id: wh1,
      warehouse_name: 'Bole Main Warehouse',
      sale_type: saleType,
      items: JSON.stringify(saleItems),
      subtotal, discount: discAmt, tax: 0, total,
      total_cost: totalCost, total_profit: total - totalCost,
      paid_amount: saleType === 'cash' ? total : 0,
      status: 'completed',
      sale_date: daysAgo(day),
    };
    salesData.push(sale);
  }
  const insertedSales = await insert('sales', salesData);

  // ── Payments ─────────────────────────────────────────────────────────────────
  console.log('Payments...');
  const paymentData = [
    { type: 'customer_payment', reference_id: custIds[8], reference_name: custNames[8], amount: 250000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(5), notes: 'Q3 settlement', status: 'active' },
    { type: 'customer_payment', reference_id: custIds[3], reference_name: custNames[3], amount: 85000, payment_method: 'Cheque', account_id: acc3, account_name: 'Awash Bank Account', payment_date: daysAgo(12), status: 'active' },
    { type: 'customer_payment', reference_id: custIds[6], reference_name: custNames[6], amount: 120000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(8), status: 'active' },
    { type: 'customer_payment', reference_id: custIds[1], reference_name: custNames[1], amount: 45000, payment_method: 'Cash', account_id: acc1, account_name: 'Cash Register', payment_date: daysAgo(3), status: 'active' },
    { type: 'customer_payment', reference_id: custIds[2], reference_name: custNames[2], amount: 32000, payment_method: 'Bank Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(15), status: 'active' },
    { type: 'supplier_payment', reference_id: sup1, reference_name: 'Guangzhou Sunrise Electronics', amount: 2415000, payment_method: 'SWIFT Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(80), notes: 'Container TCNU-2024-001 payment', status: 'active' },
    { type: 'supplier_payment', reference_id: sup2, reference_name: 'Emirates Trading Group LLC', amount: 1600000, payment_method: 'SWIFT Transfer', account_id: acc2, account_name: 'CBE Business Account', payment_date: daysAgo(50), notes: 'Container MSKU-2024-002 payment', status: 'active' },
    { type: 'supplier_payment', reference_id: sup3, reference_name: 'Istanbul Global Imports A.S.', amount: 1080000, payment_method: 'SWIFT Transfer', account_id: acc3, account_name: 'Awash Bank Account', payment_date: daysAgo(22), notes: 'Container CMAU-2024-003 payment', status: 'active' },
  ];
  await insert('payments', paymentData);

  // ── Transfers ────────────────────────────────────────────────────────────────
  console.log('Transfers...');
  await insert('transfers', [
    { product_id: pIds[8], product_name: pNames[8], quantity: 20, source_warehouse_id: wh1, source_warehouse_name: 'Bole Main Warehouse', destination_warehouse_id: wh3, destination_warehouse_name: 'Dire Dawa Depot', reason: 'Restocking Dire Dawa depot', status: 'completed', transfer_date: daysAgo(25) },
    { product_id: pIds[9], product_name: pNames[9], quantity: 30, source_warehouse_id: wh1, source_warehouse_name: 'Bole Main Warehouse', destination_warehouse_id: wh2, destination_warehouse_name: 'Merkato Branch', reason: 'Merkato demand increase', status: 'completed', transfer_date: daysAgo(18) },
    { product_id: pIds[4], product_name: pNames[4], quantity: 15, source_warehouse_id: wh1, source_warehouse_name: 'Bole Main Warehouse', destination_warehouse_id: wh2, destination_warehouse_name: 'Merkato Branch', reason: 'Retail stock replenishment', status: 'pending', transfer_date: daysAgo(2) },
    { product_id: pIds[7], product_name: pNames[7], quantity: 5, source_warehouse_id: wh1, source_warehouse_name: 'Bole Main Warehouse', destination_warehouse_id: wh3, destination_warehouse_name: 'Dire Dawa Depot', reason: 'Customer pre-order in Dire Dawa', status: 'pending', transfer_date: daysAgo(1) },
  ]);

  // ── Damage Records ──────────────────────────────────────────────────────────
  console.log('Damage records...');
  await insert('damage_records', [
    { product_id: pIds[8], product_name: pNames[8], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 2, reason: 'Power surge damage during testing', type: 'damage', recorded_by: 'Warehouse Staff', status: 'approved' },
    { product_id: pIds[12], product_name: pNames[12], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 5, reason: 'Flood damage to storage area', type: 'loss', recorded_by: 'Warehouse Manager', status: 'approved' },
    { product_id: pIds[9], product_name: pNames[9], warehouse_id: wh2, warehouse_name: 'Merkato Branch', quantity: 3, reason: 'Defective units returned from customer', type: 'damage', recorded_by: 'Warehouse Staff', status: 'pending' },
  ]);

  // ── Stock Adjustments ───────────────────────────────────────────────────────
  console.log('Stock adjustments...');
  await insert('stock_adjustments', [
    { product_id: pIds[13], product_name: pNames[13], warehouse_id: wh2, warehouse_name: 'Merkato Branch', system_quantity: 150, actual_quantity: 3, difference: -147, reason: 'Physical count - major discrepancy found', requested_by: 'Yohannes M.', status: 'approved' },
    { product_id: pIds[15], product_name: pNames[15], warehouse_id: wh3, warehouse_name: 'Dire Dawa Depot', system_quantity: 820, actual_quantity: 850, difference: 30, reason: 'Count correction after recount', requested_by: 'Warehouse Staff', status: 'pending' },
  ]);

  // ── Activity Logs ───────────────────────────────────────────────────────────
  console.log('Activity logs...');
  await insert('activity_logs', [
    { user_name: 'Yohannes Mulugeta', module: 'Sale', action: 'created', entity_type: 'Sale', description: 'Created cash sale INV-2024-1001 for ETB 77,000' },
    { user_name: 'Yohannes Mulugeta', module: 'Container', action: 'created', entity_type: 'Container', description: 'Received container TCNU-2024-001 from Guangzhou Sunrise' },
    { user_name: 'Yohannes Mulugeta', module: 'Payment', action: 'created', entity_type: 'Payment', description: 'Received payment ETB 250,000 from Sheger Electronics Retail' },
    { user_name: 'System', module: 'Transfer', action: 'approved', entity_type: 'Transfer', description: 'Approved transfer of Midea Air Fryer to Dire Dawa Depot' },
    { user_name: 'Yohannes Mulugeta', module: 'Product', action: 'created', entity_type: 'Product', description: 'Added Samsung 65" QLED Smart TV to catalog' },
    { user_name: 'Yohannes Mulugeta', module: 'Damage', action: 'approved', entity_type: 'DamageRecord', description: 'Approved damage record for Midea Air Fryer x2' },
  ]);

  // ── Container Items ─────────────────────────────────────────────────────────
  console.log('Container items...');
  await insert('container_items', [
    { container_id: con1, product_id: pIds[0], product_name: pNames[0], quantity: 20, unit_cost_usd: 680, total_cost_usd: 13600, landed_cost_per_unit_etb: 22500, total_landed_cost_etb: 450000 },
    { container_id: con1, product_id: pIds[1], product_name: pNames[1], quantity: 40, unit_cost_usd: 220, total_cost_usd: 8800, landed_cost_per_unit_etb: 7500, total_landed_cost_etb: 300000 },
    { container_id: con1, product_id: pIds[4], product_name: pNames[4], quantity: 80, unit_cost_usd: 62, total_cost_usd: 4960, landed_cost_per_unit_etb: 3600, total_landed_cost_etb: 288000 },
    { container_id: con2, product_id: pIds[5], product_name: pNames[5], quantity: 25, unit_cost_usd: 480, total_cost_usd: 12000, landed_cost_per_unit_etb: 16800, total_landed_cost_etb: 420000 },
    { container_id: con2, product_id: pIds[6], product_name: pNames[6], quantity: 15, unit_cost_usd: 380, total_cost_usd: 5700, landed_cost_per_unit_etb: 13000, total_landed_cost_etb: 195000 },
    { container_id: con3, product_id: pIds[10], product_name: pNames[10], quantity: 100, unit_cost_usd: 28, total_cost_usd: 2800, landed_cost_per_unit_etb: 1050, total_landed_cost_etb: 105000 },
    { container_id: con3, product_id: pIds[11], product_name: pNames[11], quantity: 200, unit_cost_usd: 16, total_cost_usd: 3200, landed_cost_per_unit_etb: 560, total_landed_cost_etb: 112000 },
  ]);

  console.log('\n✅ Seed complete!\n');
  console.log('Summary:');
  console.log('  3 warehouses (Bole, Merkato, Dire Dawa)');
  console.log('  6 categories, 20 products');
  console.log('  4 suppliers (China x2, UAE, Turkey)');
  console.log('  10 customers across Ethiopia');
  console.log('  5 containers, 20 inventory stock rows');
  console.log(`  ${salesData.length} sales transactions`);
  console.log('  8 payments (customer + supplier)');
  console.log('  4 transfers, 3 damage records, 2 adjustments');
  console.log('\n📌 Note: A4 Paper is intentionally LOW STOCK (3 < min 50) to demo alerts.');
}

seed().catch(e => { console.error(e); process.exit(1); });
