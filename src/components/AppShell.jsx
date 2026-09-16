import { useRef } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { House, Newspaper, ScanLine, ScrollText, UserRound, WalletCards } from "lucide-react";
import { cn } from "../lib/utils.js";

// Order: Scan + Feed left of Home; Cases/Rules + You on the right.
const TABS = {
  inspector: [
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "feed", label: "Feed", icon: Newspaper },
    { id: "home", label: "Home", icon: House, primary: true },
    { id: "history", label: "Cases", icon: WalletCards },
    { id: "profile", label: "You", icon: UserRound },
  ],
  supervisor: [
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "feed", label: "Feed", icon: Newspaper },
    { id: "home", label: "Home", icon: House, primary: true },
    { id: "history", label: "Cases", icon: WalletCards },
    { id: "profile", label: "You", icon: UserRound },
  ],
  ruleadmin: [
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "feed", label: "Feed", icon: Newspaper },
    { id: "home", label: "Home", icon: House, primary: true },
    { id: "ruleadmin", label: "Rules", icon: ScrollText },
    { id: "profile", label: "You", icon: UserRound },
  ],
};

const PILL = { type: "spring", stiffness: 220, damping: 26, mass: 0.75 };
const LAYOUT = { type: "spring", stiffness: 240, damping: 28, mass: 0.7 };
const LABEL = { type: "spring", stiffness: 280, damping: 30, mass: 0.55 };

export function BottomNav({ role, view, onChange }) {
  const tabs = TABS[role] || TABS.inspector;
  const reduceMotion = useReducedMotion();
  const pillLayoutId = useRef(`mq-tab-pill-${role || "app"}`).current;
  const none = { duration: 0 };

  return (
    <nav className="app-tabbar" aria-label="App">
      <LayoutGroup id={`mq-tabbar-${role || "app"}`}>
        <div className="app-tabbar-dock flex items-center gap-0.5 px-1.5 py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                layout={!reduceMotion}
                transition={reduceMotion ? none : LAYOUT}
                onClick={() => onChange(tab.id)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center justify-center overflow-hidden rounded-full outline-none",
                  "focus-visible:ring-2 focus-visible:ring-brass/50",
                  active ? "min-w-0 flex-[1.45] px-4" : "w-11 shrink-0 px-0"
                )}
              >
                {active && (
                  <motion.span
                    layoutId={reduceMotion ? undefined : pillLayoutId}
                    className={cn(
                      "absolute inset-0",
                      tab.primary
                        ? "bg-gradient-to-b from-brass-strong to-brass shadow-[0_10px_24px_-12px_rgba(208,224,248,0.55)]"
                        : "bg-paper shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)]"
                    )}
                    style={{ borderRadius: 999 }}
                    transition={reduceMotion ? none : PILL}
                  />
                )}

                <span className="relative z-[1] flex items-center justify-center gap-0">
                  <motion.span
                    layout="position"
                    transition={reduceMotion ? none : LAYOUT}
                    className="flex h-5 w-5 items-center justify-center"
                  >
                    <Icon
                      size={20}
                      strokeWidth={active ? 2.2 : 1.7}
                      className={cn(
                        "transition-colors duration-300 ease-out",
                        active
                          ? tab.primary
                            ? "text-navy-deep"
                            : "text-bg"
                          : "text-ink-soft"
                      )}
                    />
                  </motion.span>

                  <motion.span
                    initial={false}
                    animate={{
                      opacity: active ? 1 : 0,
                      maxWidth: active ? 72 : 0,
                      marginLeft: active ? 8 : 0,
                    }}
                    transition={
                      reduceMotion
                        ? none
                        : {
                            ...LABEL,
                            opacity: { duration: active ? 0.22 : 0.14, ease: [0.16, 1, 0.3, 1] },
                          }
                    }
                    className={cn(
                      "overflow-hidden whitespace-nowrap text-[12px] font-semibold tracking-wide",
                      tab.primary ? "text-navy-deep" : "text-bg"
                    )}
                    aria-hidden={!active}
                  >
                    {tab.label}
                  </motion.span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}

export function AppFrame({ children }) {
  return (
    <div className="app-stage">
      <div className="app-device">{children}</div>
    </div>
  );
}
