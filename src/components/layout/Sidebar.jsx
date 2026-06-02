import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, Ship, ShoppingCart,
  Users, Truck, ArrowLeftRight, AlertTriangle, Undo2,
  CreditCard, Building2, FileText, Activity, CheckSquare, SlidersHorizontal,
  ChevronLeft, ChevronRight, LogOut, Moon, Sun, Menu, X, ShieldCheck, UserCog
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';

const NAV_ITEMS = [
  { path: '/',                  label: 'Dashboard',        icon: LayoutDashboard,  module: 'dashboard' },
  { path: '/products',          label: 'Products',         icon: Package,          module: 'products' },
  { path: '/warehouses',        label: 'Warehouses',       icon: Warehouse,        module: 'warehouses' },
  { path: '/inventory',         label: 'Inventory',        icon: Package,          module: 'inventory' },
  { path: '/containers',        label: 'Import Containers',icon: Ship,             module: 'containers' },
  { path: '/sales',             label: 'Sales',            icon: ShoppingCart,     module: 'sales' },
  { path: '/customers',         label: 'Customers',        icon: Users,            module: 'customers' },
  { path: '/suppliers',         label: 'Suppliers',        icon: Truck,            module: 'suppliers' },
  { path: '/transfers',         label: 'Transfers',        icon: ArrowLeftRight,   module: 'transfers' },
  { path: '/damages',           label: 'Damage & Loss',    icon: AlertTriangle,    module: 'damages' },
  { path: '/returns',           label: 'Returns',          icon: Undo2,            module: 'returns' },
  { path: '/payments',          label: 'Payments',         icon: CreditCard,       module: 'payments' },
  { path: '/accounts',          label: 'Accounts',         icon: Building2,        module: 'accounts' },
  { path: '/reports',           label: 'Reports',          icon: FileText,         module: 'reports' },
  { path: '/approvals',         label: 'Approvals',        icon: CheckSquare,      module: 'activity_log' },
  { path: '/stock-adjustments', label: 'Stock Adjustments',icon: SlidersHorizontal,module: 'inventory' },
  { path: '/activity-log',      label: 'Activity Log',     icon: Activity,         module: 'activity_log' },
  { path: '/data-audit',        label: 'Data Audit',       icon: ShieldCheck,      module: 'reports' },
  { path: '/users',             label: 'User Management',  icon: UserCog,          module: 'users' },
];

export default function Sidebar({ user, theme, toggleTheme, onLogout }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = user?.role || 'sales_staff';

  // Close on route change on mobile
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const visibleItems = NAV_ITEMS.filter(item =>
    hasPermission(role, item.module, 'view') !== false
  );

  const NavLink = ({ item }) => {
    const isActive = location.pathname === item.path ||
      (item.path !== '/' && location.pathname.startsWith(item.path));

    return (
      <Link
        to={item.path}
        className={cn(
          // Touch target: min 44px height
          'flex items-center gap-3 px-3 rounded-xl text-sm font-medium',
          'transition-all duration-150',
          'min-h-[44px]',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/30'
            : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent',
          collapsed && 'justify-center px-2',
        )}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <item.icon className={cn('flex-shrink-0', collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]')} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* ── Brand header ──────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center h-14 px-4 border-b border-sidebar-border flex-shrink-0',
        collapsed && 'justify-center'
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <Ship className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-sidebar-foreground leading-tight truncate">
                Material Flow
              </h1>
              <p className="text-[10px] text-sidebar-foreground/50 font-medium">ERP System</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Ship className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scroll-mobile">
        {visibleItems.map(item => <NavLink key={item.path} item={item} />)}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="border-t border-sidebar-border p-3 space-y-1 flex-shrink-0 pb-safe">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={cn(
            'flex items-center gap-3 w-full px-3 rounded-xl text-sm font-medium min-h-[44px]',
            'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun className="w-[18px] h-[18px] flex-shrink-0" />
            : <Moon className="w-[18px] h-[18px] flex-shrink-0" />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* User info */}
        {!collapsed && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">
              {user.full_name || user.email}
            </p>
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
              {ROLE_LABELS[role] || role}
            </p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 rounded-xl text-sm font-medium min-h-[44px]',
            'text-red-400 hover:text-red-300 hover:bg-sidebar-accent',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
          aria-label="Log out"
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* ── Collapse toggle (desktop only) ────────────────────────────── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center h-9 border-t border-sidebar-border text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors flex-shrink-0"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4" />
          : <ChevronLeft className="w-4 h-4" />
        }
      </button>
    </div>
  );

  return (
    <>
      {/* ── Mobile hamburger ────────────────────────────────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="
          lg:hidden fixed top-2 left-3 z-50
          w-11 h-11 rounded-xl
          bg-card border border-border shadow-sm
          flex items-center justify-center
          transition-all duration-150 active:scale-95
        "
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile drawer + backdrop ─────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop — tap to close */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel — slides in from left */}
          <div
            className="
              relative w-72 max-w-[85vw] h-full
              bg-sidebar
              animate-slide-up
              shadow-2xl
            "
            style={{ animation: 'slide-in-right 300ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            {/* Close button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="
                absolute top-2.5 right-2.5 z-10
                w-9 h-9 rounded-lg
                text-sidebar-foreground/50 hover:text-sidebar-foreground
                hover:bg-sidebar-accent transition-colors
                flex items-center justify-center
              "
              aria-label="Close navigation"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen bg-sidebar border-r border-sidebar-border flex-shrink-0',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[60px]' : 'w-60',
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
