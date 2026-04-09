// lib/db.js
// Server-only Supabase client using the service role key.
// Never import this in client components — it exposes the service role key.
import { createClient } from '@supabase/supabase-js';

export function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
