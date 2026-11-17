import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmojiPicker from "./emoji-picker";

const list = () => screen.getByRole("group", { name: "Emoji" });
const filter = (text: string) =>
  fireEvent.change(screen.getByLabelText("Filter emoji"), {
    target: { value: text },
  });

describe("EmojiPicker", () => {
  it("lists every emoji by group", () => {
    render(<EmojiPicker value="🦊" onChange={() => {}} />);
    expect(
      within(list()).getByRole("region", { name: "Smileys & emotion" }),
    ).toBeInTheDocument();
    expect(
      within(list()).getByRole("region", { name: "Flags" }),
    ).toBeInTheDocument();
    expect(within(list()).getAllByRole("button").length).toBeGreaterThan(1800);
    expect(screen.getByRole("button", { name: "fox" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("filters by name and by keyword, every word counting", () => {
    render(<EmojiPicker value="🦊" onChange={() => {}} />);
    filter("pepperoni");
    expect(within(list()).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "pizza" })).toHaveTextContent(
      "🍕",
    );

    filter("lol");
    expect(
      screen.getByRole("button", { name: "face with tears of joy" }),
    ).toBeInTheDocument();

    filter("red heart");
    expect(screen.getByRole("button", { name: "red heart" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "blue heart" })).toBeNull();

    filter("zzqx");
    expect(within(list()).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/No emoji match/)).toHaveTextContent("zzqx");
  });

  it("picks an emoji, and shows and re-tones it in the chosen skin tone", () => {
    const onChange = vi.fn();
    const { rerender } = render(<EmojiPicker value="🦊" onChange={onChange} />);
    filter("waving hand");
    fireEvent.click(screen.getByRole("button", { name: "waving hand" }));
    expect(onChange).toHaveBeenLastCalledWith("👋");

    rerender(<EmojiPicker value="👋" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Medium skin tone" }));
    // The chosen emoji follows the tone, and the list shows toned forms.
    expect(onChange).toHaveBeenLastCalledWith("👋🏽");
    expect(
      screen.getByRole("button", { name: "waving hand" }),
    ).toHaveTextContent("👋🏽");
  });

  it("starts on the tone of a toned emoji, and leaves untoned ones alone", () => {
    const onChange = vi.fn();
    render(<EmojiPicker value="👍🏿" onChange={onChange} />);
    expect(
      screen.getByRole("radio", { name: "Dark skin tone" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "thumbs up" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    filter("pizza");
    fireEvent.click(screen.getByRole("radio", { name: "Light skin tone" }));
    // The thumbs up follows; a pizza has no tones to change.
    expect(onChange).toHaveBeenLastCalledWith("👍🏻");
    expect(screen.getByRole("button", { name: "pizza" })).toHaveTextContent(
      "🍕",
    );
  });
});
