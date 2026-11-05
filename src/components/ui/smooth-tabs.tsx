import { useId } from "react";
import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { motionTransitions } from "@/lib/motion-tokens";

export interface SmoothTab<T extends string> {
  value: T;
  label: string;
}

/** Text-only tabs whose active pill glides between options on a shared-layout spring. */
export function SmoothTabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: readonly SmoothTab<T>[];
  className?: string;
}) {
  // scoped so two tab bars on screen don't share one pill
  const pillId = useId();
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsPrimitive.List className={cn("inline-flex h-9 items-center rounded-md bg-neutral-900/70 p-1", className)}>
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="relative h-full rounded-sm px-4 text-sm font-medium text-neutral-400 outline-none transition-colors duration-300 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-600 data-[state=active]:text-neutral-950"
          >
            {t.value === value && (
              <motion.span
                layoutId={pillId}
                // only glide when the tab changes: otherwise the header re-rendering as the window resizes moved the pill
                // with it, and it sprang after the tabs instead of staying put under its label
                layoutDependency={value}
                className="absolute inset-0 rounded-sm bg-neutral-100 shadow-sm"
                transition={motionTransitions.springMorph}
              />
            )}
            <span className="relative">{t.label}</span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
