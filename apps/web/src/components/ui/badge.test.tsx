import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="success">Finished</Badge>);
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("applies the semantic classes for the given tone", () => {
    render(<Badge tone="danger">Loss</Badge>);
    const badge = screen.getByText("Loss");
    expect(badge.className).toContain("bg-danger");
    expect(badge.className).toContain("text-danger-foreground");
    expect(badge.className).toContain("border-danger-border");
  });

  it("defaults to the neutral tone when none is given", () => {
    render(<Badge>Draw</Badge>);
    expect(screen.getByText("Draw").className).toContain("bg-muted");
  });

  it("renders a decorative status dot when requested", () => {
    render(
      <Badge tone="warning" dot>
        Assigned
      </Badge>,
    );
    const badge = screen.getByText("Assigned");
    const dot = badge.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
  });
});
