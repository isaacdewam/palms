import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

export interface SelectionAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** A small bar over a text field that offers actions for the highlighted text. */
export function SelectionActions({ open, actions, note, className }: { open: boolean; actions: SelectionAction[]; note?: string | null; className?: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={motionTransitions.springSnappy}
          // pressing a button mustn't blur the field, or the highlight (and the bar) would go before the click lands
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute bottom-full left-0 z-30 mb-1.5 flex items-center gap-0.5 rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 shadow-[0_8px_24px_rgb(0_0_0/0.5)]",
            className,
          )}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs whitespace-nowrap text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
          {note && <span className="px-1.5 text-xs whitespace-nowrap text-neutral-500">{note}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
