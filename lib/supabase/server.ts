import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL)      throw new Error('SUPABASE_URL is not set');
if (!process.env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not set');

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);
