import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Corre antes de que se evalúen los imports de cada test file: garantiza
    // DB_URL=:memory: antes de que @otb/db abra su singleton.
    setupFiles: ['./test/setup-env.ts'],
  },
});