const ROLE_PERMISSIONS = {
  super_admin: {
    dashboard: true,
    products: { view: true, create: true, edit: true, delete: true },
    warehouses: { view: true, create: true, edit: true, delete: true },
    inventory: { view: true, adjust: true },
    containers: { view: true, create: true, edit: true, receive: true },
    sales: { view: true, create: true, edit: true, cancel: true },
    customers: { view: true, create: true, edit: true },
    suppliers: { view: true, create: true, edit: true },
    transfers: { view: true, create: true, approve: true },
    damages: { view: true, create: true, approve: true },
    returns: { view: true, create: true, approve: true },
    accounts: { view: true, create: true, edit: true, transact: true },
    payments: { view: true, create: true },
    reports: { view: true },
    users: { view: true, manage: true },
    activity_log: { view: true },
  },
  manager: {
    dashboard: true,
    products: { view: true, create: true, edit: true, delete: false },
    warehouses: { view: true, create: true, edit: true, delete: false },
    inventory: { view: true, adjust: true },
    containers: { view: true, create: true, edit: true, receive: true },
    sales: { view: true, create: true, edit: true, cancel: true },
    customers: { view: true, create: true, edit: true },
    suppliers: { view: true, create: true, edit: true },
    transfers: { view: true, create: true, approve: true },
    damages: { view: true, create: true, approve: true },
    returns: { view: true, create: true, approve: true },
    accounts: { view: true, create: false, edit: false, transact: true },
    payments: { view: true, create: true },
    reports: { view: true },
    users: { view: true, manage: false },
    activity_log: { view: true },
  },
  warehouse_staff: {
    dashboard: true,
    products: { view: true, create: false, edit: false, delete: false },
    warehouses: { view: true, create: false, edit: false, delete: false },
    inventory: { view: true, adjust: false },
    containers: { view: true, create: false, edit: false, receive: true },
    sales: { view: false, create: false, edit: false, cancel: false },
    customers: { view: false, create: false, edit: false },
    suppliers: { view: true, create: false, edit: false },
    transfers: { view: true, create: true, approve: false },
    damages: { view: true, create: true, approve: false },
    returns: { view: true, create: false, approve: false },
    accounts: { view: false, create: false, edit: false, transact: false },
    payments: { view: false, create: false },
    reports: { view: false },
    users: { view: false, manage: false },
    activity_log: { view: false },
  },
  sales_staff: {
    dashboard: true,
    products: { view: true, create: false, edit: false, delete: false },
    warehouses: { view: true, create: false, edit: false, delete: false },
    inventory: { view: true, adjust: false },
    containers: { view: false, create: false, edit: false, receive: false },
    sales: { view: true, create: true, edit: false, cancel: false },
    customers: { view: true, create: true, edit: true },
    suppliers: { view: false, create: false, edit: false },
    transfers: { view: false, create: false, approve: false },
    damages: { view: false, create: false, approve: false },
    returns: { view: true, create: true, approve: false },
    accounts: { view: false, create: false, edit: false, transact: false },
    payments: { view: true, create: true },
    reports: { view: false },
    users: { view: false, manage: false },
    activity_log: { view: false },
  },
  accountant: {
    dashboard: true,
    products: { view: true, create: false, edit: false, delete: false },
    warehouses: { view: true, create: false, edit: false, delete: false },
    inventory: { view: true, adjust: false },
    containers: { view: true, create: false, edit: false, receive: false },
    sales: { view: true, create: false, edit: false, cancel: false },
    customers: { view: true, create: false, edit: false },
    suppliers: { view: true, create: false, edit: false },
    transfers: { view: true, create: false, approve: false },
    damages: { view: true, create: false, approve: false },
    returns: { view: true, create: false, approve: false },
    accounts: { view: true, create: true, edit: true, transact: true },
    payments: { view: true, create: true },
    reports: { view: true },
    users: { view: false, manage: false },
    activity_log: { view: true },
  },
};

export function hasPermission(role, module, action) {
  // Map built-in platform roles to ERP roles
  const effectiveRole = role === 'admin' ? 'super_admin' : role;
  const perms = ROLE_PERMISSIONS[effectiveRole];
  if (!perms) return true; // Unknown roles get full access (fallback)
  if (typeof perms[module] === 'boolean') return perms[module];
  if (typeof perms[module] === 'object') return perms[module][action] || false;
  return false;
}

export function getVisibleModules(role) {
  const effectiveRole = role === 'admin' ? 'super_admin' : role;
  const perms = ROLE_PERMISSIONS[effectiveRole];
  if (!perms) return [];
  return Object.keys(perms).filter(key => {
    const val = perms[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object') return val.view;
    return false;
  });
}

export const ROLE_LABELS = {
  admin: 'Super Admin',
  super_admin: 'Super Admin',
  manager: 'Manager',
  warehouse_staff: 'Warehouse Staff',
  sales_staff: 'Sales Staff',
  accountant: 'Accountant',
};