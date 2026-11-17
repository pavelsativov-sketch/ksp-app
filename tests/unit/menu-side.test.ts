import { describe, expect, it } from "vitest";
import { menuSide } from "@/lib/ui/menu-side";

const button = (right: number) => ({ getBoundingClientRect: () => ({ right }) as DOMRect });

describe("menuSide", () => {
  it("opens to the right of a button in the left column so the menu stays on screen", () => {
    expect(menuSide(button(200))).toBe("left-0");
  });

  it("keeps the usual right-aligned menu when there is room on the left", () => {
    expect(menuSide(button(700))).toBe("right-0");
    expect(menuSide(button(300), 280)).toBe("right-0");
  });
});
