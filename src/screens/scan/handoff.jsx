import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, Smartphone, Wifi } from "lucide-react";
import { Button } from "../../components/ui/Button.jsx";
import { InlineBanner } from "../../components/ui/InlineBanner.jsx";
import { ObjectScanCapture } from "./objectScan.jsx";
import {
  buildHandoffJoinUrl, checkHandoffSession, createHandoffSession, sendHandoffScan, subscribeHandoff,
} from "../../lib/handoff.js";

/* ------------------------------------------------------------------ */
/* Laptop side: generate a session, show it as a QR, wait for the      */
/* phone's result over SSE, then hand the matched product to the same  */
/* onMatched callback ObjectScanCapture would have called directly.    */
/* ------------------------------------------------------------------ */

export function PhoneHandoffCapture({ products, onMatched }) {
  const [stage, setStage] = useState("idle"); // idle | creating | waiting | received | error
  const [code, setCode] = useState(null);
  const [joinUrl, setJoinUrl] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const unsubscribeRef = useRef(null);

  useEffect(() => () => { if (unsubscribeRef.current) unsubscribeRef.current(); }, []);

  async function start() {
    setStage("creating");
    setErrorMsg("");
    try {
      const newCode = await createHandoffSession();
      const url = buildHandoffJoinUrl(newCode);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#F5F5F8", light: "#14141C" } });
      setCode(newCode);
      setJoinUrl(url);
      setQrDataUrl(qr);
      setStage("waiting");

      if (unsubscribeRef.current) unsubscribeRef.current();
      unsubscribeRef.current = subscribeHandoff(
        newCode,
        (matchKey) => {
          const product = products.find((p) => p.match === matchKey);
          if (!product) return;
          setStage("received");
          if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
          // Small pause so "Received" is visible before the result screen
          // takes over — otherwise the transition feels like it skipped a
          // step.
          setTimeout(() => onMatched(product), 500);
        },
        () => setErrorMsg("Lost the connection to the handoff session. Generate a new QR code and try again.")
      );
    } catch (e) {
      setStage("error");
      setErrorMsg((e && e.message) || "Couldn't start a handoff session.");
    }
  }

  function reset() {
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    setStage("idle");
    setCode(null);
    setJoinUrl(null);
    setQrDataUrl(null);
    setErrorMsg("");
  }

  return (
    <div className="rounded-[22px] border border-white/8 bg-panel-alt p-5">
      {stage === "idle" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Smartphone size={28} className="text-navy/50" />
          <p className="max-w-[320px] text-[13.5px] text-ink-soft">
            Generate a QR code, scan it with your phone, and rotate the product in front of the phone's
            camera. The moment it's identified, the result appears here automatically.
          </p>
          <Button variant="primary" onClick={start}>Generate QR for phone</Button>
        </div>
      )}

      {stage === "creating" && (
        <div className="flex items-center justify-center gap-2 py-8 text-[13.5px] text-ink-soft">
          <Loader2 className="animate-spin" size={16} /> Starting session…
        </div>
      )}

      {(stage === "waiting" || stage === "received") && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {qrDataUrl && <img src={qrDataUrl} alt={`QR code to join handoff session ${code}`} className="rounded border border-border" width={200} height={200} />}
          <div className="text-[11.5px] uppercase tracking-wide text-ink-soft">Session code</div>
          <div className="font-mono text-[22px] font-bold tracking-[0.2em] text-ink">{code}</div>
          <div className="max-w-[300px] break-all text-[11px] text-ink-soft/80">{joinUrl}</div>

          {stage === "waiting" && (
            <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-soft">
              <Wifi size={14} className="animate-pulse" /> Waiting for the phone to scan…
            </div>
          )}
          {stage === "received" && (
            <div className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-green">
              <CheckCircle2 size={15} /> Received from phone — loading result…
            </div>
          )}

          {stage === "waiting" && (
            <Button variant="ghost" size="sm" onClick={reset}>Cancel and start over</Button>
          )}
        </div>
      )}

      {stage === "error" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <InlineBanner tone="error">{errorMsg}</InlineBanner>
          <Button variant="secondary" onClick={start}>Try again</Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phone side: a standalone screen (rendered by main.jsx when the URL  */
/* carries ?handoff=<code>, bypassing the full app) that joins the     */
/* session, runs the same camera scan, and posts the match back.       */
/* ------------------------------------------------------------------ */

export function HandoffPhoneScreen({ code, products }) {
  const [valid, setValid] = useState(null); // null (checking) | true | false
  const [sendState, setSendState] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    checkHandoffSession(code).then((ok) => { if (!cancelled) setValid(ok); });
    return () => { cancelled = true; };
  }, [code]);

  async function handleMatched(product) {
    setSendState("sending");
    setErrorMsg("");
    try {
      await sendHandoffScan(code, product.match);
      setSendState("sent");
    } catch (e) {
      setSendState("error");
      setErrorMsg((e && e.message) || "Couldn't send the result to the laptop.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col gap-5 bg-bg px-5 py-8">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">Legal Metrology · Phone handoff</div>
        <h1 className="mt-1 text-[20px] font-bold text-ink">Scan the product</h1>
      </div>

      {valid === null && (
        <div className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-ink-soft">
          <Loader2 className="animate-spin" size={16} /> Connecting to laptop session…
        </div>
      )}

      {valid === false && (
        <InlineBanner tone="error">
          This QR code has expired or doesn't exist anymore. Ask for a fresh QR code on the laptop screen and scan it again.
        </InlineBanner>
      )}

      {valid === true && sendState === "idle" && (
        <ObjectScanCapture products={products} onMatched={handleMatched} />
      )}

      {valid === true && sendState === "sending" && (
        <div className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-ink-soft">
          <Loader2 className="animate-spin" size={16} /> Sending to laptop…
        </div>
      )}

      {valid === true && sendState === "sent" && (
        <div className="flex flex-col items-center gap-3 rounded-[22px] border border-white/8 bg-panel-alt py-10 text-center">
          <CheckCircle2 size={32} className="text-green" />
          <div className="text-[15px] font-semibold text-ink">Sent to the laptop</div>
          <p className="max-w-[320px] text-[13px] text-ink-soft">
            You can put your phone away now — the demo continues on the laptop.
          </p>
        </div>
      )}

      {valid === true && sendState === "error" && (
        <div className="flex flex-col items-center gap-3">
          <InlineBanner tone="error">{errorMsg}</InlineBanner>
          <Button variant="secondary" onClick={() => setSendState("idle")}>Try again</Button>
        </div>
      )}
    </div>
  );
}
