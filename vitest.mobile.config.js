import { defineConfig } from 'vitest/config';

// Keep the existing mobile suite independently runnable after importing website/.
export default defineConfig({
  test: { include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.js'] },
});
