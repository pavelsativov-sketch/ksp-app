import { AsyncLocalStorage } from "node:async_hooks";
import type { MongoClient } from "mongodb";

export interface MongoRequestState {
  requestId?: string;
  clientPromise?: Promise<MongoClient>;
  closePromise?: Promise<void>;
}

const storage = new AsyncLocalStorage<MongoRequestState>();

declare global {
  // OpenNext can evaluate the request entrypoint and the Next server bundle as
  // separate module graphs. Keep the request registry on the isolate global so
  // both bundles resolve the same request-local Mongo client.
  var __mongoRequestStates: Map<string, MongoRequestState> | undefined;
}

function requestStates(): Map<string, MongoRequestState> {
  return (globalThis.__mongoRequestStates ??= new Map());
}

export function createMongoRequestState(requestId = crypto.randomUUID()): MongoRequestState {
  return { requestId };
}

/** Gives every incoming Cloudflare request its own MongoDB client lifecycle. */
export function runWithMongoRequest<T>(callback: () => T, state = createMongoRequestState()): T {
  const requestId = state.requestId;
  if (requestId) requestStates().set(requestId, state);
  try {
    return storage.run(state, callback);
  } catch (error) {
    if (requestId) requestStates().delete(requestId);
    throw error;
  }
}

export function mongoRequestState(): MongoRequestState | undefined {
  return storage.getStore();
}

export function mongoRequestStateById(requestId: string | null | undefined): MongoRequestState | undefined {
  return requestId ? requestStates().get(requestId) : undefined;
}

/** Close a request-local connection after its response body has been consumed. */
export async function closeMongoRequest(state = storage.getStore()): Promise<void> {
  if (!state) return;
  try {
    if (state.clientPromise && !state.closePromise) {
      state.closePromise = state.clientPromise
        .then((client) => client.close(true))
        .catch(() => {
          // The driver error can contain connection details; never log it.
          console.error("[mongo] Не удалось закрыть соединение запроса");
        });
    }
    await state.closePromise;
  } finally {
    if (state.requestId) requestStates().delete(state.requestId);
  }
}
