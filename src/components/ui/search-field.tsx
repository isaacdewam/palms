import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** True when every word of `query` shows up somewhere in `fields`, ignoring case and accents. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]) {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const hay = fold(fields.filter(Boolean).join(" "));
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** A quiet search box framed like `Segmented`; the icon lights up white while it's in use. ⌘F / Ctrl+F focuses it and Escape clears it. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  size = "md",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Matches `Segmented`'s sizes, so the two line up side by side. */
  size?: "sm" | "md";
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn(
        "group/search flex items-center gap-1 border border-neutral-800 bg-neutral-950 p-1 transition-colors focus-within:border-neutral-700",
        size === "md" ? "h-10 rounded-xl" : "h-8 rounded-lg",
        className,
      )}
      onMouseDown={(e) => {
        // clicks on the frame or icon land in the input
        if (e.target !== input.current) {
          e.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <Search
        className={cn(
          "ml-1.5 shrink-0 text-neutral-500 transition-colors group-focus-within/search:text-neutral-100",
          size === "md" ? "size-4" : "size-3.5",
          value && "text-neutral-100",
        )}
      />
      <input
        ref={input}
        type="search"
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent px-1.5 text-neutral-100 outline-none placeholder:text-neutral-600 [&::-webkit-search-cancel-button]:hidden",
          size === "md" ? "text-sm" : "text-xs",
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        aria-label={placeholder}
      />
      {value && (
        <button
          className={cn(
            "flex aspect-square h-full shrink-0 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-100",
            size === "md" ? "rounded-lg" : "rounded-md",
          )}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
