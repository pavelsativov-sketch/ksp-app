import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");
    // Header / brand text should appear somewhere on the landing page.
    await expect(page).toHaveTitle(/КСП/i);
  });

  test("quiz join page accepts code via query string", async ({ page }) => {
    await page.goto("/quiz/join?code=123456");
    await expect(page.getByRole("heading", { name: /live-?квиз/i })).toBeVisible();
    const code = page.locator('input[id="code"]');
    await expect(code).toHaveValue("123456");
  });

  test("quiz join page validates code", async ({ page }) => {
    await page.goto("/quiz/join");
    await page.fill('input[id="name"]', "Алия");
    await page.fill('input[id="code"]', "12");
    await page.getByRole("button", { name: /войти/i }).click();
    await expect(page.getByText(/6 цифр/i)).toBeVisible();
  });
});
