import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { callGroq, groqConfigured, parseJsonFromText } from "./groq.js";
import { gemini3dConfigured, matchProductFromViews } from "./gemini3d.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
// NOTE: deliberately not wiring in ./rules.js's applyDeterministicRules
// here anymore — per-field compliant/non_compliant/missing verdicts are
// Gemini's own judgment again, not independently re-derived. rules.js and
// its tests are left in the codebase (a deterministic pass may get
// reinstated later); they're just not called from this endpoint right now.

const app = express();
const PORT = process.env.BACKEND_PORT || 8787;

app.use(cors({
  origin: true,
  credentials: false,
}));
app.use(express.json({ limit: "15mb" }));

// Deterministic field-status logic still lives in ./rules.js, kept in the
// codebase and under test, but is currently NOT called from this endpoint
// (see the note near the top of this file) — Gemini's own compliant/
// non_compliant/missing verdict below is what the app actually shows.

const SYSTEM_PROMPT = `You are assisting a Legal Metrology field inspector in India who is reviewing a photograph of a packaged commodity label under the Legal Metrology (Packaged Commodities) Rules, 2011.

First assess image quality. If the label is too blurry, too dark, glare-heavy, badly cropped, or wrinkled enough that you cannot confidently read most of the text, respond with ONLY this JSON (no markdown fences, no prose):
{"image_quality":"retake_needed","retake_reason":"<one short specific sentence about what is wrong>","fields":[],"overall_status":null}

Otherwise, check the label for exactly these five mandatory declarations, in this order, and respond with ONLY this JSON shape:
{
  "image_quality": "good",
  "retake_reason": null,
  "fields": [
    {"name": "Manufacturer / Packer / Importer Name & Address", "value": "<what you read, or null>", "status": "compliant" | "non_compliant" | "missing", "explanation": "<one short sentence>"},
    {"name": "Net Quantity", "value": "...", "status": "...", "explanation": "..."},
    {"name": "Maximum Retail Price (incl. of all taxes)", "value": "...", "status": "...", "explanation": "..."},
    {"name": "Month & Year of Manufacture / Packing", "value": "...", "status": "...", "explanation": "..."},
    {"name": "Consumer Care Details", "value": "...", "status": "...", "explanation": "..."}
  ],
  "overall_status": "compliant" | "non_compliant"
}
Mark a field "missing" if it cannot be found at all, "non_compliant" if present but incomplete or incorrectly formatted (e.g. MRP without "inclusive of all taxes" wording, or a range instead of a fixed price), and "compliant" if present and properly stated. Keep each "explanation" under 15 words. If the label has text in more than one language, base your reading on the English text only. This is for a hackathon demo, not a legal ruling — make a confident, reasonable judgment call even where the rules are ambiguous. Respond with the JSON object only, nothing else.`;

// Feature-audit fix: /api/analyze used to accept free-form "activeRuleText"
// directly in the request body and hand it to Gemini with wording that gave
// it precedence over the base compliance rules — a real prompt-injection
// hole (anyone calling this endpoint directly, not just through the UI,
// could supply arbitrary "rule" text the model would treat as authoritative).
// The server is now the source of truth: rule text only ever enters the
// system via POST /api/rules (called when Rule Admin actually publishes a
// version, or on initial app load to hydrate the seeded changelog) and is
// looked up here by version id. /api/analyze itself never accepts rule
// content, only a version id — an id with no matching stored text safely
// falls back to the base SYSTEM_PROMPT, same as "no active rule" today.
const ruleStore = new Map(); // version id -> rule text

app.post("/api/rules", (req, res) => {
  const { versions } = req.body || {};
  if (!Array.isArray(versions) || versions.length === 0) {
    return res.status(400).json({ error: "Request must include a non-empty 'versions' array." });
  }
  const MAX_RULE_TEXT_LENGTH = 4000;
  let stored = 0;
  for (const v of versions) {
    const version = v && typeof v.version === "string" && /^v?\d+(\.\d+)?$/.test(v.version) ? v.version : null;
    const ruleText = v && typeof v.ruleText === "string" && v.ruleText.length > 0 && v.ruleText.length <= MAX_RULE_TEXT_LENGTH
      ? v.ruleText
      : null;
    if (version && ruleText) {
      ruleStore.set(version, ruleText);
      stored++;
    }
  }
  return res.json({ stored, total: ruleStore.size });
});

app.post("/api/analyze", async (req, res) => {
  const { base64, mediaType, ruleVersion } = req.body || {};
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: "Request must include base64 image data and mediaType." });
  }

  // Feature 2a (PRD v2): whichever rule version Rule Admin currently has
  // published gets piped into the analysis prompt, so publishing a rule
  // change actually changes what the next scan checks — not just a
  // cosmetic changelog entry. The rule text itself is looked up server-side
  // (see ruleStore above) rather than trusted from the request body.
  const ruleText = typeof ruleVersion === "string" ? ruleStore.get(ruleVersion) : null;
  const systemPrompt = ruleText
    ? `${SYSTEM_PROMPT}\n\nCurrently active rule amendments to apply (version ${ruleVersion}), which take precedence over the general guidance above wherever they conflict:\n"""\n${ruleText}\n"""`
    : SYSTEM_PROMPT;

  let groqResult;
  try {
    groqResult = await callGroq({
      system: systemPrompt,
      userText: "Analyze this packaged commodity label photo.",
      images: [{ base64, mediaType }],
      maxOutputTokens: 4096,
    });
  } catch (e) {
    return res.status(e.isConfigError ? 500 : 502).json({ error: e.message });
  }

  if (!groqResult.ok) {
    return res.status(502).json({ error: "Analysis request failed: " + groqResult.error });
  }

  let parsed;
  try {
    parsed = parseJsonFromText(groqResult.text);
  } catch (e) {
    return res.status(502).json({ error: "Couldn't parse the model's response as JSON." });
  }

  if (parsed.image_quality !== "retake_needed" && !Array.isArray(parsed.fields)) {
    return res.status(502).json({ error: "The model's response was missing the expected fields list." });
  }

  return res.json(parsed);
});

// "Scan a 3D object" flow: one frame captured mid-rotation gets matched
// against a short, named list of known products — a real per-frame vision
// call, not a scripted guess. Deliberately narrow: it only ever picks one
// of the candidate names the client sends (or null), it doesn't attempt
// open-ended identification or read/verify any label declarations, so it
// can't be used to smuggle a "compliance" verdict past /api/analyze.
const MAX_IDENTIFY_CANDIDATES = 20;

app.post("/api/identify-object", async (req, res) => {
  const { base64, mediaType, candidates } = req.body || {};
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: "Request must include base64 image data and mediaType." });
  }
  const names = Array.isArray(candidates)
    ? candidates.filter((c) => typeof c === "string" && c.length > 0 && c.length <= 200).slice(0, MAX_IDENTIFY_CANDIDATES)
    : [];
  if (names.length === 0) {
    return res.status(400).json({ error: "Request must include a non-empty 'candidates' array of product names." });
  }

  const prompt = `You are looking at one frame from a live camera scan of a physical packaged product. Decide whether it shows one of these exact known products, based on any visible brand/product name text, packaging color, or shape:
${names.map((n) => `- ${n}`).join("\n")}

Respond with ONLY this JSON (no markdown fences, no prose):
{"match": "<one of the exact names above, verbatim>" | null, "confidence": "high" | "low"}

Only return a name if you're at least reasonably confident — a blurry, empty, unrelated, or ambiguous frame should get match: null rather than a guess.`;

  let groqResult;
  try {
    groqResult = await callGroq({
      system: prompt,
      userText: "Which product is in this frame?",
      images: [{ base64, mediaType }],
      maxOutputTokens: 256,
    });
  } catch (e) {
    return res.status(e.isConfigError ? 500 : 502).json({ error: e.message });
  }

  if (!groqResult.ok) {
    return res.json({ match: null });
  }

  try {
    const parsed = parseJsonFromText(groqResult.text);
    // Trust only an exact match against the names we actually sent —
    // never pass through arbitrary model output as if it were a validated
    // candidate name.
    const match = names.includes(parsed.match) && parsed.confidence !== "low" ? parsed.match : null;
    return res.json({ match });
  } catch (e) {
    return res.json({ match: null });
  }
});

// Feature 3 (PRD v2) fix: the evidence-photo gate on a per-field correction
// forced a photo to exist, but nothing checked the photo actually supported
// the claimed value — an inspector could photograph anything and type any
// "corrected" value. This asks Gemini a narrow, single question about the
// close-up photo and the claimed value; the inspector stays the final
// authority (a plausible:false result doesn't block saving — a shaky
// secondary AI check shouldn't override human judgment), but the result is
// stored on the correction record and surfaced to a supervisor reviewing
// the case, instead of the correction silently passing as fully trusted.
const VERIFY_CORRECTION_PROMPT = `You are checking a single close-up evidence photo an inspector took to support a correction to one declaration on a packaged-commodity label. You will be told the field name and the value the inspector claims this photo shows. Look only at whether the photo plausibly shows text consistent with that claimed value — do not judge legal compliance, only whether the photo could reasonably be evidence for that specific claim.

Respond with ONLY this JSON (no markdown fences, no prose):
{"plausible": true | false, "note": "<one short sentence, under 20 words, explaining what you saw or why it doesn't match>"}

If the photo is blurry, doesn't show any legible text, or shows text unrelated to the claimed value, respond plausible: false. This is for a hackathon demo, not a legal ruling.`;

app.post("/api/verify-correction", async (req, res) => {
  const { base64, mediaType, fieldName, correctedValue } = req.body || {};
  if (!base64 || !mediaType || !fieldName || !correctedValue) {
    return res.status(400).json({ error: "Request must include base64 image data, mediaType, fieldName, and correctedValue." });
  }

  let groqResult;
  try {
    groqResult = await callGroq({
      system: VERIFY_CORRECTION_PROMPT,
      userText: `Field: "${fieldName}". Claimed corrected value: "${correctedValue}".`,
      images: [{ base64, mediaType }],
      maxOutputTokens: 256,
    });
  } catch (e) {
    return res.json({ plausible: null, note: "Verification unavailable: couldn't reach the analysis service." });
  }

  if (!groqResult.ok) {
    return res.json({ plausible: null, note: "Verification unavailable: analysis service error." });
  }

  try {
    const parsed = parseJsonFromText(groqResult.text);
    return res.json({ plausible: !!parsed.plausible, note: String(parsed.note || "").slice(0, 200) });
  } catch (e) {
    return res.json({ plausible: null, note: "Verification unavailable: couldn't parse the response." });
  }
});

// RegulaSync: reads an uploaded PDF of a new/amended regulation and
// extracts each distinct requirement as a clause, normalized into the same
// flat "Rule <ref>: <body>" line format every hand-written and "Check for
// updates" clause already uses — so parseRuleCatalog (src/lib/ruleCatalog.js)
// accepts it with no format changes, and it can just be appended to a draft
// like any manually-typed clause. It never publishes anything itself: the
// caller still has to run it through the existing draft → submit-for-review
// → approve-and-publish pipeline.
const REGULASYNC_PROMPT = `You are RegulaSync, an assistant that reads a source document containing a new or amended Legal Metrology regulation (a notification, gazette amendment, or circular) and extracts every distinct new or changed requirement from it, so it can be added to a machine-readable rule catalog.

For each distinct requirement you find, produce one clause with:
- "ref": a short rule reference in the exact style "Rule 6(1)(g)" or "Rule 26(a) proviso (exemption threshold)" — always start with the word "Rule" followed by the clause/sub-clause number from the document. If the document genuinely doesn't specify a number, use "Rule (new)" followed by a short parenthetical label instead.
- "body": the requirement itself, stated as a single, complete, self-contained sentence an inspector could check a label against. Under 40 words. No line breaks.

Also produce:
- "summary": one short sentence (under 20 words) describing what this document changes overall, suitable as a changelog entry.
- "citation": the document's own reference to itself if stated (notification number, gazette reference, date) — otherwise null.

Respond with ONLY this JSON (no markdown fences, no prose):
{"summary": "...", "citation": "..." | null, "clauses": [{"ref": "...", "body": "..."}]}

If the document contains no extractable regulatory requirement, respond with {"summary": "No extractable requirements found in this document.", "citation": null, "clauses": []}.`;

app.post("/api/regulasync/extract", async (req, res) => {
  const { base64, mediaType, filename } = req.body || {};
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: "Request must include base64 document data and mediaType." });
  }
  if (mediaType !== "application/pdf") {
    return res.status(400).json({ error: "RegulaSync currently accepts PDF documents only." });
  }

  let documentText;
  try {
    const parsedPdf = await pdfParse(Buffer.from(base64, "base64"));
    documentText = (parsedPdf.text || "").trim();
  } catch (e) {
    return res.status(400).json({ error: "Could not read text from this PDF." });
  }
  if (!documentText) {
    return res.status(400).json({ error: "This PDF has no extractable text." });
  }

  let groqResult;
  try {
    groqResult = await callGroq({
      system: REGULASYNC_PROMPT,
      userText: documentText.slice(0, 48000),
      maxOutputTokens: 2048,
    });
  } catch (e) {
    return res.status(e.isConfigError ? 500 : 502).json({ error: e.message });
  }

  if (!groqResult.ok) {
    return res.status(502).json({ error: "RegulaSync request failed: " + groqResult.error });
  }

  let parsed;
  try {
    parsed = parseJsonFromText(groqResult.text);
  } catch (e) {
    return res.status(502).json({ error: "Couldn't parse RegulaSync's response as JSON." });
  }

  // Bug fix: this used to slice to MAX_CLAUSES with no way for the caller to
  // tell that anything had been dropped — in a tool whose whole purpose is
  // making sure new legal requirements reach the rule engine, silently
  // losing requirement #26+ of an omnibus amendment is a real compliance
  // gap, not just a UX nit. totalFound/truncated let the client warn the
  // admin instead of quietly showing "25 clauses extracted" as if that were
  // everything.
  const MAX_CLAUSES = 25;
  const allClauses = Array.isArray(parsed.clauses) ? parsed.clauses : [];
  const clauses = allClauses.slice(0, MAX_CLAUSES);
  const ruleLines = clauses
    .map((c) => {
      const rawRef = c && typeof c.ref === "string" ? c.ref.trim() : "";
      const ref = /^rule\b/i.test(rawRef) ? rawRef : `Rule (new)${rawRef ? " " + rawRef : ""}`;
      const body = c && typeof c.body === "string" ? c.body.replace(/\s*\n\s*/g, " ").trim() : "";
      return body ? `${ref}: ${body}` : null;
    })
    .filter(Boolean);

  return res.json({
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "",
    citation: typeof parsed.citation === "string" ? parsed.citation.slice(0, 300) : null,
    filename: typeof filename === "string" ? filename.slice(0, 200) : null,
    ruleLines,
    totalFound: allClauses.length,
    truncated: allClauses.length > MAX_CLAUSES,
  });
});

// Phone → laptop scan handoff: a short-lived, in-memory relay so the
// "scan on the phone, continue on the laptop" demo flow needs no manual
// file transfer. The laptop creates a session (gets back a short code),
// shows it as a QR the phone scans to join, and subscribes over
// Server-Sent Events; the phone POSTs its one matched product once the
// scan completes, which is pushed straight to any listening laptop. Lives
// only in this process's memory — fine for a live demo, not meant to
// survive a server restart or outlive HANDOFF_TTL_MS.
const HANDOFF_TTL_MS = 30 * 60 * 1000;
const handoffSessions = new Map(); // code -> { result, listeners: Set<res>, timeout }

// Excludes 0/O/1/I so a presenter reading the fallback code aloud (or typing
// it in if the QR scan fails) never has to guess which character a digit or
// letter was meant to be.
const HANDOFF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeHandoffCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => HANDOFF_ALPHABET[Math.floor(Math.random() * HANDOFF_ALPHABET.length)]).join("");
  } while (handoffSessions.has(code));
  return code;
}

function scheduleHandoffExpiry(code) {
  const session = handoffSessions.get(code);
  if (!session) return;
  if (session.timeout) clearTimeout(session.timeout);
  session.timeout = setTimeout(() => {
    const s = handoffSessions.get(code);
    if (!s) return;
    for (const res of s.listeners) {
      try { res.end(); } catch (e) { /* client already gone */ }
    }
    handoffSessions.delete(code);
  }, HANDOFF_TTL_MS);
}

app.post("/api/generate-3d", async (req, res) => {
  const { views, brandHint } = req.body || {};
  if (!Array.isArray(views) || views.length === 0) {
    return res.status(400).json({ error: "Request must include a non-empty 'views' array of captured photos." });
  }
  const cleaned = views
    .filter((v) => v && typeof v.base64 === "string" && v.base64.length > 0)
    .slice(0, 6)
    .map((v) => ({
      base64: v.base64,
      mediaType: typeof v.mediaType === "string" ? v.mediaType : "image/jpeg",
      label: typeof v.label === "string" ? v.label.slice(0, 40) : "view",
    }));
  if (cleaned.length === 0) {
    return res.status(400).json({ error: "Each view must include base64 image data." });
  }

  try {
    const result = await matchProductFromViews({ views: cleaned, brandHint: brandHint || "" });
    return res.json({
      glb: result.product.glb,
      name: result.product.name,
      match: result.match,
      confidence: result.confidence,
      declaredFields: result.product.declaredFields,
      source: result.source,
    });
  } catch (e) {
    if (e.fallbackProduct) {
      return res.json({
        glb: e.fallbackProduct.glb,
        name: e.fallbackProduct.name,
        match: e.fallbackProduct.match,
        confidence: "low",
        declaredFields: e.fallbackProduct.declaredFields,
        source: "brand-fallback",
        warning: e.message,
      });
    }
    return res.status(e.isConfigError ? 500 : 502).json({ error: e.message });
  }
});

app.post("/api/handoff/create", (req, res) => {
  const code = makeHandoffCode();
  handoffSessions.set(code, { result: null, listeners: new Set() });
  scheduleHandoffExpiry(code);
  res.json({ code });
});

app.get("/api/handoff/:code", (req, res) => {
  res.json({ valid: handoffSessions.has(req.params.code) });
});

app.get("/api/handoff/:code/stream", (req, res) => {
  const session = handoffSessions.get(req.params.code);
  if (!session) {
    res.status(404).json({ error: "This handoff session has expired or doesn't exist." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":ok\n\n");
  session.listeners.add(res);

  // A phone scan that lands between "laptop creates the session" and
  // "laptop's stream connects" would otherwise be missed entirely — replay
  // it immediately to a newly-attached listener if it's already there.
  if (session.result) {
    res.write(`event: scan\ndata: ${JSON.stringify(session.result)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    try { res.write(":hb\n\n"); } catch (e) { /* client already gone */ }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    session.listeners.delete(res);
  });
});

app.post("/api/handoff/:code/scan", (req, res) => {
  const session = handoffSessions.get(req.params.code);
  if (!session) {
    return res.status(404).json({ error: "This handoff session has expired or doesn't exist. Generate a new QR code on the laptop and try again." });
  }
  const { match } = req.body || {};
  if (typeof match !== "string" || !match) {
    return res.status(400).json({ error: "Request must include a 'match' product identifier." });
  }
  session.result = { match, receivedAt: Date.now() };
  scheduleHandoffExpiry(req.params.code);
  for (const listenerRes of session.listeners) {
    try { listenerRes.write(`event: scan\ndata: ${JSON.stringify(session.result)}\n\n`); } catch (e) { /* client already gone */ }
  }
  res.json({ ok: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");
const distIndex = path.join(distPath, "index.html");
if (fs.existsSync(distIndex)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(distIndex);
  });
}

app.listen(PORT, () => {
  const mode = fs.existsSync(distIndex) ? "app+api" : "api-only";
  console.log(
    `metriq ai backend listening on http://localhost:${PORT} (${mode}; ` +
    `Groq: ${groqConfigured() ? "on" : "off"}, 3D: ${gemini3dConfigured() ? "on" : "off"})`
  );
});
