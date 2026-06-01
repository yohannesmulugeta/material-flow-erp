// =============================================================================
// Material Flow ERP — Supabase client + Base44 compat shim
//
// Exposes `base44` with the same surface the pages were written against
// (base44.entities.<X>.list/create/update/delete/get/filter, base44.auth.*,
//  base44.functions.invoke, base44.integrations.Core.UploadFile).
//
// All entity calls land here so we can:
//   - strip server-managed / generated columns (cleanPayload + TABLE_RULES)
//   - auto-inject created_by = current user
//   - retry insert/update after dropping unknown columns the schema lacks
//   - map Base44 PascalCase ↔ snake_case table names, and created_date ↔ created_at
// =============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------- env ----------------------------------------------------------------
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const DEMO_MODE  = String(import.meta.env.VITE_DEMO_MODE || '').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don't throw — let the app render a friendlier message. But log loudly.
  // eslint-disable-next-line no-console
  console.error('[supabaseClient] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(SUPABASE_URL ?? 'http://invalid', SUPABASE_ANON_KEY ?? 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,  // pkce flow was hanging on every page load
  },
});

// ---------- entity → table mapping --------------------------------------------
// PascalCase entity (Base44) → snake_case table (Supabase). User is a special
// case mapped to `profiles` (so base44.entities.User.* works without rewrites).

const ENTITY_TABLE = {
  Account: 'accounts',
  AccountTransaction: 'account_transactions',
  ActivityLog: 'activity_logs',
  ApprovalRequest: 'approval_requests',
  Attachment: 'attachments',
  Container: 'containers',
  ContainerItem: 'container_items',
  Customer: 'customers',
  DamageRecord: 'damage_records',
  InventoryStock: 'inventory_stocks',
  Payment: 'payments',
  Product: 'products',
  ProductCategory: 'product_categories',
  Sale: 'sales',
  SalesReturn: 'sales_returns',
  StockAdjustment: 'stock_adjustments',
  StockTransaction: 'stock_transactions',
  Supplier: 'suppliers',
  Transfer: 'transfers',
  User: 'profiles',
  Warehouse: 'warehouses',
};

// ---------- per-table strip rules ---------------------------------------------
// Add columns the form sends that the schema doesn't accept on insert
// (generated columns, trigger-managed columns). Plus global timestamp aliases.

const GLOBAL_STRIP = new Set([
  'created_date', 'updated_date',  // Base44 field names — map separately if needed
  'createdAt', 'updatedAt',
]);

const TABLE_RULES = {
  // generated / computed columns go here per table. Empty for now;
  // populate as the self-healing retry warns about them.
  inventory_stocks: { strip: ['total_value_etb'] },        // trigger-managed
  sales:            { strip: ['total_cost', 'total_profit'] }, // computed server-side later
  // ...
};

function cleanPayload(obj, tableName) {
  const rules = TABLE_RULES[tableName] || { strip: [] };
  const strip = new Set([...GLOBAL_STRIP, ...rules.strip]);
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (strip.has(k)) continue;
    if (v === '') { out[k] = null; continue; }
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ---------- row hydration ------------------------------------------------------
// Pages may reference `record.created_date`. Mirror snake_case timestamps.
function hydrate(row) {
  if (!row || typeof row !== 'object') return row;
  if ('created_at' in row && !('created_date' in row)) row.created_date = row.created_at;
  if ('updated_at' in row && !('updated_date' in row)) row.updated_date = row.updated_at;
  return row;
}
const hydrateAll = (rows) => Array.isArray(rows) ? rows.map(hydrate) : hydrate(rows);

// ---------- order-by parser ----------------------------------------------------
// Base44 used `list('-created_date')` (desc) / `list('field')` (asc).
function parseOrderBy(orderBy) {
  if (!orderBy) return null;
  const desc = orderBy.startsWith('-');
  let col = desc ? orderBy.slice(1) : orderBy;
  if (col === 'created_date') col = 'created_at';
  if (col === 'updated_date') col = 'updated_at';
  return { col, asc: !desc };
}

// ---------- self-healing retry on unknown column ------------------------------
const UNKNOWN_COL_RX = /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i;

async function withUnknownColumnRetry(tableName, payload, runner) {
  let attempt = { ...payload };
  for (let i = 0; i < 25; i++) {
    const { data, error } = await runner(attempt);
    if (!error) return { data, error: null };
    const m = error.message && error.message.match(UNKNOWN_COL_RX);
    if (!m || !(m[1] in attempt)) return { data: null, error };
    // eslint-disable-next-line no-console
    console.warn(`[db.${tableName}] dropping unknown column "${m[1]}" — add it to schema`);
    const { [m[1]]: _omit, ...rest } = attempt;
    attempt = rest;
  }
  return { data: null, error: new Error('too many unknown columns') };
}

// ---------- entity builder ----------------------------------------------------
async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function buildEntity(entityName, tableName) {
  const tbl = () => supabase.from(tableName);

  async function list(orderBy = '-created_at', { limit } = {}) {
    let q = tbl().select('*');
    const ord = parseOrderBy(orderBy);
    if (ord) q = q.order(ord.col, { ascending: ord.asc });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return hydrateAll(data || []);
  }

  async function filter(criteria = {}, orderBy = '-created_at', limit) {
    let q = tbl().select('*');
    for (const [k, v] of Object.entries(criteria)) {
      if (v === null) q = q.is(k, null);
      else if (Array.isArray(v)) q = q.in(k, v);
      else q = q.eq(k, v);
    }
    const ord = parseOrderBy(orderBy);
    if (ord) q = q.order(ord.col, { ascending: ord.asc });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return hydrateAll(data || []);
  }

  async function get(id) {
    const { data, error } = await tbl().select('*').eq('id', id).single();
    if (error) throw error;
    return hydrate(data);
  }

  async function create(payload) {
    const uid = await getUserId();
    let body = cleanPayload(payload, tableName);
    if (uid && !('created_by' in body)) body.created_by = uid;

    const { data, error } = await withUnknownColumnRetry(tableName, body,
      (b) => tbl().insert(b).select('*').single());
    if (error) throw error;
    return hydrate(data);
  }

  async function update(id, payload) {
    const body = cleanPayload(payload, tableName);
    const { data, error } = await withUnknownColumnRetry(tableName, body,
      (b) => tbl().update(b).eq('id', id).select('*').single());
    if (error) throw error;
    return hydrate(data);
  }

  async function del(id) {
    const { error } = await tbl().delete().eq('id', id);
    if (error) throw error;
    return { id };
  }

  // bulkCreate convenience (some Base44 code paths use it)
  async function bulkCreate(rows) {
    const uid = await getUserId();
    const bodies = (rows || []).map((r) => {
      const b = cleanPayload(r, tableName);
      if (uid && !('created_by' in b)) b.created_by = uid;
      return b;
    });
    if (!bodies.length) return [];
    const { data, error } = await tbl().insert(bodies).select('*');
    if (error) throw error;
    return hydrateAll(data || []);
  }

  return {
    name: entityName,
    table: tableName,
    list,
    filter,
    find: filter, // alias
    get,
    findById: get,
    create,
    update,
    delete: del,
    bulkCreate,
  };
}

// ---------- entities namespace ------------------------------------------------
export const entities = Object.fromEntries(
  Object.entries(ENTITY_TABLE).map(([entity, table]) => [entity, buildEntity(entity, table)])
);

// Aliases used by some pages
entities.Auth = entities.User; // compat

// ---------- auth shim ---------------------------------------------------------
const AUTH_REDIRECT_PATH = '/login';

async function me() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  // merge profile fields so pages can read role/full_name off `user`
  let profile = null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    profile = data;
  } catch { /* ignore — profile row may not exist yet */ }
  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0],
    role: profile?.role || 'unassigned',
    status: profile?.status || 'active',
    phone: profile?.phone || null,
    ...profile,
  };
}

async function loginViaEmailPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUpViaEmailPassword(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata, emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
  return data;
}

async function loginWithProvider(provider, redirectTo) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${redirectTo || '/'}`,
    },
  });
  if (error) throw error;
}

async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

async function logout(redirect) {
  await supabase.auth.signOut();
  if (typeof redirect === 'string') {
    window.location.href = AUTH_REDIRECT_PATH;
  }
}

function redirectToLogin() {
  window.location.href = AUTH_REDIRECT_PATH;
}

// Base44-compat aliases for the Login/Register/ForgotPassword/ResetPassword pages.
async function register({ email, password, full_name } = {}) {
  return signUpViaEmailPassword(email, password, full_name ? { full_name } : {});
}

async function verifyOtp({ email, otpCode } = {}) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
  if (error) throw error;
  return { access_token: data?.session?.access_token, user: data?.user };
}

async function resendOtp(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

function setToken(_token) {
  // No-op: Supabase manages tokens via its own session storage.
}

async function resetPasswordRequest(email) {
  return requestPasswordReset(email);
}

async function resetPassword({ newPassword } = {}) {
  // Supabase: the reset-password page is opened via a recovery link that
  // already establishes a session. We just call updateUser.
  return updatePassword(newPassword);
}

export const auth = {
  me,
  loginViaEmailPassword,
  signUpViaEmailPassword,
  register,
  verifyOtp,
  resendOtp,
  setToken,
  loginWithProvider,
  requestPasswordReset,
  resetPasswordRequest,
  resetPassword,
  updatePassword,
  logout,
  redirectToLogin,
};

// ---------- functions shim (Supabase Edge Functions) --------------------------
async function invoke(name, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[functions.invoke:${name}] non-fatal error`, error.message);
      return { ok: false, error: error.message };
    }
    return data ?? { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[functions.invoke:${name}] exception (non-fatal)`, e.message);
    return { ok: false, error: e.message };
  }
}
export const functions = { invoke };

// ---------- integrations.Core.UploadFile (Supabase Storage) -------------------
// Returns { file_url, file_name, file_size } shape that Base44 pages expect.
// Default bucket: 'attachments' (private). For public uploads, pass options.
async function UploadFile({ file, entityType = 'misc', entityId = 'unknown', isPublic = false } = {}) {
  if (!file) throw new Error('UploadFile: file is required');
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const safeId = String(entityId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${entityType}/${safeId}/${crypto.randomUUID()}.${ext}`;
  const bucket = 'attachments';
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  let url;
  if (isPublic) {
    url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } else {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    url = data?.signedUrl || null;
  }
  return {
    file_url: url,
    storage_path: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  };
}

export async function getSignedUrl(path, ttlSeconds = 3600) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, ttlSeconds);
  if (error) throw error;
  return data?.signedUrl;
}

export const integrations = {
  Core: { UploadFile },
};

// ---------- the base44 compat object ------------------------------------------
export const base44 = {
  entities,
  auth,
  functions,
  integrations,
};

// also export db alias used in the runbook examples
export const db = {
  from: (tbl) => supabase.from(tbl),
};

export default supabase;

// =============================================================================
// Lint protection (Phase 5 GOTCHA #12): keep each import on its own line in
// consumer files so eslint-plugin-unused-imports doesn't strip the whole line.
// =============================================================================
