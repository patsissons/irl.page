// @vitest-environment node
import { describe, expect, it } from "vitest";
import { safeNext } from "./http";
import {
  cookieHeader,
  fromBase64Url,
  openSession,
  parseCookies,
  sealSession,
  toBase64Url,
} from "./session";

describe("session cookie", () => {
  it("round-trips a sealed payload", async () => {
    // Long enough that random ciphertext can't contain it by chance: a
    // two-character id showed up in about one run in fifty.
    const uid = "person-record-id-0001";
    const sealed = await sealSession("secret", {
      uid,
      picture: "https://p/x",
    });
    expect(sealed).not.toContain(uid);
    expect(sealed).not.toContain("https");
    expect(await openSession("secret", sealed)).toEqual({
      uid,
      picture: "https://p/x",
    });
  });

  it("rejects a tampered, foreign or missing cookie", async () => {
    const sealed = await sealSession("secret", { uid: "u1", picture: null });
    expect(await openSession("other", sealed)).toBeNull();
    // Flip one bit of the ciphertext. (Rewriting the last characters could
    // leave the decoded bytes unchanged: the final base64 character carries
    // padding bits.)
    const tampered = fromBase64Url(sealed)!;
    tampered[tampered.length >> 1] ^= 1;
    expect(await openSession("secret", toBase64Url(tampered))).toBeNull();
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
