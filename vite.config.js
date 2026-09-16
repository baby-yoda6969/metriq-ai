import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
        target: `http://localhost:${process.env.BACKEND_PORT || 3000}`,
        changeOrigin: true,
      },
    },
  },
})
