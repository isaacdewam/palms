import type { SVGProps } from "react";

/**
 * Palms sun mark, from the Wonder file "Palms" (Logo page, "Palms Mark Only").
 * The viewBox is cropped to the glyph bounds so the mark scales by height alone.
 */
export function PalmsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="8 44 184 120" fill="currentColor" role="img" aria-label="Palms" {...props}>
      <path d="M66.2 130.7L8.4 125.2L20.7 87.3L70.7 116.7ZM74.5 111.5L31.1 73L63.3 49.6L86.4 102.8ZM92.6 100.8L80.1 44.2L119.9 44.2L107.4 100.8ZM113.6 102.8L136.7 49.6L168.9 73L125.5 111.5ZM129.3 116.7L179.3 87.3L191.6 125.2L133.8 130.7ZM16 146H184V164H16ZM72 134A28 28 0 0 1 128 134Z" />
    </svg>
  );
}
