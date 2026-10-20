import { useId, type ComponentType } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { motionTransitions } from "@/lib/motion-tokens";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/** Pill-style switcher whose active background slides between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
}) {
  // scoped so two switchers on screen don't share one sliding pill
  const pillId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 border border-neutral-800 bg-neutral-950 p-1",
        size === "md" ? "h-10 rounded-xl" : "h-8 rounded-lg",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex h-full items-center gap-2 font-medium transition-colors",
              size === "md" ? "rounded-lg px-4 text-sm" : "rounded-md px-3 text-xs",
              active ? "text-neutral-950" : "text-neutral-400 hover:text-neutral-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className={cn("absolute inset-0 bg-neutral-100", size === "md" ? "rounded-lg" : "rounded-md")}
                transition={motionTransitions.springSnappy}
              />
            )}
            {o.icon && <o.icon className="relative size-4" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
