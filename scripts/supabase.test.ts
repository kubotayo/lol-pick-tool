import { describe, it, expect, vi, afterEach } from 'vitest';

// scripts/supabase.ts は読み込み時に環境変数を確かめるので、毎回読み込み直す
describe('supabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ENV-14
  it('SUPABASE_URL が未設定なら、読み込み時にエラーにする', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'dummy');
    await expect(import('./supabase')).rejects.toThrow('SUPABASE_URL が設定されていません');
  });

  // ENV-15
  it('SUPABASE_SERVICE_ROLE_KEY が未設定なら、読み込み時にエラーにする', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(import('./supabase')).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  });

  it('どちらも設定されていれば読み込める', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'dummy');
    await expect(import('./supabase')).resolves.toHaveProperty('supabase');
  });
});
