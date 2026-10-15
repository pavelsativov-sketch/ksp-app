import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runExecutor } from '@/lib/agents/computer/execute';

describe('runExecutor client', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('returns error when not configured', async () => {
    const origUrl = process.env.EXECUTOR_URL;
    const origSecret = process.env.EXECUTOR_AUTH_SECRET;
    delete process.env.EXECUTOR_URL;
    delete process.env.EXECUTOR_AUTH_SECRET;
    const res = await runExecutor('u', 'echo', ['hi']);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/i);
    process.env.EXECUTOR_URL = origUrl;
    process.env.EXECUTOR_AUTH_SECRET = origSecret;
  });

  it('posts signed request and parses response', async () => {
    process.env.EXECUTOR_URL = 'http://localhost:4000';
    process.env.EXECUTOR_AUTH_SECRET = 'shhhh';
    global.fetch = vi.fn(async (url, opts) => {
      return {
        ok: true,
        json: async () => ({ ok: true, stdout: 'hello', stderr: '', code: 0 }),
      } as any;
    }) as any;

    const res = await runExecutor('u', 'echo', ['hello']);
    expect(res.ok).toBe(true);
    expect(res.stdout).toBe('hello');
    expect(res.code).toBe(0);
  });

  it('handles non-ok HTTP response', async () => {
    process.env.EXECUTOR_URL = 'http://localhost:4000';
    process.env.EXECUTOR_AUTH_SECRET = 'shhhh';
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'bad' }) } as any)) as any;
    const res = await runExecutor('u', 'ls');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/bad/i);
  });
});
