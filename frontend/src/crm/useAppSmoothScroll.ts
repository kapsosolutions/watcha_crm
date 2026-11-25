// Native hardware-accelerated scrolling is used across all CRM panels
// (.page-body, .composer-fields, .campaign-setup, .co-main, .messages, etc.)
// to avoid wheel-hijack desyncs when scrolling past form inputs/selects/textareas
// or under responsive CSS zoom scaling.
export function useAppSmoothScroll(_enabled = true) {
  // Intentionally a no-op: let the browser handle panel scrolling natively.
}
