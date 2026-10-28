// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RuntimeModeBadge } from "@/components/agents/runtime-mode-badge";

it("всегда показывает облако Vercel: режима «ваш ПК» больше нет", () => {
  render(<RuntimeModeBadge mode="vercel" />);
  expect(screen.getByLabelText("Режим: облако Vercel").textContent).toContain("Режим: облако Vercel");
  expect(screen.queryByLabelText("Режим: ваш ПК")).toBeNull();
});
