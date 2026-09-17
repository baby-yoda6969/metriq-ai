import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ClipboardList, LayoutDashboard, LogIn, ScrollText } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";

const ROLE_META = {
  inspector: {
    icon: ClipboardList,
    title: "Inspector",
    unit: "Field Compliance Wing",
    idLabel: "Inspector ID",
    defaultName: "Priya Nair",
    defaultId: "LM-2291",
  },
  supervisor: {
    icon: LayoutDashboard,
    title: "Supervisor",
    unit: "Divisional Control Room",
    idLabel: "Supervisor ID",
    defaultName: "Arvind Menon",
    defaultId: "LM-SUP-114",
  },
  ruleadmin: {
    icon: ScrollText,
    title: "Rule Admin",
    unit: "Rules & Amendments Cell",
    idLabel: "Admin ID",
    defaultName: "Kavitha Iyer",
    defaultId: "LM-ADM-07",
  },
};

// Every field opens pre-filled with a real-looking credential for that role,
// so the whole form is already valid the moment it renders — tab through
// (or just hit Enter) to sign in immediately, or clear a field and type a
// different name/ID to sign in as someone else.
export function Login({ role, onLogin, onBack }) {
  const reduceMotion = useReducedMotion();
  const meta = ROLE_META[role] || ROLE_META.inspector;
  const Icon = meta.icon;
  const [name, setName] = useState(meta.defaultName);
  const [employeeId, setEmployeeId] = useState(meta.defaultId);
  const [password, setPassword] = useState("welcome@123");
  const [submitting, setSubmitting] = useState(false);

  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    timer.current = setTimeout(() => {
      onLogin({
        name: name.trim() || meta.defaultName,
        employeeId: employeeId.trim() || meta.defaultId,
        role,
      });
    }, 450);
  }

  return (
    <div className="website-auth-layout">
      <div className="website-auth">
      <div className="website-auth-body">
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-navy"
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Choose a different role
      </button>
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <h1 className="website-auth-title">Welcome back.</h1>
          <p className="website-auth-intro">Enter your details to continue to the workspace.</p>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-deep text-brass">
              <Icon size={20} />
            </div>
            <div>
              <div className="font-display text-lg font-semibold text-ink">{meta.title} sign-in</div>
              <div className="text-[12px] text-ink-soft">{meta.unit}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="block">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">Full name</div>
              <input
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                autoFocus
              />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">{meta.idLabel}</div>
              <input
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[13px] font-semibold text-ink">Password</div>
              <input
                type="password"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <Button type="submit" variant="primary" className="mt-1.5 w-full justify-center" disabled={submitting}>
              {submitting ? "Signing in…" : (<><LogIn size={15} /> Sign in</>)}
            </Button>
          </form>
        </Card>
      </motion.div>
      </div>
      </div>

    </div>
  );
}
