import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/theme";
import { ThemeToggle } from "@/features/app/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    // ThemeProvider resolves the system theme via matchMedia; jsdom lacks it.
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    );
  });

  it("cycles light → dark → system and persists the choice", async () => {
    const user = userEvent.setup();
    localStorage.setItem("teambrewer-theme", "light");

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Light");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("Switch to Dark"));

    await user.click(button);
    expect(button).toHaveTextContent("Dark");
    expect(localStorage.getItem("teambrewer-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(button);
    expect(button).toHaveTextContent("System");
    expect(localStorage.getItem("teambrewer-theme")).toBe("system");
  });
});
