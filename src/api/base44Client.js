// Compat alias — the rest of the codebase imports from '@/api/base44Client'.
// Real implementation lives in supabaseClient.js. Migrate page imports
// gradually; this re-export keeps everything building in the meantime.
export {
  supabase,
  db,
  auth,
  entities,
  functions,
  integrations,
  base44,
  getSignedUrl,
  DEMO_MODE,
} from './supabaseClient';

export { default } from './supabaseClient';
