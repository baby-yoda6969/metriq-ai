import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.BACKEND_PORT || process.env.BACKEND_PORT || '8787'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Bind all interfaces, not just localhost, so a phone on the same
      // network (or a tunnel like ngrok pointed at this port) can reach the
      // dev server for the scan-handoff demo — see src/screens/scan/handoff.jsx.
      host: true,
      // Vite 8 blocks requests for hosts it doesn't recognize by default; the
      // ngrok tunnel used to give the phone HTTPS (required for iOS camera
      // access — see src/screens/scan/handoff.jsx) has a random subdomain
      // each run, so allow any *.ngrok-free.dev / *.ngrok.io/.app host rather
      // than hardcoding one that'll go stale.
      allowedHosts: [".ngrok-free.dev", ".ngrok.io", ".ngrok.app", ".ngrok-free.app"],
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/android/**",
        "**/_ref_metriq/**",
      ],
    },
  }
})
