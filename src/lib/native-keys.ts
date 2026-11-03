// WKWebView on macOS beeps for any key that reaches it with nothing to type into (tauri-apps/tauri#2626). Calling
// preventDefault() stops the beep, so every keydown that isn't headed for a text field gets it, and the few default
// actions worth keeping (focus moves, button presses, keyboard scrolling) are let through or done by hand.

const SCROLLER = "[data-app-scroller]";

/** Where typing goes. Checked after the page's own handlers, so a shortcut that moved focus counts where focus went. */
function isTextEntry(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Enter and Space press these natively, without a beep. */
function isPressable(el: Element | null) {
  return !!el?.closest("button, a[href], summary, input, [role=button], [role=checkbox], [role=switch], [role=tab], [role=menuitem], [role=option]");
}

function scrollerFor(el: Element | null): HTMLElement | null {
  for (let n = el instanceof HTMLElement ? el : null; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return document.querySelector<HTMLElement>(SCROLLER);
}

/** The keyboard scrolling preventDefault() takes away, done on the nearest scroll area instead. */
function scrollByKey(e: KeyboardEvent, el: Element | null) {
  const s = scrollerFor(el);
  if (!s) return;
  const page = () => s.clientHeight * 0.875;
  const by: Record<string, () => number> = {
    ArrowDown: () => 40,
    ArrowUp: () => -40,
    PageDown: page,
    PageUp: () => -page(),
    " ": () => (e.shiftKey ? -page() : page()),
    Home: () => -s.scrollTop,
    End: () => s.scrollHeight,
  };
  const top = by[e.key]?.();
  if (top) s.scrollBy({ top, behavior: "smooth" });
}

function onKeydown(e: KeyboardEvent) {
  // menu shortcuts (Cmd+Q, Cmd+C, …) have to reach the native menu; an unhandled one beeping is normal macOS
  if (e.metaKey || e.defaultPrevented) return;
  const el = document.activeElement;
  if (isTextEntry(el)) return;
  if (e.key === "Tab") return;
  if ((e.key === "Enter" || e.key === " ") && isPressable(el)) return;
  e.preventDefault();
  scrollByKey(e, el);
}

/** Bubble phase on window, so it runs after React's and the components' own keydown handlers. */
export function installNativeKeys() {
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}
