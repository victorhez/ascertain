import { MARK_PATH, MARK_VIEWBOX } from "@/lib/brand";

export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={(size * 730) / 830} viewBox={MARK_VIEWBOX} className={className} aria-hidden fill="currentColor">
      <path d={MARK_PATH} />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-fg">
      <Mark size={size} />
      <span className="text-[19px] font-medium tracking-[-0.02em]">Ascertain</span>
    </span>
  );
}
