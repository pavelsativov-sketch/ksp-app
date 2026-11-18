// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminShell } from "@/components/admin/admin-shell";
import type { AdminControlCenterExtras } from "@/lib/admin/control-center";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin",
}));

afterEach(() => {
  cleanup();
});

const sampleExtras: AdminControlCenterExtras = {
  envStatuses: [
    {
      key: "MERCURY_API_KEY",
      name: "Inception Mercury 3",
      group: "text_ai",
      configured: true,
      hint: "Основной генератор КСП",
    },
    {
      key: "PRESENTON_API_KEY",
      name: "Presenton Cloud v3 (.pptx)",
      group: "media_ai",
      configured: true,
      hint: "Дизайнерские презентации",
    },
    {
      key: "RESEND_API_KEY",
      name: "Resend (Почтовый шлюз)",
      group: "infra",
      configured: false,
      hint: "Запросы приходят в админку",
    },
  ],
  providerHealth: [
    {
      provider: "Inception Mercury 3",
      model: "mercury-3",
      calls: 42,
      okCount: 41,
      failCount: 1,
      successRate: 98,
      avgDurationMs: 2400,
      lastError: null,
      lastSeenAt: "2026-11-18T03:00:00.000Z",
    },
  ],
  schools: [
    {
      id: "s1",
      name: "Гимназия №15",
      code: "GYM15",
      city: "Алматы",
      region: "Алматы",
      academicYear: "2026-2027",
      membersCount: 12,
      studentsCount: 340,
      createdAt: "2026-11-10T00:00:00.000Z",
    },
  ],
  recentPlans: [
    {
      id: "66f000000000000000000001",
      title: "Квадратные уравнения",
      grade: 8,
      language: "ru",
      visibility: "public",
      hidden: false,
      ownerId: "u1",
      ownerEmail: "teacher@school.kz",
      ownerName: "Алия Сериковна",
      likesCount: 5,
      viewsCount: 28,
      createdAt: "2026-11-18T02:00:00.000Z",
    },
  ],
  auditRows: [
    {
      id: "a1",
      action: "grant_pro",
      adminId: "adm1",
      adminEmail: "admin@mekty.kz",
      targetUserId: "u1",
      targetEmail: "teacher@school.kz",
      summary: "teacher@school.kz · тариф pro_1m",
      at: "2026-11-18T02:30:00.000Z",
    },
  ],
  counts: {
    totalPlans: 120,
    publicPlans: 45,
    sorSochCount: 18,
    schoolDocsCount: 9,
    journalStudentsCount: 230,
    assignmentsCount: 34,
  },
  siteAnalytics: {
    pageViews30d: 1850,
    exports30d: 94,
    returningUsers30d: 16,
    topPages: [{ path: "/plans/new", views: 410 }],
  },
  userEmailMap: {
    u1: { email: "teacher@school.kz", name: "Алия Сериковна" },
  },
};

describe("AdminShell 7-tab control center", () => {
  it("switches smoothly across all 7 admin sections and renders live data", () => {
    render(
      <AdminShell
        initialTab="overview"
        data={{
          query: { q: "", page: 1, codePage: 1, status: "all" },
          pages: 1,
          codePages: 1,
          matchedUsers: 2,
          totalCodes: 1,
          stats: {
            totalUsers: 25,
            proUsers: 5,
            freeUsers: 20,
            month: "2026-11",
            generations: 80,
            images: 30,
            requests: 200,
            errors: 4,
            tokens: 150000,
            avgDuration: 2100,
            activeCodes: 3,
            redeemedCodes: 2,
            revokedCodes: 0,
          },
          users: [
            {
              id: "u1",
              email: "teacher@school.kz",
              name: "Алия Сериковна",
              createdAt: "2026-11-01T00:00:00.000Z",
              plan: "pro",
              expiresAt: "2026-12-01T00:00:00.000Z",
              generations: 12,
              images: 4,
            },
            {
              id: "u2",
              email: "free@school.kz",
              name: "Марат К.",
              createdAt: "2026-11-12T00:00:00.000Z",
              plan: "free",
              expiresAt: null,
              generations: 2,
              images: 0,
            },
          ],
          codes: [
            {
              id: "c1",
              type: "pro_1m",
              status: "redeemed",
              createdAt: "2026-11-01T00:00:00.000Z",
              createdBy: "adm1",
              redeemedAt: "2026-11-02T00:00:00.000Z",
              redeemedBy: "u1",
              revokedAt: null,
              revokedBy: null,
            },
          ],
        }}
        overview={{
          totalUsers: 25,
          newUsers7: 4,
          newUsers30: 15,
          activeUsers7: 11,
          plans7: 30,
          plans30: 120,
          generations7: 25,
          generations30: 80,
          failures7: 1,
          failures30: 4,
          tiers: { pro: 5, free: 20 },
          daily: [{ day: "2026-11-18", users: 2, plans: 6, generations: 5 }],
        }}
        feedbackRows={[
          {
            id: "fb1",
            userId: "u2",
            userEmail: "free@school.kz",
            contactName: "Марат",
            contactInfo: "+77771234567",
            rating: 5,
            comment: "Хочу оплатить Pro через Kaspi",
            category: "purchase_pro",
            status: "new",
            createdAt: "2026-11-18T03:10:00.000Z",
          },
        ]}
        queue={[]}
        hiddenPlans={[]}
        extras={sampleExtras}
      />,
    );

    // 1. Overview shows attention banner for 1 new purchase lead
    expect(screen.getByText(/Требуют внимания/i)).toBeTruthy();

    // 2. Switch to Inbox
    fireEvent.click(screen.getByRole("button", { name: /Заявки и поддержка/i }));
    expect(screen.getByText(/Хочу оплатить Pro через Kaspi/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Код Pro/i })).toBeTruthy();

    // 3. Switch to Users and filter Only Pro
    fireEvent.click(screen.getByRole("button", { name: /Пользователи/i }));
    expect(screen.getByText("free@school.kz")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Только Pro" }));
    expect(screen.queryByText("free@school.kz")).toBeNull();
    expect(screen.getByText("teacher@school.kz")).toBeTruthy();

    // 4. Switch to AI & System
    fireEvent.click(screen.getByRole("button", { name: /ИИ и система/i }));
    expect(screen.getByText("Presenton Cloud v3 (.pptx)")).toBeTruthy();
    expect(screen.getByText("mercury-3")).toBeTruthy();

    // 5. Switch to Content & Schools
    fireEvent.click(screen.getByRole("button", { name: /Уроки и школы/i }));
    expect(screen.getByText("Квадратные уравнения")).toBeTruthy();
    expect(screen.getByText("Гимназия №15")).toBeTruthy();

    // 6. Switch to Billing (check human-readable redeemer email)
    fireEvent.click(screen.getByRole("button", { name: /Промокоды и Pro/i }));
    expect(screen.getByText(/Алия Сериковна \(teacher@school\.kz\)/)).toBeTruthy();

    // 7. Switch to Audit
    fireEvent.click(screen.getByRole("button", { name: /Аудит и трафик/i }));
    expect(screen.getByText("Выдача Pro")).toBeTruthy();
  });
});
