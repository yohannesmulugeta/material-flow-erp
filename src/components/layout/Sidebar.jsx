import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, Ship, ShoppingCart,
  Users, Truck, ArrowLeftRight, AlertTriangle, Undo2,
  CreditCard, Building2, FileText, Activity, CheckSquare, SlidersHorizontal,
  ChevronLeft, ChevronRight, LogOut, Moon, Sun, Menu, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/products', label: 'Products', icon: Package, module: 'products' },
  { path: '/warehouses', label: 'Warehouses', icon: Warehouse, module: 'warehouses' },
  { path: '/inventory', label: 'Inventory', icon: Package, module: 'inventory' },
  { path: '/containers', label: 'Imports', icon: Ship, module: 'containers' },
  { path: '/sales', label: 'Sales', icon: ShoppingCart, module: 'sales' },
  { path: '/customers', label: 'Customers', icon: Users, module: 'customers' },
  { path: '/suppliers', label: 'Suppliers', icon: Truck, module: 'suppliers' },
  { path: '/transfers', label: 'Transfers', icon: ArrowLeftRight, module: 'transfers' },
  { path: '/damages', label: 'Damage & Loss', icon: AlertTriangle, module: 'damages' },
  { path: '/returns', label: 'Returns', icon: Undo2, module: 'returns' },
  { path: '/payments', label: 'Payments', icon: CreditCard, module: 'payments' },
  { path: '/accounts', label: 'Accounts', icon: Building2, module: 'accounts' },
  { path: '/reports', label: 'Reports', icon: FileText, module: 'reports' },
  { path: '/approvals', label: 'Approvals', icon: CheckSquare, module: 'activity_log' },
  { path: '/stock-adjustments', label: 'Stock Adjustments', icon: SlidersHorizontal, module: 'inventory' },
  { path: '/activity-log', label: 'Activity Log', icon: Activity, module: 'activity_log' },
];

export default function Sidebar({ user, theme, toggleTheme, onLogout }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = user?.role || 'sales_staff';

  const visibleItems = NAV_ITEMS.filter(item =>
    hasPermission(role, item.module, 'view') !== false
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn("flex items-center h-16 px-4 border-b border-sidebar-border", collapsed && "justify-center")}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Ship className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-foreground leading-tight">Import & Warehouse</h1>
              <p className="text-[10px] text-sidebar-foreground/60 font-medium">ERP System</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Ship className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <button
          onClick={toggleTheme}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all",
            collapsed && "justify-center px-2"
          )}
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        
        {!collapsed && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.full_name || user.email}</p>
            <p className="text-[10px] text-sidebar-foreground/50">{ROLE_LABELS[role] || role}</p>
          </div>
        )}

        <button
          onClick={onLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-sidebar-accent transition-all",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* Collapse Toggle (Desktop) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center h-8 border-t border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-card border border-border shadow-sm"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full bg-sidebar">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 flex-shrink-0",
        collapsed ? "w-16" : "w-60"
      )}>
        {sidebarContent}
      </aside>
    </>
  );
}