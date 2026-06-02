import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search, Package, Users, Truck, ShoppingCart, Ship, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ICONS = { product: Package, customer: Users, supplier: Truck, sale: ShoppingCart, container: Ship };

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list(), staleTime: 60000 });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list(), staleTime: 60000 });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list(), staleTime: 60000 });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 200), staleTime: 30000 });
  const { data: containers = [] } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date', 100), staleTime: 60000 });

  const results = React.useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const matches = [];
    products.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 4).forEach(p =>
      matches.push({ type: 'product', label: p.name, sub: `SKU: ${p.sku}`, path: '/products', id: p.id }));
    customers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 3).forEach(c =>
      matches.push({ type: 'customer', label: c.name, sub: c.phone || c.email || '', path: '/customers', id: c.id }));
    suppliers.filter(s => s.name?.toLowerCase().includes(q)).slice(0, 3).forEach(s =>
      matches.push({ type: 'supplier', label: s.name, sub: s.country || '', path: '/suppliers', id: s.id }));
    sales.filter(s => s.invoice_number?.toLowerCase().includes(q) || s.customer_name?.toLowerCase().includes(q)).slice(0, 3).forEach(s =>
      matches.push({ type: 'sale', label: s.invoice_number, sub: s.customer_name || 'Walk-in', path: '/sales', id: s.id }));
    containers.filter(c => c.container_number?.toLowerCase().includes(q) || c.supplier_name?.toLowerCase().includes(q)).slice(0, 2).forEach(c =>
      matches.push({ type: 'container', label: c.container_number, sub: c.supplier_name || '', path: '/containers', id: c.id }));
    return matches;
  }, [query, products, customers, suppliers, sales, containers]);

  const select = useCallback((item) => {
    navigate(item.path);
    setQuery('');
    setOpen(false);
  }, [navigate]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search… (Ctrl+K)"
          className="pl-8 pr-8 h-8 text-sm"
        />
        {query && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setQuery(''); setOpen(false); }}>
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-10 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No results for "{query}"</p>
          ) : (
            <ul className="divide-y divide-border max-h-72 overflow-y-auto">
              {results.map((r, i) => {
                const Icon = ICONS[r.type] || Package;
                return (
                  <li key={i}>
                    <button className="w-full text-left px-4 py-2.5 hover:bg-muted/50 flex items-center gap-3" onClick={() => select(r)}>
                      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        {r.sub && <p className="text-xs text-muted-foreground truncate">{r.sub}</p>}
                      </div>
                      <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium capitalize',
                        r.type === 'sale' ? 'bg-blue-100 text-blue-700' :
                        r.type === 'customer' ? 'bg-green-100 text-green-700' :
                        r.type === 'product' ? 'bg-purple-100 text-purple-700' :
                        'bg-muted text-muted-foreground'
                      )}>{r.type}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
