import { ClipboardList, LayoutDashboard, ScrollText } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Card } from "../components/ui/Card.jsx";


const ROLES = [
  { key: "inspector", view: "scan", icon: ClipboardList, title: "Inspector", sub: "Scan labels in the field, build case history" },
  { key: "supervisor", view: "dashboard", icon: LayoutDashboard, title: "Supervisor", sub: "Monitor trends, categories, and brand compliance" },
  { key: "ruleadmin", view: "ruleadmin", icon: ScrollText, title: "Rule Admin", sub: "Draft, verify, and publish rule amendments" },
];

export function RolePicker({ onSelect }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="website-role-picker">
      <div className="website-role-content">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-brass">Legal Metrology · Field Compliance</div>
      <h1 className="mt-2.5 font-display text-[30px] font-semibold text-ink">Choose your workspace.</h1>
      <p className="website-role-intro">Select your role to sign in and continue.</p>
      <div className="website-role-options">
        {ROLES.map((role, i) => {
          const Icon = role.icon;
          return (
            <motion.div
              key={role.key}
              initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card
                as="button"
                interactive
                className="flex h-full w-full flex-col items-start gap-3"
                onClick={() => onSelect(role.key, role.view)}
              >
                <Icon size={26} color="var(--navy)" />
                <div className="font-display text-lg font-semibold text-ink">{role.title}</div>
                <div className="text-[12.5px] text-ink-soft">{role.sub}</div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
