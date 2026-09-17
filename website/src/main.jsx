import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// @google/model-viewer (three.js-sized) is intentionally NOT imported here —
// it's only needed inside the demo-only 3D viewer (ThreeDCaptureModal), which
// dynamically imports it on first use so every other page load doesn't pay
// for a library only some users ever touch.
import { BrowserRouter } from 'react-router-dom'
import { WebsiteRouter } from './app/Router.jsx'
import { SessionProvider } from './app/SessionContext.jsx'
import { HandoffPhoneScreen } from './screens/scan/handoff.jsx'
import { DEMO_3D_PRODUCTS } from './data/demoProducts.js'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { ThemeToggle } from './components/ThemeToggle.jsx'

// The phone reaches this app via a QR code that carries ?handoff=<code>
// (see src/lib/handoff.js's buildHandoffJoinUrl and
// src/screens/scan/handoff.jsx's PhoneHandoffCapture, generated from the
// laptop's ScanView). That's a deliberately separate, minimal entry point —
// it skips the full app (landing, role picker, login, dashboards) entirely,
// since the phone's only job in the demo is the one camera scan.
const handoffCode = new URLSearchParams(window.location.search).get('handoff')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ThemeToggle />
    {handoffCode
      ? <HandoffPhoneScreen code={handoffCode} products={DEMO_3D_PRODUCTS} />
      : <BrowserRouter><SessionProvider><WebsiteRouter /></SessionProvider></BrowserRouter>}
    </ThemeProvider>
  </StrictMode>,
)
