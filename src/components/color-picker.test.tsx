import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AVATAR_SWATCHES } from "@shared/avatar";
import ColorPicker from "./color-picker";

const hex = () => screen.getByLabelText("Background colour hex");
const type = (text: string) =>
  fireEvent.change(hex(), { target: { value: text } });

/** The picker with its value held, as the profile page holds it. */
function Held({
  initial,
  spy,
}: {
  initial?: string;
  spy: (color: string | undefined) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ColorPicker
      value={value}
      onChange={(color) => {
        spy(color);
        setValue(color);
      }}
    />
  );
}

describe("ColorPicker", () => {
  it("offers every swatch and marks the current one", () => {
    render(<ColorPicker value="#3b82f6" onChange={() => {}} />);
    const grid = screen.getByRole("group", { name: "Quick colours" });
    expect(within(grid).getAllByRole("button")).toHaveLength(
      AVATAR_SWATCHES.length,
    );
    expect(screen.getByRole("button", { name: "#3b82f6" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "#ffffff" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(hex()).toHaveValue("#3b82f6");
  });

  it("picks a swatch and shows its hex", () => {
    const spy = vi.fn();
    render(<Held spy={spy} />);
    expect(hex()).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "#a855f7" }));
    expect(spy).toHaveBeenLastCalledWith("#a855f7");
    expect(hex()).toHaveValue("#a855f7");
  });

  it("takes a typed colour once it is one, without rewriting the text", () => {
    const spy = vi.fn();
    render(<Held spy={spy} />);
    type("#0a");
    expect(spy).not.toHaveBeenCalled();
    type("#0af");
    expect(spy).toHaveBeenLastCalledWith("#00aaff");
    expect(hex()).toHaveValue("#0af");
    type("#0afe12");
    expect(spy).toHaveBeenLastCalledWith("#0afe12");
    expect(hex()).toHaveAttribute("aria-invalid", "false");
  });

  it("flags text that isn't a colour and reverts it on blur", () => {
    const spy = vi.fn();
    render(<Held initial="#112233" spy={spy} />);
    type("#zz");
    expect(spy).not.toHaveBeenCalled();
    expect(hex()).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(hex());
    expect(hex()).toHaveValue("#112233");
  });

  it("goes back to the default", () => {
    const spy = vi.fn();
    render(<Held initial="#112233" spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(hex()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Default" })).toBeDisabled();

    type("#123");
    type("");
    expect(spy).toHaveBeenLastCalledWith(undefined);
  });

  it("moves the square with the colour", () => {
    render(<Held initial="#ff0000" spy={() => {}} />);
    expect(screen.getByRole("slider", { name: "Hue" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    fireEvent.click(screen.getByRole("button", { name: "#3b82f6" }));
    expect(
      Number(
        screen
          .getByRole("slider", { name: "Hue" })
          .getAttribute("aria-valuenow"),
      ),
    ).toBeGreaterThan(200);
  });
});
