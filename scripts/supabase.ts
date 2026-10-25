import { createClient } from '@supabase/supabase-js';

// バッチスクリプト専用のSupabaseクライアント
// SERVICE_ROLE_KEYを使うことでRLSをバイパスして書き込みが可能になる
// フロントエンドからは絶対にこのクライアントを使わないこと

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('SUPABASE_URL が設定されていません');
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません');

export const supabase = createClient(url, key, {
  auth: {
    // バッチはユーザーセッションを持たないため自動リフレッシュ不要
    autoRefreshToken: false,
    persistSession: false,
  },
});
