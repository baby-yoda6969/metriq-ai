import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { HandoffPhoneScreen } from './screens/scan/handoff.jsx'
import { DEMO_3D_PRODUCTS } from './data/demoProducts.js'

const handoffCode = new URLSearchParams(window.location.search).get('handoff')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      {handoffCode
        ? <HandoffPhoneScreen code={handoffCode} products={DEMO_3D_PRODUCTS} />
        : <App />}
    </ThemeProvider>
  </StrictMode>,
)
