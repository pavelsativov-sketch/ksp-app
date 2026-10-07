import { AsyncLocalStorage } from "node:async_hooks";
import type { MongoClient } from "mongodb";

interface MongoRequestState {
  clientPromise?: Promise<MongoClient>;
  closePromise?: Promise<void>;
}

const storage = new AsyncLocalStorage<MongoRequestState>();

/** OpenNext calls this once for each inbound Worker request. */
export function runWithMongoRequest<T>(callback: () => T): T {
  return storage.run({}, callback);
}

export function mongoRequestState(): MongoRequestState | undefined {
  return storage.getStore();
}

/** Close the request-local MongoDB pool after the response body is consumed. */
export async function closeMongoRequest(state = storage.getStore()): Promise<void> {
  if (!state?.clientPromise) return;
  if (!state.closePromise) {
    state.closePromise = state.clientPromise
      .then((client) => client.close(true))
      .catch((error: unknown) => {
        console.error("[mongo] Не удалось закрыть соединение запроса:", error instanceof Error ? error.message : error);
      });
  }
  await state.closePromise;
}
