import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuthOptions } from "@shared/types";
import { SessionContext } from "@/lib/session";
import { SignIn } from "./sign-in";

function show(auth: AuthOptions) {
  return render(
    <SessionContext.Provider
      value={{ loading: false, user: null, auth, refresh: async () => {} }}
    >
      <SignIn next="/ticket/asdf1234" />
    </SessionContext.Provider>,
  );
}

describe("SignIn", () => {
  it("links each configured provider, carrying where to return to", () => {
    show({ google: true, github: true, dev: false });
    expect(
      screen.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      "/api/auth/google/login?next=%2Fticket%2Fasdf1234",
    );
    expect(
      screen.getByRole("link", { name: "Continue with GitHub" }),
    ).toHaveAttribute(
      "href",
      "/api/auth/github/login?next=%2Fticket%2Fasdf1234",
    );
    expect(screen.queryByText("Local development")).toBeNull();
  });

  it("hides providers that aren't configured", () => {
    show({ google: false, github: true, dev: false });
    expect(
      screen.queryByRole("link", { name: "Continue with Google" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Continue with GitHub" }),
    ).toBeInTheDocument();
  });

  it("says so when no sign-in is set up", () => {
    show({ google: false, github: false, dev: false });
    expect(screen.getByText(/isn't set up/)).toBeInTheDocument();
  });
});
