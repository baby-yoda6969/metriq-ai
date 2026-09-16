import { cn } from "../lib/utils.js";
export { MetriqMark } from "./MetriqLogo.jsx";

export function ScanBeam({ className }) {
  return <div className={cn("metriq-scan-beam", className)} aria-hidden="true" />;
}

export function PhoneScanMock() {
  return (
    <div className="relative mx-auto w-[270px] sm:w-[300px]">
      <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-[radial-gradient(circle_at_50%_40%,rgba(91,108,255,0.28),transparent_62%)]" />
      <div className="relative rounded-[42px] border border-white/10 bg-[#101018] p-[10px] shadow-[0_40px_80px_-24px_rgba(8,8,16,0.9),0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="relative overflow-hidden rounded-[32px] bg-[#07070C] px-5 pb-8 pt-6">
          <div className="mx-auto mb-5 h-[5px] w-20 rounded-full bg-white/10" />
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-green/15 px-2.5 py-1 text-[11px] font-semibold text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-green" />
            Field ready
          </div>
          <div className="font-display text-[22px] font-bold leading-tight tracking-tight text-ink">
            Scan labels quickly and easily.
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
            Turn a shelf photo into a signed case file in seconds.
          </p>

          <div className="relative mx-auto mt-8 aspect-[3/4] w-[78%] overflow-hidden rounded-2xl bg-gradient-to-b from-[#EDEDF4] to-[#D8D8E4] shadow-[0_24px_40px_-18px_rgba(0,0,0,0.65)]">
            <div className="absolute inset-x-5 top-6 space-y-2">
              <div className="h-2 w-2/3 rounded-full bg-[#2A2A38]/25" />
              <div className="h-1.5 w-full rounded-full bg-[#2A2A38]/15" />
              <div className="h-1.5 w-[92%] rounded-full bg-[#2A2A38]/15" />
              <div className="h-1.5 w-[78%] rounded-full bg-[#2A2A38]/15" />
              <div className="mt-4 h-16 rounded-lg bg-[#2A2A38]/10" />
              <div className="h-1.5 w-full rounded-full bg-[#2A2A38]/15" />
              <div className="h-1.5 w-[86%] rounded-full bg-[#2A2A38]/15" />
            </div>
            <ScanBeam />
          </div>

          <div className="mt-6 text-center text-[11px] font-medium text-ink-soft">Done · scan #5</div>
        </div>
      </div>
    </div>
  );
}
