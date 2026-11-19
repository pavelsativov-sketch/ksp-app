// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deckSlideSchema, slideKindLabel } from "@/lib/materials/deck-types";
import {
  buildTelegramUrl,
  buildWhatsAppUrl,
  homeworkShareMessage,
  parentReportMessage,
  quizShareMessage,
} from "@/lib/share/messengers";
import { ShareQrActions } from "@/components/share/share-toolbar";
import {
  GOSO_SUBJECT_KZ,
  localizeSectionKz,
  resolveRussianSubjectName,
  subjectNameKz,
} from "@/lib/goso/kazakh";
import { matchObjectives, resolveGosoSubject } from "@/lib/goso/match";
import { escapeHtml, renderMektyEmail } from "@/lib/mail-template";
import { notificationCopy } from "@/lib/notification-copy";

vi.mock("qrcode", () => ({
  default: {
    toString: vi.fn(async () => "<svg data-testid=\"mock-qr\"></svg>"),
    toDataURL: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo="),
  },
}));

afterEach(cleanup);

describe("Wave 1: DeckBuilder live images & Kazakh labels", () => {
  it("accepts valid imageDataUri and rejects non-image data URIs", () => {
    const valid = deckSlideSchema.safeParse({
      id: "s1",
      kind: "list",
      title: "Фотосинтез",
      points: ["Свет", "Вода", "Кислород"],
      imageDataUri: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(valid.success).toBe(true);

    const invalid = deckSlideSchema.safeParse({
      id: "s2",
      kind: "list",
      title: "Bad",
      imageDataUri: "javascript:alert(1)",
    });
    expect(invalid.success).toBe(false);
  });

  it("localizes slide kind labels into Kazakh", () => {
    expect(slideKindLabel("title", "ru")).toBe("Титульный");
    expect(slideKindLabel("title", "kk")).toBe("Титулдық слайд");
    expect(slideKindLabel("quiz", "kk")).toBe("Жауабы басу арқылы ашылатын тест");
  });
});

describe("Wave 2: QR & WhatsApp/Telegram share", () => {
  it("builds valid WhatsApp and Telegram share links and RU/KK messages", () => {
    const url = "https://ksp-app-pi.vercel.app/a/ABC123";
    const hwRu = homeworkShareMessage({ title: "Дроби", url, code: "ABC123", daysValid: 7, locale: "ru" });
    expect(hwRu).toContain("ABC123");
    expect(hwRu).toContain(url);

    const hwKk = homeworkShareMessage({ title: "Бөлшектер", url, code: "ABC123", daysValid: 7, locale: "kk" });
    expect(hwKk).toContain("Үй тапсырмасы");
    expect(hwKk).toContain("ABC123");

    const quiz = quizShareMessage({ title: "Квиз", url: "https://ksp-app-pi.vercel.app/quiz/join?code=9999", code: "9999", locale: "kk" });
    expect(quiz).toContain("9999");

    const report = parentReportMessage({
      studentName: "Алимов Санжар",
      totalAssignments: 5,
      average: 88,
      best: 100,
      worst: 70,
      recentTitles: ["Дроби"],
      locale: "kk",
    });
    expect(report).toContain("Алимов Санжар");
    expect(report).toContain("88%");

    expect(buildWhatsAppUrl("Привет")).toBe("https://wa.me/?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82");
    expect(buildTelegramUrl(url, "ДЗ")).toContain("https://t.me/share/url?url=");
  });

  it("renders ShareQrActions links and toggles fullscreen board QR modal", () => {
    render(
      <ShareQrActions
        url="https://ksp-app-pi.vercel.app/a/XYZ777"
        title="Домашнее задание по физике"
        code="XYZ777"
        locale="ru"
      />,
    );

    const wa = screen.getByRole("link", { name: /WhatsApp/i });
    const tg = screen.getByRole("link", { name: /Telegram/i });
    expect(wa.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(tg.getAttribute("href")).toContain("https://t.me/share/url?url=");

    fireEvent.click(screen.getByRole("button", { name: /QR на доску/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-os-fullscreen")).toBe("true");
    expect(dialog.textContent).toContain("XYZ777");

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Wave 3: Kazakh GOSO mapping & subject resolution", () => {
  it("maps all 24 official GOSO subjects symmetrically", () => {
    expect(Object.keys(GOSO_SUBJECT_KZ)).toHaveLength(24);
    expect(resolveRussianSubjectName("Қазақстан тарихы")).toBe("История Казахстана");
    expect(resolveRussianSubjectName("Жаратылыстану")).toBe("Естествознание");
    expect(resolveRussianSubjectName("Құқық негіздері")).toBe("Основы права");
    expect(subjectNameKz("История Казахстана")).toBe("Қазақстан тарихы");
    expect(localizeSectionKz("Типовая учебная программа")).toBe("Типтік оқу бағдарламасы");
  });

  it("resolves Kazakh subject names in GOSO matcher", () => {
    expect(resolveGosoSubject("Қазақстан тарихы")).toBe("История Казахстана");
    expect(resolveGosoSubject("Информатика")).toBe("Информатика");
    const matched = matchObjectives({ subject: "Математика", grade: 5, topic: "обыкновенные дроби" });
    expect(Array.isArray(matched)).toBe(true);
  });
});

describe("Wave 4: Production Mail & Notifications", () => {
  it("renders branded HTML email safely with HTML escaping", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    const html = renderMektyEmail({
      title: "Заявка <Pro>",
      lines: ["Учитель: <b>Айгуль</b>"],
      ctaLabel: "Открыть",
      ctaUrl: "https://ksp-app-pi.vercel.app/admin?tab=inbox",
    });
    expect(html).toContain("Заявка &lt;Pro&gt;");
    expect(html).toContain("&lt;b&gt;Айгуль&lt;/b&gt;");
    expect(html).toContain("https://ksp-app-pi.vercel.app/admin?tab=inbox");

    const blockedCta = renderMektyEmail({
      title: "XSS check",
      ctaLabel: "Click",
      ctaUrl: "javascript:alert(1)",
    });
    expect(blockedCta).not.toContain("javascript:");
  });

  it("provides RU and KK notification copy for all admin and billing events", () => {
    for (const kind of [
      "admin_lead_pro",
      "admin_lead_school",
      "admin_password_reset",
      "admin_feedback",
      "plan_activated",
      "school_invite",
    ] as const) {
      expect(notificationCopy.ru.kinds[kind]).toBeTruthy();
      expect(notificationCopy.kk.kinds[kind]).toBeTruthy();
    }
  });
});
