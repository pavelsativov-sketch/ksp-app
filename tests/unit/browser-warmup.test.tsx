// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/three/three-stage", () => ({ ThreeStage: () => null }));

import { AppShell } from "@/components/app/app-shell";

const fetchMock = vi.fn((..._args: unknown[]) => Promise.resolve(new Response("{}")));

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const warmups = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/health/browser-keepalive")).length;

describe("cabinet shell warms the cloud browser", () => {
  it("pings the keepalive once when the cabinet opens and not again within ten minutes", () => {
    const props = { userName: "Тест Учитель", userEmail: "teacher@example.com", account: null, children: <p>page</p> };
    render(<AppShell {...props} />);
    expect(warmups()).toBe(1);
    cleanup();
    render(<AppShell {...props} />);
    expect(warmups()).toBe(1);
  });
});
