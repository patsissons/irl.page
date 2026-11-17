// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMAIL_HASH_ROUNDS, emailHash } from "./hash.ts";

// One round keeps these quick; the full cost has its own tests below.
const quick = (email: string, pepper: string) => emailHash(email, pepper, 1);

describe("emailHash", () => {
  it("is stable, and ignores case and surrounding space", async () => {
    const hash = await quick("Pat@Example.com", "pepper");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await quick("  pat@example.com ", "pepper")).toBe(hash);
  });

  it("depends on the pepper, so it can't be recomputed without the secret", async () => {
    expect(await quick("pat@example.com", "a")).not.toBe(
      await quick("pat@example.com", "b"),
    );
  });

  it("differs per email and never contains it", async () => {
    const hash = await quick("pat@example.com", "pepper");
    expect(hash).not.toBe(await quick("sam@example.com", "pepper"));
    expect(hash).not.toContain("pat");
  });

  it("depends on the number of rounds", async () => {
    expect(await emailHash("pat@example.com", "pepper", 1)).not.toBe(
      await emailHash("pat@example.com", "pepper", 2),
    );
  });

  // Every stored hash depends on these two. If either test fails, the change
  // would orphan every account: revert it rather than updating the test.
  it("uses 20 rounds unless told otherwise", () => {
    expect(EMAIL_HASH_ROUNDS).toBe(20);
  });

  it("gives the same hash it always has", async () => {
    expect(await emailHash("pat@example.com", "pepper")).toBe(
      "27a84eba048b2eeb92243dd3f552a1dc0916e6d13a300687dd46b035c29cf075",
    );
  });
});
