/**
 * `@cloudflare/playwright` imports `env` for its optional binding-name helpers.
 * Mekty always passes the resolved Browser Run binding object directly, so no
 * ambient global binding map is needed by this package in the Next bundle.
 */
export const env: Record<string, never> = Object.freeze({});
