import { AsyncLocalStorage } from "node:async_hooks";
import type { MongoClient } from "mongodb";

interface MongoRequestState {
  clientPromise?: Promise<MongoClient>;
  cleanupScheduled: boolean;
}

const storage = new AsyncLocalStorage<MongoRequestState>();

/** OpenNext calls this once for each inbound Worker request. */
export function runWithMongoRequest<T>(callback: () => T): T {
  return storage.run({ cleanupScheduled: false }, callback);
}

export function mongoRequestState(): MongoRequestState | undefined {
  return storage.getStore();
}
