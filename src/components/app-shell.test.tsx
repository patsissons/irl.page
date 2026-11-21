import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Avatar, Me } from "@shared/types";
import { NO_AUTH, SessionContext } from "@/lib/session";
import { AppShell } from "./app-shell";

const ME: Me = {
  id: "user-1",
  avatar: { kind: "emoji", value: "🦊", background: "#112233" },
  onboarded: true,
  oauthPicture: null,
  avatarLink: null,
  gravatar: false,
};

function shell(preview: Avatar | null) {
  render(
    <SessionContext.Provider
      value={{
        loading: false,
        user: ME,
        auth: NO_AUTH,
        demo: false,
        refresh: async () => {},
        preview,
        setPreview: () => {},
      }}
    >
      <MemoryRouter>
        <AppShell>page</AppShell>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
  return screen.getByRole("link", { name: "Your profile" });
}

describe("AppShell", () => {
  it("shows the saved avatar", () => {
    const avatar = shell(null);
    expect(avatar).toHaveTextContent("🦊");
    expect(avatar.firstElementChild).toHaveStyle({
      backgroundColor: "#112233",
    });
  });

  it("shows an unsaved avatar from the profile page instead", () => {
    const avatar = shell({
      kind: "emoji",
      value: "🐼",
      background: "#a855f7",
    });
    expect(avatar).toHaveTextContent("🐼");
    expect(avatar.firstElementChild).toHaveStyle({
      backgroundColor: "#a855f7",
    });
  });
});
