// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailHash } from "./hash.ts";

describe("emailHash", () => {
  it("is stable, and ignores case and surrounding space", async () => {
    const hash = await emailHash("Pat@Example.com", "pepper");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await emailHash("  pat@example.com ", "pepper")).toBe(hash);
  });

  it("depends on the pepper, so it can't be recomputed without the secret", async () => {
    expect(await emailHash("pat@example.com", "a")).not.toBe(
      await emailHash("pat@example.com", "b"),
    );
  });

  it("differs per email and never contains it", async () => {
    const hash = await emailHash("pat@example.com", "pepper");
    expect(hash).not.toBe(await emailHash("sam@example.com", "pepper"));
    expect(hash).not.toContain("pat");
  });
});
