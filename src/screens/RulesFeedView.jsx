import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronUp, Scale, Sparkles } from "lucide-react";
import { formatDate } from "../lib/format.js";
import { cn } from "../lib/utils.js";

function amendmentBlurb(rule) {
  if (!rule?.ruleText) return rule?.desc || "";
  const lines = rule.ruleText.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || rule.desc;
}

function FeedCard({ rule, index, total, isActive }) {
  const blurb = amendmentBlurb(rule);
  return (
    <article
      className={cn(
        "relative flex h-full w-full shrink-0 snap-start snap-always flex-col justify-end overflow-hidden px-5 pb-8 pt-6",
        "bg-[#07090D]"
      )}
      aria-hidden={!isActive}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(208,224,248,0.16),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/80 to-transparent"
      />

      <div className="relative mb-auto flex items-center justify-between pt-1">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D0E0F8]">
          <Scale size={11} /> Rules feed
        </div>
        <div className="text-[11px] font-medium text-white/45">
          {index + 1} / {total}
        </div>
      </div>

      <div className="relative max-w-[340px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#D0E0F8] px-2.5 py-1 text-[11px] font-bold tracking-wide text-black">
            {rule.version}
          </span>
          {index === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-green">
              <Sparkles size={10} /> Latest
            </span>
          )}
          <span className="text-[11px] text-white/45">{formatDate(rule.date)}</span>
        </div>

        <h2 className="mt-4 font-display text-[28px] font-semibold leading-[1.15] tracking-tight text-white">
          {rule.desc}
        </h2>

        <p className="mt-3 text-[14px] leading-relaxed text-white/65">{blurb}</p>

        <div className="mt-5 flex items-center gap-2 text-[12px] text-white/50">
          <CheckCircle2 size={14} className="text-green" />
          Human-verified · {rule.author || "Rule Admin"}
        </div>

        {rule.reviewerComments && (
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-white/55">
            “{rule.reviewerComments}”
          </p>
        )}
      </div>

      {index < total - 1 && (
        <div className="relative mt-8 flex flex-col items-center gap-1 text-white/35">
          <ChevronUp size={16} className="animate-bounce" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Swipe up</span>
        </div>
      )}
    </article>
  );
}

export function RulesFeedView({ ruleVersions = [], onBack }) {
  const published = ruleVersions.filter((r) => r.status === "published");
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);

  const syncActive = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const h = el.clientHeight || 1;
    setActive(Math.min(published.length - 1, Math.max(0, Math.round(el.scrollTop / h))));
  }, [published.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    syncActive();
    el.addEventListener("scroll", syncActive, { passive: true });
    return () => el.removeEventListener("scroll", syncActive);
  }, [syncActive]);

  if (published.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#07090D] px-8 text-center">
        <Scale size={28} className="text-[#D0E0F8]/70" />
        <p className="text-[14px] text-white/55">No published amendments yet.</p>
        {onBack && (
          <button type="button" onClick={onBack} className="mt-2 text-[13px] font-semibold text-[#D0E0F8]">
            Back to Home
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {published.map((rule, i) => (
          <div key={rule.version} className="h-full w-full shrink-0 snap-start snap-always" style={{ height: "100%" }}>
            <FeedCard rule={rule} index={i} total={published.length} isActive={i === active} />
          </div>
        ))}
      </div>
    </div>
  );
}
