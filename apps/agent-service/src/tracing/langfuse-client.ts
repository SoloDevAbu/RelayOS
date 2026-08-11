export function isTracingEnabled(): boolean {
  return false;
}

export function initTracing(): void {
  // Langfuse OTel integration deferred to Phase 12/13.
  // This stub exists so planningService can call these without conditional imports.
}
