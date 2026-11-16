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

  it("clicks the first label on screen, then the target", async () => {
    const calls: string[] = [];
    const ok = await runRecipe(recipe, async (name, args) => {
      calls.push(String(args.text ?? args.url));
      // Тура нет, текущий язык English.
      return { success: !["Өткізіп жіберу", "Пропустить", "Skip", "Қазақша"].includes(String(args.text)) };
    });
    expect(ok).toBe(true);
    expect(calls.slice(-3)).toEqual(["Қазақша", "English", "Русский"]);
  });

  it("hands over to the model when the page asks to sign in or the switcher is missing", async () => {
    expect(await runRecipe(recipe, async () => ({ success: true, authBarrier: { kind: "login" } }))).toBe(false);
    expect(await runRecipe(recipe, async (name) => ({ success: name === "browserNavigate" }))).toBe(false);
  });
});
