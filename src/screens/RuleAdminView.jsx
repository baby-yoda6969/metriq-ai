import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Ban, Check, CheckCircle2, Columns2, FileDown, FilePlus2, FileText, GitCompare,
  Loader2, Pencil, Plus, RotateCcw, ScrollText, Search, Send, Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";
import { TickDivider } from "../components/TickDivider.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { InlineBanner } from "../components/ui/InlineBanner.jsx";
import { formatDate } from "../lib/format.js";
import { getActiveRuleVersion } from "../lib/scanLogic.js";
import { analyzeLabelImage, extractRegulaSyncClauses } from "../lib/api.js";
import { apiUrl } from "../lib/apiBase.js";
import { downloadRuleVersionPdf } from "../lib/pdf/ruleVersionReport.js";
import {
  CATEGORY_TONE, addClauseLine, diffRuleText, groupByCategory, parseRuleCatalog, removeClauseAt, updateClauseText,
} from "../lib/ruleCatalog.js";

// A pool of several (not one fixed) candidates, so clicking "Check for
// updates" twice doesn't produce byte-identical output. Each is loosely
// modeled on a real, dated amendment referenced in rule_engine_ref/ (pan
// masala's exemption withdrawal, the real Rule 7 font-size table) rather
// than invented from nothing. It is never auto-published — it drops into
// the same human-review draft pathway a manually-written amendment does.
const RULE_UPDATE_CANDIDATES = [
  {
    desc: "Adds a WhatsApp/SMS-enabled mobile number as an accepted alternative consumer-care contact channel alongside toll-free numbers and e-mail.",
    newRuleLine: "Rule 6(1)(g) (consumer care): A WhatsApp or SMS-enabled mobile number is an accepted alternative consumer-care contact channel.",
    citation: "Ministry of Consumer Affairs, Food & Public Distribution: press note on expanding consumer-care channels.",
  },
  {
    desc: "Withdraws the ≤10g/10ml exemption for pan masala and gutka products; full declarations now required on every pack size regardless of quantity.",
    newRuleLine: "Rule 26(a) proviso (exemption threshold): Pan masala and gutka products are excluded from the ≤10g/10ml exemption; full declarations are required on every pack size.",
    citation: "Department of Consumer Affairs, G.S.R. 881(E).",
  },
  {
    desc: "Clarifies the minimum numeral height for declarations on small Principal Display Panels between 50 and 100 sq cm.",
    newRuleLine: "Rule 7(2), Table I: Numerals and letters on a Principal Display Panel between 50 and 100 sq cm must use a minimum height of 1.5mm.",
    citation: "Department of Consumer Affairs, Rule 7, Table I.",
  },
];

const STATUS_FLIP_TONE = { compliant: "compliant", non_compliant: "non-compliant", missing: "non-compliant", retake_needed: "caution" };

function nextVersionLabelFrom(version) {
  const [major, minor] = version.replace("v", "").split(".").map(Number);
  return `v${major}.${minor + 1}`;
}

// One row of the structured clause catalog: shows the parsed rule
// reference, its inferred category, and the requirement text, and — while
// drafting — lets the admin edit or remove just this clause instead of
// hunting through a wall of free text for it.
function ClauseRow({ clause, editable, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clause.raw);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded border border-navy bg-panel-alt p-3">
        <textarea
          className="w-full rounded border border-border px-2.5 py-2 font-mono text-[12.5px] focus:border-navy focus:outline-none"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => { onSave(draft); setEditing(false); }}>
            <Check size={13} /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(clause.raw); setEditing(false); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded border border-border bg-panel px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-ink">{clause.ref}</span>
          <Badge tone={CATEGORY_TONE[clause.category] || "neutral"}>{clause.category}</Badge>
        </div>
        <div className="text-[13px] leading-snug text-ink">{clause.body}</div>
      </div>
      {editable && (
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Edit clause" className="rounded p-1.5 text-ink-soft hover:bg-panel-alt hover:text-navy" onClick={() => setEditing(true)}>
            <Pencil size={14} />
          </button>
          <button type="button" aria-label="Remove clause" className="rounded p-1.5 text-ink-soft hover:bg-red-soft hover:text-red" onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Renders the +/− line diff between two rule texts — shared by the
// draft-vs-active view and the version-vs-version comparison tool.
function DiffPanel({ diff, emptyLabel = "No changes." }) {
  if (diff.removed.length === 0 && diff.added.length === 0) {
    return <div className="text-[12.5px] italic text-ink-soft">{emptyLabel}</div>;
  }
  return (
    <div className="flex flex-col gap-1 font-mono text-[11.5px] leading-relaxed">
      {diff.removed.map((line, i) => (
        <div key={"r" + i} className="rounded bg-red-soft px-2 py-1 text-red">− {line}</div>
      ))}
      {diff.added.map((line, i) => (
        <div key={"a" + i} className="rounded bg-green-soft px-2 py-1 text-green">+ {line}</div>
      ))}
    </div>
  );
}

// RegulaSync: lets the admin upload a PDF of a new/amended law directly
// into a draft, as an addition to typing clauses in by hand — not a
// replacement for it. Purely presentational; all state and the extraction
// call live in RuleAdminView so the extracted clauses land in the same
// `ruleText`/`desc` state a manual edit would.
function RegulaSyncUpload({ uploading, error, sources, onFile }) {
  const fileInputRef = useRef(null);
  return (
    <div className="mb-1 flex flex-col gap-3 rounded-[22px] border border-navy/30 bg-gradient-to-br from-panel to-panel-alt p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-brass-strong" />
        <span className="font-display text-[13.5px] font-bold text-ink">RegulaSync</span>
        <span className="rounded-full bg-navy px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white">AI extraction</span>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-soft">
        Upload a PDF of a new or amended regulation. RegulaSync reads it, extracts each requirement, and normalizes it into the clause catalog below — in the same format the rule engine already accepts. Review and edit the results like any manually drafted clause, then submit for verification as usual.
      </p>
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy/40 bg-panel/70 py-3 text-[12.5px] font-medium text-ink transition-colors hover:border-navy hover:bg-brass-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? (
          <><Loader2 className="animate-spin" size={15} /> Reading document &amp; extracting clauses…</>
        ) : (
          <><UploadCloud size={15} /> Upload law PDF</>
        )}
      </button>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      {sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sources.map((s, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2 rounded border border-green/20 bg-green-soft px-3 py-2 text-[12px] text-green">
                <FileText size={13} className="mt-0.5 shrink-0" />
                <span>
                  Extracted <strong>{s.count}</strong> clause{s.count === 1 ? "" : "s"} from <strong>{s.filename}</strong>
                  {s.citation && <span className="text-ink-soft"> — cited as &ldquo;{s.citation}&rdquo;</span>}
                </span>
              </div>
              {s.truncated && (
                <InlineBanner tone="error">
                  This document describes {s.totalFound} requirements, but only the first {s.count} were extracted. Review
                  {" "}<strong>{s.filename}</strong> yourself for the remaining {s.totalFound - s.count} — they were not added to this draft.
                </InlineBanner>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RuleAdminView({ ruleVersions, onPublish, adminName = "Rule Admin", scans = [] }) {
  const activeVersion = getActiveRuleVersion(ruleVersions);
  const [drafting, setDrafting] = useState(false);
  const [desc, setDesc] = useState("");
  const [ruleText, setRuleText] = useState(activeVersion.ruleText);
  const [editorMode, setEditorMode] = useState("catalog"); // "catalog" | "raw"
  const [addingClause, setAddingClause] = useState(false);
  const [newClauseText, setNewClauseText] = useState("");
  const [pending, setPending] = useState(null); // { version, desc, ruleText, source? } once submitted for review
  const [reviewComment, setReviewComment] = useState("");
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [impact, setImpact] = useState({ running: false, result: null, error: null });
  const [search, setSearch] = useState("");
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const [rollbackConfirm, setRollbackConfirm] = useState(null);
  const [regulaSync, setRegulaSync] = useState({ uploading: false, error: null, sources: [] });
  const checkTimeoutRef = useRef(null);
  const rollbackTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      if (rollbackTimeoutRef.current) clearTimeout(rollbackTimeoutRef.current);
    };
  }, []);

  const diff = useMemo(() => diffRuleText(activeVersion.ruleText, ruleText), [activeVersion.ruleText, ruleText]);
  const catalog = useMemo(() => parseRuleCatalog(ruleText), [ruleText]);
  const catalogGroups = useMemo(() => groupByCategory(catalog), [catalog]);

  // Bug fix: a completed impact-preview result used to sit there unchanged
  // however much the draft (or the active version, via a rollback) moved
  // on afterward — an admin could run the preview, see "0 of N cases would
  // change," then add or edit a clause that actually does cause a flip, and
  // still be looking at the old all-clear result while approving. Rather
  // than clearing it from an effect (which can cascade an extra render for
  // no visible benefit here), staleness is just derived every render by
  // comparing against the text the result was actually computed for —
  // recorded on the result itself when the preview ran — and surfaced as an
  // explicit warning instead of quietly vanishing.
  const impactStale = !!(impact.result && (impact.result.forRuleText !== ruleText || impact.result.forActiveRuleText !== activeVersion.ruleText));

  function nextVersionLabel() {
    return nextVersionLabelFrom(activeVersion.version);
  }

  function startDraft() {
    setDrafting(true);
    setDesc("");
    setRuleText(activeVersion.ruleText);
    setPending(null);
    setReviewComment("");
    setImpact({ running: false, result: null, error: null });
    setEditorMode("catalog");
    setAddingClause(false);
    setRegulaSync({ uploading: false, error: null, sources: [] });
  }

  function cancelDraft() {
    setDrafting(false);
    setPending(null);
    setReviewComment("");
    setImpact({ running: false, result: null, error: null });
    setRegulaSync({ uploading: false, error: null, sources: [] });
  }

  // Reads the uploaded PDF, sends it to RegulaSync for extraction, and
  // appends each normalized clause line to the draft the same way
  // addClauseLine does for a manually-typed clause — this is additive to
  // manual drafting, not a replacement for it. If the summary field is
  // still empty, it's prefilled from RegulaSync's own summary; an already
  // non-empty summary (the admin typed one, or a prior upload set one) is
  // left alone.
  async function handleRegulaSyncFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setRegulaSync((s) => ({ ...s, error: "RegulaSync currently accepts PDF documents only." }));
      return;
    }
    setRegulaSync((s) => ({ ...s, uploading: true, error: null }));
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Couldn't read the file."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const result = await extractRegulaSyncClauses({ base64, filename: file.name });
      if (!result.ruleLines || result.ruleLines.length === 0) {
        setRegulaSync((s) => ({ ...s, uploading: false, error: result.summary || "No extractable requirements found in this document." }));
        return;
      }
      setRuleText((current) => {
        let next = current;
        for (const line of result.ruleLines) next = addClauseLine(next, line);
        return next;
      });
      setPending(null);
      setDesc((d) => (d.trim() ? d : result.summary || `RegulaSync: extracted ${result.ruleLines.length} clause(s) from ${file.name}`));
      setRegulaSync((s) => ({
        uploading: false,
        error: null,
        sources: [
          ...s.sources,
          {
            filename: file.name,
            citation: result.citation,
            count: result.ruleLines.length,
            truncated: !!result.truncated,
            totalFound: result.totalFound,
          },
        ],
      }));
    } catch (err) {
      setRegulaSync((s) => ({ ...s, uploading: false, error: err.message || "RegulaSync extraction failed." }));
    }
  }

  function submitForReview() {
    setPending({ version: nextVersionLabel(), desc: desc.trim() || "Untitled amendment", ruleText });
  }

  function approve() {
    onPublish({
      version: pending.version,
      date: new Date().toISOString().slice(0, 10),
      author: adminName,
      desc: pending.desc,
      status: "published",
      reviewerComments: reviewComment.trim() || "Approved without further comment.",
      ruleText: pending.ruleText,
    });
    setDrafting(false);
    setPending(null);
    setReviewComment("");
    setImpact({ running: false, result: null, error: null });
  }

  function reject() {
    setPending(null);
    setReviewComment("");
    // stays in drafting mode so the rule text can be revised and resubmitted
  }

  function checkForUpdates() {
    setCheckingUpdates(true);
    setPending(null);
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(() => {
      const found = RULE_UPDATE_CANDIDATES[Math.floor(Math.random() * RULE_UPDATE_CANDIDATES.length)];
      const newRuleText = addClauseLine(activeVersion.ruleText, found.newRuleLine);
      setDrafting(true);
      setDesc(found.desc);
      setRuleText(newRuleText);
      setReviewComment("");
      setEditorMode("catalog");
      setPending({
        version: nextVersionLabelFrom(activeVersion.version),
        desc: found.desc,
        ruleText: newRuleText,
        source: found.citation,
      });
      setCheckingUpdates(false);
      checkTimeoutRef.current = null;
    }, 1600);
  }

  // Registers the draft's rule text under its real prospective version
  // number (not a throwaway id) so /api/analyze can look it up exactly the
  // same way it would once actually published, then re-runs a handful of
  // recent, photographed cases through it and compares each field's status
  // before/after. This is a real compliance safeguard, not a cosmetic
  // preview: it uses the same server-side analysis path a live scan does.
  async function runImpactPreview() {
    setImpact({ running: true, result: null, error: null });
    const previewVersion = pending ? pending.version : nextVersionLabel();
    const previewRuleText = pending ? pending.ruleText : ruleText;
    try {
      await fetch(apiUrl("/api/rules"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versions: [{ version: previewVersion, ruleText: previewRuleText }] }),
      });
      const sample = scans.filter((s) => s.imageDataUrl && s.status !== "retake_needed" && Array.isArray(s.fields)).slice(0, 5);
      const perCase = [];
      for (const s of sample) {
        const base64 = s.imageDataUrl.split(",")[1];
        try {
          const parsed = await analyzeLabelImage({ base64, mediaType: "image/jpeg" }, { version: previewVersion });
          const flips = [];
          (parsed.fields || []).forEach((f) => {
            const before = s.fields.find((bf) => bf.name === f.name);
            if (before && before.status !== f.status) flips.push({ field: f.name, from: before.status, to: f.status });
          });
          perCase.push({ id: s.id, brand: s.brand, flips });
        } catch (e) {
          perCase.push({ id: s.id, brand: s.brand, flips: [], error: e.message || "Could not be re-checked." });
        }
      }
      const changedCount = perCase.filter((c) => c.flips.length > 0).length;
      setImpact({
        running: false,
        result: { sampleSize: sample.length, changedCount, perCase, forRuleText: previewRuleText, forActiveRuleText: activeVersion.ruleText },
        error: null,
      });
    } catch (e) {
      setImpact({ running: false, result: null, error: e.message || "Impact preview failed." });
    }
  }

  // Bug fix: a rollback used to leave a stale `pending` review sitting
  // around untouched. Since both `submitForReview()` and this function
  // compute the new version's number the same way — nextVersionLabelFrom
  // the CURRENT active version — a rollback confirmed while a draft was
  // still awaiting approval collided with it on the exact same version
  // number (e.g. both compute "v2.5" off the still-active v2.4). Approving
  // that stale pending draft afterward then published a second, different
  // "v2.5" on top of the rollback's own "v2.5", silently overwriting the
  // server's rule text for that version id — exactly the kind of history
  // rewrite this whole rollback feature exists to avoid. Clearing `pending`
  // here forces "Submit for review" to recompute its version number fresh,
  // against the now-updated active version, next time it's clicked.
  function rollbackTo(targetVersion) {
    onPublish({
      version: nextVersionLabelFrom(activeVersion.version),
      date: new Date().toISOString().slice(0, 10),
      author: adminName,
      desc: `Rolled back to the content of ${targetVersion.version} ("${targetVersion.desc}").`,
      status: "published",
      reviewerComments: `Rollback confirmed by ${adminName}.`,
      ruleText: targetVersion.ruleText,
    });
    setRollbackConfirm(null);
    setPending(null);
  }

  function askRollback(version) {
    setRollbackConfirm(version);
    if (rollbackTimeoutRef.current) clearTimeout(rollbackTimeoutRef.current);
    rollbackTimeoutRef.current = setTimeout(() => setRollbackConfirm(null), 5000);
  }

  const filteredVersions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ruleVersions;
    return ruleVersions.filter((r) =>
      r.version.toLowerCase().includes(q) ||
      r.desc.toLowerCase().includes(q) ||
      r.author.toLowerCase().includes(q) ||
      (r.ruleText || "").toLowerCase().includes(q)
    );
  }, [ruleVersions, search]);

  const compareDiff = useMemo(() => {
    if (!compareA || !compareB) return null;
    const a = ruleVersions.find((v) => v.version === compareA);
    const b = ruleVersions.find((v) => v.version === compareB);
    if (!a || !b) return null;
    return diffRuleText(a.ruleText, b.ruleText);
  }, [compareA, compareB, ruleVersions]);

  return (
    <div className="lm-panel">
      <div className="lm-eyebrow">Rule Admin</div>
      <h2 className="lm-h2">Rule editor &amp; version repository</h2>
      <TickDivider />

      <div className="lm-ruleadmin-active">
        <div className="lm-ruleadmin-active-top">
          <ScrollText size={16} color="var(--brass)" />
          <span className="lm-ruleadmin-active-label">Active rule version</span>
          <span className="lm-changelog-version">{activeVersion.version}</span>
          <span className="lm-changelog-date">{formatDate(activeVersion.date)}</span>
          <span className="ml-auto font-mono text-[11px] text-ink-soft">{parseRuleCatalog(activeVersion.ruleText).length} clauses in force</span>
        </div>
        <div className="lm-ruleadmin-active-desc">{activeVersion.desc}</div>
      </div>

      {!drafting ? (
        <div className="lm-btn-row" style={{ justifyContent: "flex-start" }}>
          <button className="lm-btn lm-btn-primary" onClick={startDraft}>
            <FilePlus2 size={15} /> Draft new rule version
          </button>
          <button className="lm-btn" onClick={checkForUpdates} disabled={checkingUpdates}>
            {checkingUpdates ? <Loader2 className="lm-spin" size={14} /> : <Search size={14} />}
            {checkingUpdates ? "Searching…" : "Check for updates"}
          </button>
        </div>
      ) : (
        <div className="lm-ruleadmin-draft">
          <h3 className="lm-h3" style={{ marginTop: 8 }}>Drafting {nextVersionLabel()}</h3>

          <RegulaSyncUpload
            uploading={regulaSync.uploading}
            error={regulaSync.error}
            sources={regulaSync.sources}
            onFile={handleRegulaSyncFile}
          />

          <div className="lm-form-row" style={{ alignItems: "flex-start" }}>
            <label style={{ paddingTop: 7 }}>Summary</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Require QR-linked batch codes on dairy packaging" />
          </div>

          <div className="mb-3 mt-2 flex gap-1 rounded-md border border-border bg-panel-alt p-1">
            <button
              type="button"
              className={"flex-1 rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors " + (editorMode === "catalog" ? "bg-panel text-ink shadow-sm" : "text-ink-soft")}
              onClick={() => setEditorMode("catalog")}
            >
              Clause catalog
            </button>
            <button
              type="button"
              className={"flex-1 rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors " + (editorMode === "raw" ? "bg-panel text-ink shadow-sm" : "text-ink-soft")}
              onClick={() => setEditorMode("raw")}
            >
              Raw text (advanced)
            </button>
          </div>

          <div className="lm-ruleadmin-editor-row">
            <div className="lm-ruleadmin-editor-col">
              {editorMode === "catalog" ? (
                <>
                  <div className="lm-ruleadmin-col-label">Clauses in this draft</div>
                  <div className="flex max-h-[340px] flex-col gap-3 overflow-y-auto pr-1">
                    {catalogGroups.map((group) => (
                      <div key={group.category} className="flex flex-col gap-2">
                        <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-brass">{group.category}</div>
                        {group.clauses.map((clause) => (
                          <ClauseRow
                            key={clause.index}
                            clause={clause}
                            editable
                            onSave={(newRaw) => { setRuleText(updateClauseText(ruleText, clause.index, newRaw)); setPending(null); }}
                            onRemove={() => { setRuleText(removeClauseAt(ruleText, clause.index)); setPending(null); }}
                          />
                        ))}
                      </div>
                    ))}
                    {addingClause ? (
                      <div className="flex flex-col gap-2 rounded border border-navy bg-panel-alt p-3">
                        <textarea
                          className="w-full rounded border border-border px-2.5 py-2 font-mono text-[12.5px] focus:border-navy focus:outline-none"
                          rows={2}
                          placeholder="e.g. Rule 6(1)(f): Dimensions of the commodity must be declared where relevant."
                          value={newClauseText}
                          onChange={(e) => setNewClauseText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!newClauseText.trim()}
                            onClick={() => { setRuleText(addClauseLine(ruleText, newClauseText)); setNewClauseText(""); setAddingClause(false); setPending(null); }}
                          >
                            <Check size={13} /> Add
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAddingClause(false); setNewClauseText(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center justify-center gap-1.5 rounded border border-dashed border-border py-2.5 text-[12.5px] font-medium text-ink-soft hover:border-navy hover:text-navy"
                        onClick={() => setAddingClause(true)}
                      >
                        <Plus size={14} /> Add clause
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="lm-ruleadmin-col-label">Rule text (editable)</div>
                  <textarea
                    className="lm-ruleadmin-textarea"
                    value={ruleText}
                    onChange={(e) => { setRuleText(e.target.value); setPending(null); }}
                    rows={8}
                  />
                </>
              )}
            </div>
            <div className="lm-ruleadmin-editor-col">
              <div className="lm-ruleadmin-col-label"><GitCompare size={13} /> Diff vs {activeVersion.version}</div>
              <div className="lm-diff">
                <DiffPanel diff={diff} emptyLabel="No changes yet." />
              </div>
            </div>
          </div>

          {!pending ? (
            <div className="lm-btn-row" style={{ justifyContent: "flex-start" }}>
              <button className="lm-btn lm-btn-primary" onClick={submitForReview} disabled={diff.added.length === 0 && diff.removed.length === 0}>
                <Send size={14} /> Submit for review
              </button>
              <button className="lm-btn" onClick={cancelDraft}>Cancel</button>
            </div>
          ) : (
            <div className="lm-ruleadmin-review">
              <div className="lm-ruleadmin-review-label">
                <AlertTriangle size={14} color="var(--brass)" /> {pending.version} awaiting human verification
              </div>
              {pending.source && (
                <div className="lm-field-explain" style={{ marginBottom: 10 }}>
                  <Search size={11} style={{ verticalAlign: "-1.5px", marginRight: 4 }} />
                  Cited source: “{pending.source}”. Verify before publishing.
                </div>
              )}
              <div className="lm-form-row">
                <label>Comments</label>
                <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Reviewer comments (optional)" />
              </div>
              <div className="lm-btn-row" style={{ justifyContent: "flex-start" }}>
                <button className="lm-btn lm-btn-primary" onClick={approve}><Check size={14} /> Approve &amp; publish</button>
                <button className="lm-btn" onClick={reject}><Ban size={14} /> Reject, return to draft</button>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-md border border-border bg-panel p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[12.5px] font-semibold text-ink">Compliance impact preview</div>
              <Button size="sm" variant="secondary" onClick={runImpactPreview} disabled={impact.running || (diff.added.length === 0 && diff.removed.length === 0)}>
                {impact.running ? <Loader2 className="animate-spin" size={13} /> : <GitCompare size={13} />}
                {impact.running ? "Re-checking recent cases…" : "Run impact preview"}
              </Button>
            </div>
            <p className="mb-2 text-[12px] leading-snug text-ink-soft">
              Re-runs this draft against the most recent photographed cases on file and reports which of them would change verdict — the same analysis path a live scan uses, so this is a real check, not an estimate.
            </p>
            {impact.error && <InlineBanner tone="error">{impact.error}</InlineBanner>}
            {impactStale && (
              <InlineBanner tone="info">The draft has changed since this check ran — the result below may no longer be accurate. Run it again before approving.</InlineBanner>
            )}
            {impact.result && (
              impact.result.sampleSize === 0 ? (
                <InlineBanner tone="info">No recent cases with photos on file to test this draft against.</InlineBanner>
              ) : (
                <div className="flex flex-col gap-2">
                  <InlineBanner tone={impact.result.changedCount > 0 ? "error" : "success"}>
                    {impact.result.changedCount} of {impact.result.sampleSize} recent case{impact.result.sampleSize === 1 ? "" : "s"} would change verdict under this draft.
                  </InlineBanner>
                  {impact.result.perCase.map((c) => (
                    <div key={c.id} className="rounded border border-border px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                        {c.brand || "Unlabeled sample"}
                        <span className="font-mono text-[10.5px] font-normal text-ink-soft">{c.id}</span>
                      </div>
                      {c.error ? (
                        <div className="text-[12px] text-ink-soft">{c.error}</div>
                      ) : c.flips.length === 0 ? (
                        <div className="text-[12px] text-ink-soft">No change.</div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {c.flips.map((f, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                              <span className="text-ink">{f.field}:</span>
                              <Badge tone={STATUS_FLIP_TONE[f.from] || "neutral"}>{f.from.replace("_", " ")}</Badge>
                              <span className="text-ink-soft">→</span>
                              <Badge tone={STATUS_FLIP_TONE[f.to] || "neutral"}>{f.to.replace("_", " ")}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      <h3 className="lm-h3">Version repository</h3>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded border border-border bg-panel px-2.5 py-1.5">
          <Search size={13} className="text-ink-soft" />
          <input
            className="w-full text-[13px] focus:outline-none"
            placeholder="Search by version, rule number, keyword, or author…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button type="button" onClick={() => setSearch("")}><X size={13} className="text-ink-soft" /></button>}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel-alt p-3">
        <Columns2 size={14} className="text-ink-soft" />
        <span className="text-[12px] font-semibold text-ink-soft">Compare</span>
        <select className="rounded border border-border bg-panel px-2 py-1 text-[12.5px]" value={compareA || ""} onChange={(e) => setCompareA(e.target.value || null)}>
          <option value="">Version A…</option>
          {ruleVersions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}
        </select>
        <span className="text-[12px] text-ink-soft">vs</span>
        <select className="rounded border border-border bg-panel px-2 py-1 text-[12.5px]" value={compareB || ""} onChange={(e) => setCompareB(e.target.value || null)}>
          <option value="">Version B…</option>
          {ruleVersions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}
        </select>
        {(compareA || compareB) && (
          <button type="button" className="text-[12px] text-ink-soft underline" onClick={() => { setCompareA(null); setCompareB(null); }}>Clear</button>
        )}
      </div>
      {compareDiff && (
        <div className="mb-4 rounded-md border border-border bg-panel p-3.5">
          <div className="mb-2 text-[12.5px] font-semibold text-ink">{compareA} → {compareB}</div>
          <DiffPanel diff={compareDiff} emptyLabel="These two versions have identical rule text." />
        </div>
      )}

      <div className="lm-changelog">
        {filteredVersions.length === 0 && (
          <div className="text-[13px] italic text-ink-soft">No versions match “{search}”.</div>
        )}
        {filteredVersions.map((r) => {
          const isActive = r.version === activeVersion.version;
          return (
            <div key={r.version} className="lm-changelog-item">
              <div className="lm-changelog-top">
                <span className="lm-changelog-version">{r.version}</span>
                {isActive && <span className="lm-changelog-new">ACTIVE</span>}
                <span className="lm-changelog-date">{formatDate(r.date)}</span>
                <span className="lm-changelog-approved"><CheckCircle2 size={12} /> Human-verified · {r.author}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label="Download version as PDF" className="rounded p-1.5 text-ink-soft hover:bg-panel-alt hover:text-navy" onClick={() => downloadRuleVersionPdf(r)}>
                    <FileDown size={14} />
                  </button>
                  {!isActive && (
                    rollbackConfirm?.version === r.version ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => rollbackTo(r)}>Confirm rollback?</Button>
                        <button type="button" className="text-[12px] text-ink-soft underline" onClick={() => setRollbackConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" aria-label="Roll back to this version" className="rounded p-1.5 text-ink-soft hover:bg-brass-soft hover:text-ink" onClick={() => askRollback(r)}>
                        <RotateCcw size={14} />
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="lm-changelog-desc">{r.desc}</div>
              {r.reviewerComments && <div className="lm-ruleadmin-comment">“{r.reviewerComments}”</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
