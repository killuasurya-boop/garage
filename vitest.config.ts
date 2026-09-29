import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    setupFiles: [],
    // Test integrasi memakai PGlite sungguhan; saat semua file jalan paralel,
    // batas default 5 dtk memicu timeout palsu (lolos bila dijalankan sendiri).
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // ~70 suite masing-masing menjalankan 100+ migrasi PGlite; worker tanpa batas
    // membuat CPU jenuh sehingga beforeAll >60 dtk & timeout acak (QA-audit
    // 2026-09-28: 2 suite berbeda gagal bergantian, lolos bila sendiri).
    maxWorkers: '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'src/db/schema.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
