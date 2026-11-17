// @vitest-environment node
import { describe, expect, it } from "vitest";
import { safeNext } from "./http";
import {
  cookieHeader,
  openSession,
  parseCookies,
  sealSession,
} from "./session";

describe("session cookie", () => {
  it("round-trips a sealed payload", async () => {
    const sealed = await sealSession("secret", {
      uid: "u1",
      picture: "https://p/x",
    });
    expect(sealed).not.toContain("u1");
    expect(await openSession("secret", sealed)).toEqual({
      uid: "u1",
      picture: "https://p/x",
    });
  });

  it("rejects a tampered, foreign or missing cookie", async () => {
    const sealed = await sealSession("secret", { uid: "u1", picture: null });
    expect(await openSession("other", sealed)).toBeNull();
    expect(await openSession("secret", `${sealed.slice(0, -2)}AA`)).toBeNull();
    expect(await openSession("secret", undefined)).toBeNull();
    expect(await openSession("secret", "garbage")).toBeNull();
  });

  it("writes HttpOnly cookies and parses them back", () => {
    const header = cookieHeader("irl_session", "abc", {
      maxAge: 60,
      secure: true,
    });
    expect(header).toBe(
      "irl_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure",
    );
    expect(parseCookies("a=1; irl_session=abc")).toEqual({
      a: "1",
      irl_session: "abc",
    });
  });
});

describe("safeNext", () => {
  it("only allows paths on this site", () => {
    expect(safeNext("/ticket/abc?x=1")).toBe("/ticket/abc?x=1");
    for (const next of [
      null,
      "",
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "/api/auth/logout",
    ]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});
