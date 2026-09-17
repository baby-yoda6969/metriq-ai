import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'WEBSITE_');
  const apiPort = process.env.WEBSITE_API_PORT || env.WEBSITE_API_PORT || 8787;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5174,
      strictPort: true,
      allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.ngrok.app', '.ngrok-free.app'],
      proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true } },
    },
    build: { outDir: 'dist', emptyOutDir: true },
    test: { include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.js'] },
  };
});
