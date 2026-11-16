import { describe, expect, it } from "vitest";
import { matchRecipe, runRecipe } from "@/lib/agents/recipes";

describe("matchRecipe", () => {
  it("turns a language request into navigate, open the switcher, pick the language", () => {
    const recipe = matchRecipe("Открой BilimClass и переключи язык интерфейса на русский")!;
    expect(recipe.steps[0]).toEqual({ navigate: "https://www.bilimclass.kz/2026/schedule" });
    expect(recipe.steps.at(-2)).toEqual({ clickAny: ["Қазақша", "English", "Русский"] });
    expect(recipe.steps.at(-1)).toEqual({ clickAny: ["Русский"] });
    expect(matchRecipe("в билимкласс поставь қазақ тілі")?.summary).toContain("Қазақша");
  });

  it("opens a known section directly", () => {
    expect(matchRecipe("Открой журнал в BilimClass")?.steps[0]).toEqual({ navigate: "https://www.bilimclass.kz/2026/control/journal/groups" });
    expect(matchRecipe("зайди в чат bilimclass")?.steps[0]).toEqual({ navigate: "https://www.bilimclass.kz/2026/control/chat" });
  });

  it("leaves multi-step, unknown and non-BilimClass requests to the model", () => {
    expect(matchRecipe("Открой журнал в BilimClass и поставь оценку Алие")).toBeNull();
    expect(matchRecipe("Открой журнал")).toBeNull();
    expect(matchRecipe("Смени язык в BilimClass")).toBeNull();
    expect(matchRecipe("Переведи тему урока в BilimClass на казахский язык")).toBeNull();
    expect(matchRecipe("Составь в BilimClass отчёт по успеваемости")).toBeNull();
  });
});

describe("runRecipe", () => {
  const recipe = matchRecipe("переключи язык BilimClass на русский")!;
  const TOUR = ["Өткізіп жіберу", "Пропустить", "Skip"];
  const sameList = (args: Record<string, unknown>, list: string[]) => JSON.stringify(args.texts) === JSON.stringify(list);

  it("sends each group of labels as one browser call: tour, switcher, target", async () => {
    const calls: unknown[] = [];
    const ok = await runRecipe(recipe, async (name, args) => {
      calls.push(args.texts ?? args.url);
      return { success: !sameList(args, TOUR), authBarrier: { kind: null } }; // тура на экране нет
    });
    expect(ok).toBe(true);
    expect(calls.slice(1)).toEqual([TOUR, ["Қазақша", "English", "Русский"], ["Русский"]]);
  });

  it("hands over to the model when the page asks to sign in or the switcher is missing", async () => {
    expect(await runRecipe(recipe, async () => ({ success: true, authBarrier: { kind: "login" } }))).toBe(false);
    expect(await runRecipe(recipe, async (name) => ({ success: name !== "browserClickText" }))).toBe(false);
  });

  it("retries a required click while the page is still drawing its header", async () => {
    let attempts = 0;
    const ok = await runRecipe(recipe, async (name, args) => {
      if (name !== "browserClickText") return { success: true };
      if (sameList(args, TOUR)) return { success: false };
      return { success: ++attempts > 1 };
    });
    expect(ok).toBe(true);
  });
});
