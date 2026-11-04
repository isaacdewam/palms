import { Check } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

export type Phase = "idle" | "scraping" | "checking" | "review" | "syncing" | "done";
type StepState = "pending" | "active" | "done";

const ORDER: Phase[] = ["scraping", "checking", "review", "syncing", "done"];

/** Where a run is: fetch → release check → review → sync. */
export function RunSteps({
  phase,
  scraped,
  local,
  checked,
  total,
  failed,
  synced,
  toSync,
}: {
  phase: Phase;
  scraped: number;
  /** Fetched tracks left out because they're already in the local files. */
  local: number;
  checked: number;
  total: number;
  /** Tracks whose release check couldn't reach every service. */
  failed: number;
  synced: number;
  toSync: number;
}) {
  const at = ORDER.indexOf(phase);
  const state = (step: Phase): StepState => {
    const i = ORDER.indexOf(step);
    return at > i ? "done" : at === i ? "active" : "pending";
  };
  const fetched = phase !== "scraping" ? `${total} new${local ? ` · ${local} in local files` : ""}` : null;
  const steps: { key: Phase; label: string; detail: string }[] = [
    { key: "scraping", label: "Fetch", detail: fetched ?? (scraped ? `${scraped} tracks` : "Reading source") },
    { key: "checking", label: "Release check", detail: total ? `${checked} of ${total}${failed ? ` · ${failed} failed` : ""}` : "Waiting" },
    { key: "review", label: "Review", detail: "Choose what syncs" },
    { key: "syncing", label: "Sync", detail: toSync ? `${synced} of ${toSync}` : "Waiting" },
  ];
  // a nothing-new run ends straight after fetching, so only fetch counts as done and the rest say why they didn't run
  const emptyDone = phase === "done" && total === 0;
  if (emptyDone) {
    steps[1].detail = "Nothing to check";
    steps[2].detail = "Nothing to review";
    steps[3].detail = "Nothing to sync";
  }
  const states = steps.map((s, i) => (emptyDone && i > 0 ? "pending" : state(s.key)));

  return (
    <ol className="flex items-center justify-center gap-3">
      {steps.map((s, i) => {
        const st = states[i];
        return (
          <li key={s.key} className="flex items-center gap-3">
            {i > 0 && (
              <span aria-hidden className={cn("h-px w-10 transition-colors", st === "pending" ? "bg-neutral-800" : "bg-neutral-500")} />
            )}
            <div
              aria-current={st === "active" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md border py-1.5 text-sm font-medium transition-colors",
                st === "active" ? "border-neutral-800 bg-neutral-900/70 pr-3.5 pl-2 text-neutral-100" : "border-transparent px-0.5",
                st === "done" && "text-neutral-100",
                st === "pending" && "text-neutral-500",
              )}
            >
              <StepIcon state={st} />
              <span>{s.label}</span>
              <span className="sr-only">: {s.detail}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  if (state === "active") return <Loader variant="arc" size={20} color="#10b981" decorative className="shrink-0" />;
  return <span className="size-5 shrink-0 rounded-full border border-neutral-700" />;
}
