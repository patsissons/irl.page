import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { blocky } from "@shared/avatar";
import { Avatar, AvatarStack } from "./avatar";

describe("Avatar", () => {
  it("shows an emoji avatar", () => {
    render(
      <Avatar
        user={{ id: "user-1", avatar: { kind: "emoji", value: "🦊" } }}
      />,
    );
    expect(screen.getByRole("img")).toHaveTextContent("🦊");
  });

  it("draws the blocky pattern from the id", () => {
    const { container } = render(
      <Avatar user={{ id: "user-1", avatar: { kind: "blocky", value: "" } }} />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "data-avatar-kind",
      "blocky",
    );
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(1);
  });

  it("falls back to the blocky when a picture fails to load", () => {
    const { container } = render(
      <Avatar
        user={{
          id: "user-1",
          avatar: { kind: "url", value: "https://x.test/a.png" },
        }}
      />,
    );
    const picture = container.querySelector("img")!;
    expect(picture).toHaveAttribute("src", "https://x.test/a.png");
    expect(picture).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.error(picture);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sits on white, or the background picked", () => {
    render(
      <Avatar
        user={{ id: "user-1", avatar: { kind: "emoji", value: "🦊" } }}
      />,
    );
    expect(screen.getByRole("img")).toHaveStyle({ backgroundColor: "#ffffff" });
    render(
      <Avatar
        user={{
          id: "user-2",
          avatar: { kind: "emoji", value: "🦊", background: "#123456" },
        }}
      />,
    );
    expect(screen.getAllByRole("img")[1]).toHaveStyle({
      backgroundColor: "#123456",
    });
  });

  it("defaults the blocky to its own tint, and pictures to white", () => {
    render(
      <Avatar user={{ id: "user-1", avatar: { kind: "blocky", value: "" } }} />,
    );
    expect(screen.getByRole("img")).toHaveStyle({
      backgroundColor: blocky("user-1").background,
    });
    render(
      <Avatar
        user={{
          id: "user-2",
          avatar: { kind: "url", value: "https://x.test/a.png" },
        }}
      />,
    );
    expect(screen.getAllByRole("img")[1]).toHaveStyle({
      backgroundColor: "#ffffff",
    });
  });

  it("shows a picture that isn't there yet as the blocky", () => {
    const { container } = render(
      <Avatar user={{ id: "user-1", avatar: { kind: "url", value: "" } }} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("img")).toHaveAttribute("data-avatar-kind", "url");
  });

  it("puts the blocky pattern on the background picked", () => {
    const { container } = render(
      <Avatar
        user={{
          id: "user-1",
          avatar: { kind: "blocky", value: "", background: "#123456" },
        }}
      />,
    );
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#123456");
  });

  it("stacks avatars and counts the overflow", () => {
    const users = Array.from({ length: 5 }, (_, index) => ({
      id: `user-${index}`,
      avatar: { kind: "blocky" as const, value: "" },
    }));
    render(<AvatarStack users={users} max={3} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
