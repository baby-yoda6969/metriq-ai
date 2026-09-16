import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./index.css";
import App from "./App.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import { HandoffPhoneScreen } from "./screens/scan/handoff.jsx";
import { DEMO_3D_PRODUCTS } from "./data/demoProducts.js";

async function bootNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#000000" });
  } catch {
    /* plugin optional at runtime */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}

bootNativeChrome();

const handoffCode = new URLSearchParams(window.location.search).get("handoff");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      {handoffCode
        ? <HandoffPhoneScreen code={handoffCode} products={DEMO_3D_PRODUCTS} />
        : <App />}
    </ThemeProvider>
  </StrictMode>,
);
