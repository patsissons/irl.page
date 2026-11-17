import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Privacy } from "./privacy";

describe("Privacy", () => {
  it("says the email is never stored and names the Google scopes", () => {
    render(<Privacy />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/the email is not/)).toBeInTheDocument();
    for (const scope of ["openid", "email", "profile"]) {
      expect(screen.getByText(scope, { selector: "code" })).toBeInTheDocument();
    }
  });

  it("links Google's user data policy and a way to get in touch", () => {
    render(<Privacy />);
    expect(
      screen.getByRole("link", {
        name: "Google API Services User Data Policy",
      }),
    ).toHaveAttribute(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy",
    );
    expect(
      screen.getByRole("link", { name: "open an issue on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/patsissons/irl.page/issues");
  });
});
