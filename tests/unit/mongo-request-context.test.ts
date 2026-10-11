import { describe, expect, it, vi } from "vitest";
import type { MongoClient } from "mongodb";
import {
  closeMongoRequest,
  createMongoRequestState,
  mongoRequestState,
  mongoRequestStateById,
  runWithMongoRequest,
} from "@/lib/mongo-request-context";

describe("Cloudflare Mongo request lifecycle", () => {
  it("isolates client state between concurrent requests", async () => {
    const [first, second] = await Promise.all([
      runWithMongoRequest(async () => {
        await Promise.resolve();
        return mongoRequestState();
      }),
      runWithMongoRequest(async () => {
        await Promise.resolve();
        return mongoRequestState();
      }),
    ]);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("resolves a request state by the ID injected into the OpenNext request", async () => {
    const scopedState = createMongoRequestState("request-a");
    const state = await runWithMongoRequest(async () => mongoRequestState(), scopedState);
    expect(mongoRequestStateById("request-a")).toBe(state);
    await closeMongoRequest(state);
    expect(mongoRequestStateById("request-a")).toBeUndefined();
  });

  it("closes a request client only once even when cleanup is requested twice", async () => {
    const close = vi.fn(async () => {});
    const client = { close } as unknown as MongoClient;
    const state = { clientPromise: Promise.resolve(client) };

    await Promise.all([closeMongoRequest(state), closeMongoRequest(state)]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(true);
  });

  it("does not fail cleanup if the connection attempt failed", async () => {
    const state = { clientPromise: Promise.reject(new Error("connect failed")) };
    await expect(closeMongoRequest(state)).resolves.toBeUndefined();
  });
});
