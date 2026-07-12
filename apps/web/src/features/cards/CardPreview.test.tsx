import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CardPreview } from "./CardPreview";

const card = {
  id: "cnc",
  name: "Command and Conquer",
  pitch: 1,
  imageUrl: "https://cards.test/cnc.webp",
};

describe("CardPreview", () => {
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
});
