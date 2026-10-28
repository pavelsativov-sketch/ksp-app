export const MAX_TOOL_RESULT_CHARS = 4000;

function compactBarrier(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const barrier = value as Record<string, unknown>;
  return {
    requiresUserAction: barrier.requiresUserAction === true,
    kind: typeof barrier.kind === 'string' ? barrier.kind.slice(0, 40) : null,
    reason: typeof barrier.reason === 'string' ? barrier.reason.slice(0, 200) : undefined,
    domain: typeof barrier.domain === 'string' ? barrier.domain.slice(0, 120) : undefined,
  };
}

/** Browser tool output is fed back into the model: keep it textual and bounded. */
export function boundedResult<T extends Record<string, unknown>>(result: T): T {
  const safe = JSON.parse(JSON.stringify(result, (_key, value) =>
    value instanceof Uint8Array || value instanceof ArrayBuffer ? "[binary data omitted]" : value,
  )) as T;
  if (JSON.stringify(safe).length <= MAX_TOOL_RESULT_CHARS) return safe;

  const compact = {
    success: safe.success === true,
    error: typeof safe.error === 'string' ? safe.error.slice(0, 800) : undefined,
    url: typeof safe.url === 'string' ? safe.url.slice(0, 500) : undefined,
    title: typeof safe.title === 'string' ? safe.title.slice(0, 300) : undefined,
    content: typeof safe.content === 'string' ? safe.content.slice(0, 1000) : undefined,
    // Без координат агент не сможет кликнуть, а без authBarrier runner не
    // увидит страницу входа и не передаст управление учителю.
    interactables: typeof safe.interactables === 'string' ? safe.interactables.slice(0, 1500) : undefined,
    authBarrier: compactBarrier(safe.authBarrier),
    clicked: typeof safe.clicked === 'string' ? safe.clicked.slice(0, 200) : undefined,
    typed: typeof safe.typed === 'string' ? safe.typed.slice(0, 200) : undefined,
    pageUnchanged: safe.pageUnchanged === true,
    notice: typeof safe.notice === 'string' ? safe.notice.slice(0, 200) : undefined,
  };
  // The fixed caps above leave ample room for JSON syntax; retain the most
  // useful page facts rather than silently cutting a serialized value.
  return compact as unknown as T;
}
