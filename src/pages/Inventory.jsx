import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import ProductStockDetail from '@/components/inventory/ProductStockDetail';

export default function Inventory() {
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: inventory = [], isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // Build aggregated or filtered data
  let displayData = [];
  if (warehouseFilter === 'all') {
    const map = {};
    inventory.forEach(item => {
      if (!map[item.product_id]) {
        map[item.product_id] = { ...item, warehouse_name: 'All Warehouses' };
      } else {
        map[item.product_id].quantity = (map[item.product_id].quantity || 0) + (item.quantity || 0);
        map[item.product_id].total_value_etb = (map[item.product_id].total_value_etb || 0) + (item.total_value_etb || 0);
      }
    });
    displayData = Object.values(map);
  } else if (warehouseFilter === 'per_warehouse') {
    displayData = inventory;
  } else {
    displayData = inventory.filter(i => i.warehouse_id === warehouseFilter);
  }

  // Merge product info
  displayData = displayData.map(row => {
    const prod = products.find(p => p.id === row.product_id);
    const cat = categories.find(c => c.id === prod?.category_id);
    const isLow = (row.quantity || 0) <= (prod?.min_stock_level || 0);
    return { ...row, product: prod, category_name: cat?.name || '—', is_low_stock: isLow };
  });

  const handleRowClick = (row) => {
    setSelectedProduct(row);
    setSheetOpen(true);
  };

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => (
      <div>
        <span className="font-medium">{row.product_name}</span>
        {row.product?.sku && <span className="text-xs text-muted-foreground ml-2 font-mono">{row.product.sku}</span>}
      </div>
    )},
    { header: 'Category', cell: row => row.category_name },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Quantity', accessorKey: 'quantity', cell: row => (
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${row.is_low_stock ? 'text-amber-600' : ''}`}>{row.quantity}</span>
        {row.is_low_stock && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">LOW</span>}
      </div>
    )},
    { header: 'Avg Cost (ETB)', cell: row => fmt(row.avg_cost_etb) },
    { header: 'Total Value (ETB)', cell: row => <span className="font-semibold">{fmt(row.total_value_etb)}</span> },
  ];

  const totalValue = displayData.reduce((s, x) => s + (x.total_value_etb || 0), 0);
  const totalQty = displayData.reduce((s, x) => s + (x.quantity || 0), 0);
  const lowCount = displayData.filter(x => x.is_low_stock).length;

  // Find all inventory rows for selected product
  const selectedInventoryRows = selectedProduct
    ? inventory.filter(i => i.product_id === selectedProduct.product_id)
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description={`${totalQty} units · ETB ${fmt(totalValue)}${lowCount > 0 ? ` · ${lowCount} low stock` : ''}`}
        actions={
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Combined (All)</SelectItem>
              <SelectItem value="per_warehouse">Per Warehouse</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        columns={columns}
        data={displayData}
        isLoading={isLoading}
        emptyMessage="No inventory records"
        onRowClick={handleRowClick}
      />

      <ProductStockDetail
        product={selectedProduct?.product}
        inventoryRows={selectedInventoryRows}
        categories={categories}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}