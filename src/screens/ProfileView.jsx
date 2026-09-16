import { useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Languages,
  LogOut,
  Moon,
  ScrollText,
  Server,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { useTheme } from "../lib/ThemeContext.jsx";
import { getApiBase, isNativeApp } from "../lib/apiBase.js";
import { getActiveRuleVersion } from "../lib/scanLogic.js";
import { cn } from "../lib/utils.js";

function Toggle({ on, onChange, label }) {
  const { mode } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={cn(
        "relative inline-flex h-7 w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200",
        on ? "bg-[#7A9AC4]" : mode === "dark" ? "bg-[#2A3038]" : "bg-[#D0D5DC]"
      )}
    >
      <span
        className={cn(
          "h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          on ? "translate-x-[18px]" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SettingsGroup({ children }) {
  return (
    <div className="overflow-hidden rounded-[24px] bg-panel">
      {children}
    </div>
  );
}

function NavRow({ icon: Icon, label, hint, onClick, trailing, last }) {
  const interactive = typeof onClick === "function";
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left",
        interactive && "active:bg-panel-alt/50"
      )}
    >
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 left-[4.25rem] h-px bg-[color:var(--mq-hairline)]"
        />
      )}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-alt text-ink-soft">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium tracking-tight text-ink">{label}</div>
        {hint && (
          <div className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-ink-soft">{hint}</div>
        )}
      </div>
      {trailing ?? (interactive ? <ChevronRight size={16} className="shrink-0 text-ink-soft/60" /> : null)}
    </Comp>
  );
}

export function ProfileView({
  role,
  session,
  ruleVersions,
  onSwitchRole,
  onOpenRules,
  onBack,
}) {
  const { mode, setMode } = useTheme();
  const [pauseNotifs, setPauseNotifs] = useState(false);
  const [apiBase, setApiBase] = useState(() => {
    try {
      return localStorage.getItem("metriq.apiBase") || getApiBase() || "";
    } catch {
      return "";
    }
  });
  const [apiSaved, setApiSaved] = useState(false);
  const active = getActiveRuleVersion(ruleVersions);
  const roleLabel = role === "inspector" ? "Inspector" : role === "supervisor" ? "Supervisor" : "Rule Admin";
  const initial = (session?.name || "?").trim().charAt(0).toUpperCase();
  const handle = session?.employeeId ? `@${String(session.employeeId).toLowerCase()}` : "@field";
  const native = isNativeApp();

  function saveApiBase() {
    const next = apiBase.trim().replace(/\/$/, "");
    try {
      if (next) localStorage.setItem("metriq.apiBase", next);
      else localStorage.removeItem("metriq.apiBase");
    } catch {
      /* ignore */
    }
    setApiSaved(true);
    window.setTimeout(() => setApiSaved(false), 1600);
  }

  return (
    <div className="px-5 pb-10 pt-4">
      <div className="relative mb-6 flex h-11 items-center justify-center">
        <button
          type="button"
          onClick={onBack || onSwitchRole}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-panel text-ink"
          aria-label="Back"
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-paper">Settings</h1>
      </div>

      <div className="flex w-full items-center gap-3.5 rounded-[24px] bg-panel px-4 py-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-panel-alt font-display text-[22px] font-semibold text-paper ring-1 ring-[color:var(--mq-hairline)]">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-tight text-ink">
            {session?.name || "Inspector"}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-ink-soft">
            {handle} · {roleLabel}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3.5">
        <SettingsGroup>
          <NavRow
            icon={Bell}
            label="Pause notifications"
            trailing={<Toggle on={pauseNotifs} onChange={setPauseNotifs} label="Pause notifications" />}
          />
          <NavRow
            icon={Settings2}
            label="General settings"
            hint="Field defaults & capture"
            last={!native}
          />
          {native && (
            <div className="px-4 pb-4 pt-1">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-ink">
                <Server size={14} className="text-ink-soft" />
                Analysis server
              </div>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="http://192.168.1.10:8787"
                className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brass"
                aria-label="API server URL"
              />
              <button
                type="button"
                onClick={saveApiBase}
                className="mt-2 w-full rounded-xl bg-panel-alt py-2 text-[13px] font-semibold text-ink"
              >
                {apiSaved ? "Saved" : "Save server URL"}
              </button>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">
                Phone APK needs your laptop/server IP running `npm start` on the same Wi‑Fi.
              </p>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup>
          <NavRow
            icon={Moon}
            label="Dark mode"
            trailing={
              <Toggle
                on={mode === "dark"}
                onChange={(next) => setMode(next ? "dark" : "light")}
                label="Dark mode"
              />
            }
          />
          <NavRow icon={Languages} label="Language" hint="English (India)" />
          <NavRow
            icon={Users}
            label="Switch role"
            hint="Inspector, supervisor, or rule admin"
            onClick={onSwitchRole}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          {role === "inspector" && (
            <NavRow
              icon={Sparkles}
              label="Rule updates"
              hint={`${active?.version || "—"} in force`}
              onClick={onOpenRules}
            />
          )}
          <NavRow
            icon={ScrollText}
            label="Live ruleset"
            hint={active ? `${active.version} in force` : "No version loaded"}
            onClick={role === "inspector" ? onOpenRules : undefined}
          />
          <NavRow
            icon={CircleHelp}
            label="About metriq ai"
            hint="Packaged Commodities Rules, 2011"
            last
          />
        </SettingsGroup>
      </div>

      <button
        type="button"
        onClick={onSwitchRole}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-[#C45B52] shadow-[0_12px_28px_-16px_rgba(0,0,0,0.45)] active:scale-[0.98]"
      >
        <LogOut size={16} strokeWidth={2} />
        Log Out
      </button>
    </div>
  );
}
