import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardPreview } from "./CardPreview";

// jsdom reports a zeroed rect for every element; stub the trigger's rect so the
// flip/clamp math has a realistic position to react to. jsdom's viewport is 768px tall.
function stubTriggerRect(button: HTMLElement, top: number, height = 16): void {
  const bottom = top + height;
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    x: 20,
    y: top,
    left: 20,
    right: 120,
    top,
    bottom,
    width: 100,
    height,
    toJSON: () => ({}),
  } as DOMRect);
}

const card = {
  id: "cnc",
  name: "Command and Conquer",
  pitch: 1,
  imageUrl: "https://cards.test/cnc.webp",
};

describe("CardPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the image until interacted with", () => {
    render(<CardPreview card={card} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("reveals the card image on press (click)", async () => {
    const user = userEvent.setup();
    render(<CardPreview card={card} />);

    await user.click(screen.getByRole("button", { name: "Command and Conquer" }));

    const image = await screen.findByRole("img", { name: "Command and Conquer" });
    expect(image).toHaveAttribute("src", card.imageUrl);
    expect(screen.getByText(/pitch 1 \(Red\)/i)).toBeInTheDocument();
  });

  it("reveals the card image on hover", async () => {
    const user = userEvent.setup();
    render(<CardPreview card={card} />);

    await user.hover(screen.getByRole("button", { name: "Command and Conquer" }));

    expect(await screen.findByRole("img", { name: "Command and Conquer" })).toBeInTheDocument();
  });

  it("renders the preview through a portal so an overflow-clipped ancestor cannot hide it", async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="clip" style={{ overflow: "hidden" }}>
        <CardPreview card={card} />
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Command and Conquer" }));

    const preview = await screen.findByRole("dialog", { name: "Command and Conquer preview" });
    // The preview must live outside the clipping container (portaled to the body),
    // otherwise the ancestor's overflow:hidden would clip it.
    expect(screen.getByTestId("clip")).not.toContainElement(preview);
    expect(document.body).toContainElement(preview);
  });

  it("flips the preview above the trigger when there is no room below", async () => {
    const user = userEvent.setup();
    render(<CardPreview card={card} />);
    const trigger = screen.getByRole("button", { name: "Command and Conquer" });
    stubTriggerRect(trigger, 740); // near the bottom of the 768px-tall viewport

    await user.hover(trigger);

    const preview = await screen.findByRole("dialog", { name: "Command and Conquer preview" });
    // Flipping up anchors the panel's bottom to the trigger via a translateY(-100%).
    expect(preview.style.transform).toBe("translateY(-100%)");
  });

  it("opens the preview below the trigger when there is room", async () => {
    const user = userEvent.setup();
    render(<CardPreview card={card} />);
    const trigger = screen.getByRole("button", { name: "Command and Conquer" });
    stubTriggerRect(trigger, 100); // plenty of room below

    await user.hover(trigger);

    const preview = await screen.findByRole("dialog", { name: "Command and Conquer preview" });
    expect(preview.style.transform).toBe("");
  });

  it("hides the preview when the pointer leaves the trigger", async () => {
    const user = userEvent.setup();
    render(<CardPreview card={card} />);
    const trigger = screen.getByRole("button", { name: "Command and Conquer" });

    await user.hover(trigger);
    expect(await screen.findByRole("img")).toBeInTheDocument();

    await user.unhover(trigger);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
