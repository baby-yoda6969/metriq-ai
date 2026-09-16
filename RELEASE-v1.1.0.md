## metriq ai 1.1.0 — Android app

Native Android package via Capacitor (`ai.metriq.app`).

### What's new
- Installable **Android APK** (Capacitor WebView shell)
- Camera + cleartext LAN permissions for field scanning
- Settings → **Analysis server** URL for phone ↔ laptop API
- API client uses configurable base URL on native builds

### Install
1. Download `metriq-ai-v1.1.0.apk`
2. Allow install from unknown sources if prompted
3. On your laptop: `npm start` (API on port 8787) with `.env` keys set
4. In the app: **You → Analysis server** → `http://YOUR_LAPTOP_LAN_IP:8787`

### Rebuild
```bash
npm run mobile:sync
cd android && ./gradlew assembleDebug
```
