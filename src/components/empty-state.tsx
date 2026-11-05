import { motion } from "motion/react";
import { motionTransitions } from "@/lib/motion-tokens";

const draw = { duration: 0.5, ease: [0.32, 0.72, 0, 1] } as const;

/** Quiet "all caught up" line: a check that draws itself, then the copy settles in. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center py-10 text-center">
      <svg viewBox="0 0 24 24" className="size-8 text-neutral-400 dark:text-neutral-500" fill="none">
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={draw}
          style={{ rotate: -90 }}
        />
        <motion.path
          d="M8 12.5l2.5 2.5L16 9.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...draw, duration: 0.3, delay: 0.35 }}
        />
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...motionTransitions.springSmooth, delay: 0.2 }}
      >
        <p className="mt-4 text-base font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
        {children && <p className="mt-1.5 max-w-sm text-[15px] text-neutral-500">{children}</p>}
      </motion.div>
    </div>
  );
}
