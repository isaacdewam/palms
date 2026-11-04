import { DropdownMenu } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReleaseStatus = "unreleased" | "maybe" | "released" | "skipped";

const OPTIONS: { value: ReleaseStatus; label: string; hint: string }[] = [
  { value: "unreleased", label: "Unreleased", hint: "Sync it" },
  { value: "maybe", label: "Maybe on DSPs", hint: "Sync it, but worth a look" },
  { value: "released", label: "On DSPs", hint: "Skip it" },
  { value: "skipped", label: "Skip", hint: "Not on DSPs, but don't sync it" },
];

const DOT: Partial<Record<string, string>> = {
  unreleased: "bg-emerald-500",
  released: "bg-amber-400",
  skipped: "bg-red-500",
};

/** A track's release status at a glance: green syncs, yellow is on DSPs, red is skipped, ? is maybe, ! is a failed check. */
export function StatusMark({ status }: { status: string }) {
  const dot = DOT[status];
  if (dot) return <span className={cn("size-2.5 shrink-0 rounded-full", dot)} />;
  return <span className="w-2.5 text-center text-sm leading-none font-semibold text-neutral-200">{status === "maybe" ? "?" : "!"}</span>;
}

/** The status mark on a cover's corner, turned into a menu so the user can overrule the DSP check. */
export function StatusMenu({
  status,
  label,
  onChange,
  className,
}: {
  status: string;
  label: string;
  onChange: (s: ReleaseStatus) => void;
  className?: string;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        title={label}
        aria-label={`${label}, change release status`}
        className={cn(
          "flex size-8 items-center justify-center rounded-md bg-neutral-900/90 shadow-[0_2px_8px_rgb(0_0_0/0.4)] outline-none transition-colors hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-600 data-[state=open]:bg-neutral-800",
          className,
        )}
      >
        <StatusMark status={status} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-52 rounded-xl border border-neutral-800 bg-neutral-950 p-1 text-sm text-neutral-100 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {OPTIONS.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              onSelect={() => onChange(o.value)}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-neutral-900"
            >
              <span className="flex w-2.5 shrink-0 justify-center">
                <StatusMark status={o.value} />
              </span>
              <div className="flex-1">
                <div className="font-medium">{o.label}</div>
                <div className="text-xs text-neutral-500">{o.hint}</div>
              </div>
              {o.value === status && <Check className="size-4 text-neutral-400" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
