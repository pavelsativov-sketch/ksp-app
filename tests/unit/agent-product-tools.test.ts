/**
 * Инструменты продукта для агента: createKsp, createKtp, listPlans.
 *
 * Агент должен создавать настоящие материалы теми же генераторами и с той же
 * квотой, что и сайт, а результат — отдавать ссылками на страницу, Word и PowerPoint.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  reserveQuota: vi.fn(),
  finalize: vi.fn(),
  generate: vi.fn(),
  insertOne: vi.fn(),
  find: vi.fn(),
  getPlanForUser: vi.fn(),
  getPlanById: vi.fn(),
  getSubjectByName: vi.fn(),
  getSubjectById: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/billing/quota", () => ({ reserveQuota: mock.reserveQuota, getPlanForUser: mock.getPlanForUser }));
vi.mock("@/lib/ai/generate", () => ({ generateKspWithModel: mock.generate }));
vi.mock("@/lib/plans-repo", () => ({
  getPlanById: mock.getPlanById,
  getSubjectByName: mock.getSubjectByName,
  getSubjectById: mock.getSubjectById,
}));
vi.mock("@/lib/mongo", () => ({
  COL: { plans: "lesson_plans" },
  getDb: async () => ({ collection: () => ({ insertOne: mock.insertOne, find: mock.find }) }),
}));
vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: async () => ({ writeFile: mock.writeFile }),
}));

import { productTools } from "@/lib/agents/tools/product";

const USER = "a".repeat(24);
const PLAN_ID = "b".repeat(24);

const aiPayload = {
  topic: "Дроби",
  lessonObjectives: ["Сравнивает обыкновенные дроби"],
  assessmentCriteria: ["Называет числитель и знаменатель"],
  stages: {
    beginning: { time: "0–5 мин", teacherActions: "Приветствие и актуализация", studentActions: "Отвечают", resources: "Доска" },
    middle: { time: "5–35 мин", teacherActions: "Объяснение", studentActions: "Решают", resources: "Карточки" },
    end: { time: "35–40 мин", teacherActions: "Итог", studentActions: "Рефлексия", resources: "Стикеры" },
  },
  evaluation: { formativeAssessment: "Устный опрос", differentiation: "Задания трёх уровней", healthAndSafety: "Осанка", reflection: "Что удалось" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.reserveQuota.mockResolvedValue({ ok: true, reservation: { remaining: 2, finalize: mock.finalize } });
  mock.finalize.mockResolvedValue(undefined);
  mock.generate.mockResolvedValue({ payload: aiPayload, model: "test-model" });
  mock.insertOne.mockResolvedValue({ insertedId: { toString: () => PLAN_ID } });
  mock.getSubjectByName.mockResolvedValue({ id: "c".repeat(24), name_ru: "Математика", name_kz: "Математика" });
  mock.writeFile.mockResolvedValue(undefined);
});

describe("createKsp", () => {
  it("создаёт КСП: квота, генерация, сохранение в аккаунт, ссылки и копия в файлах", async () => {
    const result = await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { userId: USER, taskId: "t" });

    expect(result).toMatchObject({
      success: true,
      planId: PLAN_ID,
      url: `/plans/${PLAN_ID}`,
      docxUrl: `/api/export/docx/${PLAN_ID}`,
      pptxUrl: `/api/export/pptx/${PLAN_ID}`,
    });
    expect(mock.reserveQuota).toHaveBeenCalledWith({ id: USER }, "generation");
    expect(mock.finalize).toHaveBeenCalledWith(true);

    const saved = mock.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.owner_id).toBe(USER);
    expect(saved.visibility).toBe("private");
    expect(saved.grade).toBe(5);
    expect(saved.title).toBe("Математика: Дроби");

    expect(mock.writeFile).toHaveBeenCalledTimes(1);
    const [name, text] = mock.writeFile.mock.calls[0]!;
    expect(String(name)).toMatch(/^ksp-.+\.md$/);
    expect(String(text)).toContain("Сравнивает обыкновенные дроби");
  });

  it("не тратит генерацию, если квота исчерпана", async () => {
    mock.reserveQuota.mockResolvedValue({ ok: false, message: "Лимит бесплатных КСП исчерпан" });
    const result = await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { userId: USER, taskId: "t" });
    expect(result).toEqual({ success: false, error: "Лимит бесплатных КСП исчерпан" });
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.insertOne).not.toHaveBeenCalled();
  });

  it("при сбое провайдера возвращает слот квоты и ничего не сохраняет", async () => {
    mock.generate.mockRejectedValue(new Error("провайдер недоступен"));
    const result = await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: false });
    expect(mock.finalize).toHaveBeenCalledWith(false);
    expect(mock.insertOne).not.toHaveBeenCalled();
  });

  it("сам материал создан, даже если рабочая область недоступна", async () => {
    mock.writeFile.mockRejectedValue(new Error("нет рабочей области"));
    const result = await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: true, planId: PLAN_ID });
    expect(result).not.toHaveProperty("file");
  });

  it.each([
    [{ grade: 0, subject: "Математика", topic: "Дроби" }],
    [{ grade: 12, subject: "Математика", topic: "Дроби" }],
    [{ grade: 5, subject: "", topic: "Дроби" }],
    [{ grade: 5, subject: "Математика" }],
  ])("отклоняет некорректные параметры %j без расхода квоты", async (args) => {
    const result = await productTools.createKsp(args as Record<string, unknown>, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: false });
    expect(mock.reserveQuota).not.toHaveBeenCalled();
  });

  it("требует пользователя сессии", async () => {
    expect(await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { taskId: "t" })).toMatchObject({ success: false });
  });

  it("остановленная задача не запускает генерацию", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await productTools.createKsp({ grade: 5, subject: "Математика", topic: "Дроби" }, { userId: USER, taskId: "t", signal: controller.signal });
    expect(result).toMatchObject({ success: false });
    expect(mock.reserveQuota).not.toHaveBeenCalled();
  });
});

describe("createKtp", () => {
  const plan = {
    id: PLAN_ID,
    owner_id: USER,
    title: "Математика: Дроби",
    grade: 5,
    language: "ru",
    subject_id: "c".repeat(24),
    content: { topic: "Дроби", learningObjectives: [{ code: "5.1.1", text: "Сравнивает дроби" }] },
  };

  beforeEach(() => {
    mock.getPlanForUser.mockResolvedValue({ limits: { ktp: true } });
    mock.getPlanById.mockResolvedValue(plan);
    mock.getSubjectById.mockResolvedValue({ id: "c".repeat(24), name_ru: "Математика", name_kz: null });
  });

  it("составляет КТП по теме и пишет таблицу в рабочую область", async () => {
    const result = await productTools.createKtp(
      { planId: PLAN_ID, topics: ["Дроби · 2 ч.", "Сравнение дробей"], startDate: "2026-09-01" },
      { userId: USER, taskId: "t" },
    );
    expect(result).toMatchObject({ success: true, url: `/plans/${PLAN_ID}` });
    const rows = (result as { rows: Array<{ number: number; topic: string; hours: number }> }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ number: 1, topic: "Дроби", hours: 2 });
    const [name, text] = mock.writeFile.mock.calls[0]!;
    expect(String(name)).toMatch(/^ktp-.+\.md$/);
    expect(String(text)).toContain("| № | Тема | Часы | Дата | Цели |");
  });

  it("на бесплатном тарифе честно сообщает, что нужен Pro", async () => {
    mock.getPlanForUser.mockResolvedValue({ limits: { ktp: false } });
    const result = await productTools.createKtp({ planId: PLAN_ID }, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("Pro");
    expect(mock.getPlanById).not.toHaveBeenCalled();
  });

  it("не отдаёт чужой план", async () => {
    mock.getPlanById.mockResolvedValue({ ...plan, owner_id: "d".repeat(24) });
    const result = await productTools.createKtp({ planId: PLAN_ID }, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: false });
    expect(mock.writeFile).not.toHaveBeenCalled();
  });

  it("подсказывает про listPlans при неверном идентификаторе", async () => {
    const result = await productTools.createKtp({ planId: "не-идентификатор" }, { userId: USER, taskId: "t" });
    expect((result as { error: string }).error).toContain("listPlans");
  });

  it("отклоняет некорректную дату начала", async () => {
    const result = await productTools.createKtp({ planId: PLAN_ID, startDate: "2026-02-30" }, { userId: USER, taskId: "t" });
    expect(result).toMatchObject({ success: false });
  });
});

describe("listPlans", () => {
  it("возвращает только планы владельца", async () => {
    const toArray = vi.fn().mockResolvedValue([{ _id: { toString: () => PLAN_ID }, title: "Математика: Дроби", grade: 5, content: { topic: "Дроби" } }]);
    mock.find.mockReturnValue({ sort: () => ({ limit: () => ({ toArray }) }) });
    const result = await productTools.listPlans({}, { userId: USER, taskId: "t" });
    expect(mock.find.mock.calls[0]![0]).toMatchObject({ owner_id: USER });
    expect(result).toMatchObject({ success: true, plans: [{ planId: expect.any(String), title: "Математика: Дроби", topic: "Дроби" }] });
  });
});
