import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom でブラウザ環境をシミュレート（React コンポーネントテスト用）
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // カバレッジ目標（testing.md に準拠）
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  80,
        statements: 80,
      },
      // テスト対象外ファイルを除外
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        'lib/mock-data.ts',
        'lib/supabase/server.ts',
        'next.config.ts',
        'vitest.config.ts',
        'tailwind.config.ts',
        'app/layout.tsx',
        'app/page.tsx',
        'components/**',
        'app/first-pick/**',
        'app/counter-pick/**',
      ],
    },
  },
  resolve: {
    // tsconfig の @/* パスエイリアスを Vitest でも使えるようにする
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
