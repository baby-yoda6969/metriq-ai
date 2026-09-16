import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Eye, EyeOff, IdCard, Lock, User,
} from "lucide-react";
import { AuthShell } from "../components/AuthShell.jsx";
import { COLORS } from "../lib/theme.js";

const ROLE_ORDER = ["inspector", "supervisor", "ruleadmin"];

const ROLE_META = {
  inspector: {
    title: "Inspector",
    unit: "Field Compliance Wing",
    idLabel: "Inspector ID",
    defaultName: "Priya Nair",
    defaultId: "LM-2291",
  },
  supervisor: {
    title: "Supervisor",
    unit: "Divisional Control Room",
    idLabel: "Supervisor ID",
    defaultName: "Arvind Menon",
    defaultId: "LM-SUP-114",
  },
  ruleadmin: {
    title: "Rule Admin",
    unit: "Rules & Amendments Cell",
    idLabel: "Admin ID",
    defaultName: "Kavitha Iyer",
    defaultId: "LM-ADM-07",
  },
};

function UnderlineField({ label, icon: Icon, trailing, children }) {
  return (
    <label className="block text-left">
      <div className="mb-2 text-[12px] font-medium" style={{ color: COLORS.authMuted }}>{label}</div>
      <div
        className="flex items-center gap-2.5 border-b pb-2.5 transition-colors focus-within:border-[#708098]"
        style={{ borderColor: COLORS.authLine }}
      >
        <Icon size={16} style={{ color: COLORS.authMuted }} className="shrink-0" />
        <div className="min-w-0 flex-1">{children}</div>
        {trailing}
      </div>
    </label>
  );
}

const inputClass =
  "w-full bg-transparent text-[14px] outline-none placeholder:text-[#B0B0B0]";

export function Login({ onLogin, initialRole = "inspector" }) {
  const reduceMotion = useReducedMotion();
  const [role, setRole] = useState(initialRole);
  const meta = ROLE_META[role] || ROLE_META.inspector;
  const [name, setName] = useState(meta.defaultName);
  const [employeeId, setEmployeeId] = useState(meta.defaultId);
  const [password, setPassword] = useState("welcome@123");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = ROLE_META[role] || ROLE_META.inspector;
    setName(next.defaultName);
    setEmployeeId(next.defaultId);
  }, [role]);

  function cycleRole() {
    const i = ROLE_ORDER.indexOf(role);
    setRole(ROLE_ORDER[(i + 1) % ROLE_ORDER.length]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onLogin(
        {
          name: name.trim() || meta.defaultName,
          employeeId: employeeId.trim() || meta.defaultId,
          role,
        },
        password
      );
    } catch (err) {
      setError(err?.message || "Could not sign in. Check Firebase Auth is enabled.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: COLORS.authInk }}>
          Sign in
        </h1>
        <div className="mt-1.5 h-[3px] w-8 rounded-full" style={{ background: COLORS.authAccent }} />
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: COLORS.authMuted }}>
          {meta.title} · {meta.unit}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <UnderlineField label="Full name" icon={User}>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-label="Full name"
            />
          </UnderlineField>

          <UnderlineField label={meta.idLabel} icon={IdCard}>
            <input
              className={inputClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoComplete="username"
              aria-label={meta.idLabel}
            />
          </UnderlineField>

          <UnderlineField
            label="Password"
            icon={Lock}
            trailing={(
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 p-0.5"
                style={{ color: COLORS.authMuted }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          >
            <input
              type={showPassword ? "text" : "password"}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="enter your password"
              aria-label="Password"
            />
          </UnderlineField>

          <div className="flex items-center justify-between text-[12.5px]" style={{ color: COLORS.authMuted }}>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className="flex h-4 w-4 items-center justify-center rounded border"
                style={{
                  borderColor: remember ? COLORS.authAccent : COLORS.authLine,
                  background: remember ? COLORS.authAccent : "transparent",
                }}
                aria-hidden
              >
                {remember && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              Remember Me
            </label>
            <button type="button" className="font-semibold" style={{ color: COLORS.authAccent }}>
              Forgot Password?
            </button>
          </div>

          {error && (
            <p className="text-[12.5px] leading-relaxed" style={{ color: "#B42318" }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full rounded-xl py-3.5 text-[15px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: COLORS.authInk }}
          >
            {submitting ? "Signing in…" : "Login"}
          </button>
        </form>

        <p className="mt-8 text-center text-[13px]" style={{ color: COLORS.authMuted }}>
          Signing in as {meta.title}.{" "}
          <button type="button" onClick={cycleRole} className="font-bold" style={{ color: COLORS.authAccent }}>
            Switch role
          </button>
        </p>
      </motion.div>
    </AuthShell>
  );
}
