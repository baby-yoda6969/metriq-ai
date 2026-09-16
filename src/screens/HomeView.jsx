import { useRef } from "react";
import { ChevronRight, ScrollText, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MetriqMark } from "../components/MetriqLogo.jsx";
import { useTheme } from "../lib/ThemeContext.jsx";
import { formatDate } from "../lib/format.js";
import { getActiveRuleVersion } from "../lib/scanLogic.js";
import { StatusIcon } from "./scan/parts.jsx";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name) {
  return (name || "there").trim().split(" ")[0];
}

function statusLabel(status) {
  if (status === "compliant") return "Clear";
  if (status === "retake_needed") return "Retake";
  return "Flagged";
}

function CaseRow({ scan, onSelect, index, reduceMotion }) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(scan)}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="group flex w-full items-center gap-3.5 py-3.5 text-left transition-colors first:pt-1"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-panel-alt text-ink">
        <StatusIcon status={scan.status} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-tight text-ink">{scan.brand}</div>
        <div className="mt-0.5 truncate text-[12px] text-ink-soft">
          {scan.category} · {scan.region}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
          {statusLabel(scan.status)}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-soft/80">{formatDate(scan.date)}</div>
      </div>
      <ChevronRight
        size={15}
        className="shrink-0 text-ink-soft transition-transform group-active:translate-x-0.5"
      />
    </motion.button>
  );
}

export function HomeView({
  role,
  session,
  scans,
  ruleVersions,
  onOpenCases,
  onOpenRules,
  onOpenFeed,
  onSelectScan,
  onOpenTrends,
  onOpenRuleEditor,
}) {
  const { mode } = useTheme();
  const reduceMotion = useReducedMotion();
  const swipeRef = useRef(null);
  const openFeed = onOpenFeed || onOpenRules;
  const active = getActiveRuleVersion(ruleVersions);
  const scored = scans.filter((s) => s.status !== "retake_needed");
  const flagged = scored.filter((s) => s.status === "non_compliant");
  const recent = [...scans].slice(0, 4);
  const rate = scored.length ? Math.round((flagged.length / scored.length) * 100) : 0;

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || !openFeed) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Swipe left (finger moves left) opens the rules feed.
    if (dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.4) openFeed();
  }

  return (
    <div
      className="relative px-5 pb-8 pt-2"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(ellipse_at_20%_0%,rgba(208,224,248,0.14),transparent_55%)]"
      />

      <div className="relative mb-7 flex items-center gap-2.5">
        <MetriqMark mode={mode} size={30} />
        <div className="font-display text-[17px] font-semibold tracking-tight text-paper">
          metriq <span className="text-brass">ai</span>
        </div>
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brass/90">
          {greeting()}
        </div>
        <h1 className="mt-1.5 font-display text-[44px] font-semibold leading-[0.92] tracking-tight text-paper">
          {firstName(session?.name)}.
        </h1>
        <p className="mt-3 max-w-[300px] text-[13.5px] leading-relaxed text-ink-soft">
          Pull down to scan a pack. Swipe left for rule amendments.
        </p>
      </motion.div>

      {(role === "supervisor" || role === "ruleadmin") && (
        <div className="mt-7 flex gap-2">
          {role === "supervisor" && (
            <button
              type="button"
              onClick={onOpenTrends}
              className="flex-1 rounded-2xl border border-border bg-panel px-4 py-3 text-left text-[13px] font-semibold text-ink"
            >
              Trends
              <span className="mt-0.5 block text-[11px] font-medium text-ink-soft">Division watch</span>
            </button>
          )}
          {role === "ruleadmin" && (
            <button
              type="button"
              onClick={onOpenRuleEditor}
              className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-panel px-4 py-3 text-left text-[13px] font-semibold text-ink"
            >
              <ScrollText size={15} className="text-brass" />
              <span>
                Rulebook
                <span className="mt-0.5 block text-[11px] font-medium text-ink-soft">Draft &amp; publish</span>
              </span>
            </button>
          )}
        </div>
      )}

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-[22px] border border-border bg-border"
      >
        <button type="button" onClick={onOpenCases} className="bg-panel px-3.5 py-4 text-left">
          <div className="font-display text-[26px] font-semibold leading-none tracking-tight text-paper">
            {scans.length}
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Cases</div>
        </button>
        <div className="bg-panel px-3.5 py-4">
          <div className="font-display text-[26px] font-semibold leading-none tracking-tight text-paper">
            {rate}<span className="text-[16px]">%</span>
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Flagged</div>
        </div>
        <button type="button" onClick={openFeed} className="bg-panel px-3.5 py-4 text-left">
          <div className="font-display text-[26px] font-semibold leading-none tracking-tight text-brass">
            {active?.version || "—"}
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Rules</div>
        </button>
      </motion.div>

      <div className="mt-9 flex items-end justify-between">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-paper">Recent</h2>
        <button
          type="button"
          onClick={onOpenCases}
          className="text-[12px] font-semibold text-brass"
        >
          See all
        </button>
      </div>

      <div className="mt-1 divide-y divide-[color:var(--mq-hairline)]">
        {recent.length === 0 && (
          <div className="py-10 text-center text-[13px] text-ink-soft">
            No cases yet. Pull down to scan a pack.
          </div>
        )}
        {recent.map((s, i) => (
          <CaseRow
            key={s.id}
            scan={s}
            onSelect={onSelectScan}
            index={i}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>

      {flagged.length > 0 && role !== "ruleadmin" && (
        <button
          type="button"
          onClick={onOpenCases}
          className="mt-5 flex w-full items-start gap-2.5 rounded-[20px] border border-red/15 bg-red-soft/80 px-4 py-3.5 text-left text-[12.5px] leading-snug text-red"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{flagged.length} non-compliant</span>
            {" "}still open. Review them in Cases.
          </span>
        </button>
      )}
    </div>
  );
}
