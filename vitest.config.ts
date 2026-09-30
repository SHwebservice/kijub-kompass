import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Die Edge Functions importieren Supabase mit Deno-Schreibweise (npm:…); in den Tests kommt das Paket aus node_modules.
  resolve: { alias: { 'npm:@supabase/supabase-js@2': '@supabase/supabase-js' } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'functions',
          environment: 'node',
          include: ['tests/functions/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'betrieb',
          environment: 'node',
          include: ['tests/betrieb/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test-setup.ts'],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
