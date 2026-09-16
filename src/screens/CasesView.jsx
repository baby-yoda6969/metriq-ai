import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { StatusIcon } from "./scan/parts.jsx";
import { formatDate } from "../lib/format.js";
import { hashSeed } from "../lib/hash.js";

function riskScore(scan) {
  const base = scan.status === "compliant" ? 12 : scan.status === "retake_needed" ? 38 : 58;
  return Math.min(97, base + (hashSeed(scan.id) % 30));
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "non_compliant", label: "Flagged" },
  { id: "compliant", label: "Clear" },
  { id: "retake_needed", label: "Retake" },
];

export function CasesView({ scans, onSelect }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = scans.filter((s) => {
    const matchesQuery = (s.brand + " " + s.category + " " + s.region).toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="px-5 pb-6 pt-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brass">Repository</div>
      <h1 className="mt-1 font-display text-[32px] font-semibold leading-tight text-paper">Cases</h1>
      <p className="mt-1 text-[13px] text-ink-soft">{filtered.length} file{filtered.length === 1 ? "" : "s"} in this lens.</p>

      <div className="mt-5 flex items-center gap-2 rounded-full border border-border bg-panel px-3.5 py-2.5">
        <Search size={15} className="text-ink-soft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Brand, category, region"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-soft"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={
              "shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold " +
              (statusFilter === f.id ? "bg-paper text-bg" : "border border-border bg-panel text-ink-soft")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s)}
            className="rounded-[20px] border border-border bg-panel p-4 text-left hover:border-brass/30"
          >
            <div className="flex items-start gap-3">
              <StatusIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate font-semibold text-ink">{s.brand}</div>
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-ink-soft" />
                </div>
                <div className="mt-0.5 text-[12px] text-ink-soft">{s.category}</div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                  <span>{s.region}</span>
                  <span>{formatDate(s.date)}</span>
                  <span>{s.inspector}</span>
                  <span className="font-mono text-brass">R{riskScore(s)}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-border px-4 py-10 text-center text-[13px] text-ink-soft">
            No cases match this search.
          </div>
        )}
      </div>
    </div>
  );
}
