// Service-role auth bypass for Playwright tests.
// Creates/reuses a test user via the Supabase Admin API, signs them in,
// and injects the session into localStorage so tests land directly in the app.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test-admin@material-flow-erp.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestAdmin#8765!';

let _cachedSession = null;

export async function getTestSession() {
  if (_cachedSession) return _cachedSession;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars for tests.\n' +
      'Add them to .env.test or export them before running playwright.'
    );
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the test user if it doesn't exist
  const { error: createErr } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr && !createErr.message.includes('already been registered')) {
    throw createErr;
  }

  // Sign in to get a real JWT
  const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || '');
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw error;

  // Ensure the test user has super_admin role so all pages are accessible
  await adminClient.from('profiles').upsert(
    { id: data.user.id, email: TEST_EMAIL, role: 'super_admin', full_name: 'Test Admin' },
    { onConflict: 'id' }
  );

  _cachedSession = data.session;
  return _cachedSession;
}

export async function injectSession(page) {
  const session = await getTestSession();
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify(session) }
  );
}
