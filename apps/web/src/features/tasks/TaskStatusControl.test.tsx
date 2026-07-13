import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskStatusControl } from "./TaskStatusControl";

afterEach(() => vi.restoreAllMocks());

describe("TaskStatusControl", () => {
  it("offers only the transitions the lifecycle permits", () => {
    render(<TaskStatusControl status="proposed" onChange={() => {}} />);
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
      .filter((label) => label !== "Change status…");
    expect(options).toEqual(["Assigned", "Abandoned"]);
  });

  it("changes a non-finishing status immediately (no report prompt)", async () => {
    const onChange = vi.fn();
    render(<TaskStatusControl status="proposed" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Change status"), "assigned");
    expect(onChange).toHaveBeenCalledWith("assigned");
    expect(screen.queryByText(/required to finish/)).not.toBeInTheDocument();
  });

  it("requires a report before finishing", async () => {
    const onChange = vi.fn();
    render(<TaskStatusControl status="assigned" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Change status"), "finished");
    // The report prompt appears; confirming is blocked until a report is typed.
    const confirm = screen.getByRole("button", { name: "Finish task" });
    expect(confirm).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/required to finish/), "Went 8-2.");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onChange).toHaveBeenCalledWith("finished", "Went 8-2.");
  });

  it("disables the control for a terminal status", () => {
    render(<TaskStatusControl status="finished" onChange={() => {}} />);
    expect(screen.getByLabelText("Change status")).toBeDisabled();
  });
});
