// @vitest-environment node
import { describe, expect, it } from "vitest";
import { filterExpression, pocketbaseDatastore } from "./pocketbase-db.ts";

describe("filterExpression", () => {
  it("builds a PocketBase filter from conditions", () => {
    expect(
      filterExpression([
        { field: "lat", op: ">=", value: 49.1 },
        { field: "status", op: "=", value: "open" },
        { field: "participants", op: "has", value: "abc" },
        { field: "id", op: "in", value: ["a", "b"] },
        { field: "onboarded", op: "=", value: true },
      ]),
    ).toBe(
      "lat >= 49.1 && status = 'open' && participants ~ 'abc' && (id = 'a' || id = 'b') && onboarded = true",
    );
  });

  it("escapes quotes so a value can't break out of its literal", () => {
    expect(
      filterExpression([{ field: "code", op: "=", value: "x' || 1=1 || '" }]),
    ).toBe("code = 'x\\' || 1=1 || \\''");
    expect(() =>
      filterExpression([{ field: "code = 1 ||", op: "=", value: "x" }]),
    ).toThrow("bad field");
  });
});

describe("pocketbaseDatastore", () => {
  it("signs in once, sends the token, and normalises dates", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fake: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        auth: new Headers(init?.headers).get("authorization"),
      });
      if (url.includes("auth-with-password")) {
        return Response.json({ token: "tok" });
      }
      return Response.json({
        items: [{ id: "a", created: "2026-01-02 03:04:05.000Z", name: "Owl" }],
      });
    };
    const db = pocketbaseDatastore({
      url: "http://pb.test/",
      email: "e",
      password: "p",
      fetch: fake,
    });

    const rows = await db.list("venues", { sort: "-created", limit: 5 });
    await db.list("venues");

    expect(rows[0].created).toBe("2026-01-02T03:04:05.000Z");
    expect(
      calls.filter((call) => call.url.includes("auth-with-password")),
    ).toHaveLength(1);
    expect(calls[1].auth).toBe("tok");
    expect(calls[1].url).toContain("sort=-created%2Cid");
    expect(calls[1].url).toContain("perPage=5");
  });

  it("answers an empty `in` without a request", async () => {
    const db = pocketbaseDatastore({
      url: "http://pb2.test",
      email: "e",
      password: "p",
      fetch: async () => {
        throw new Error("no request expected");
      },
    });
    expect(
      await db.list("people", {
        where: [{ field: "id", op: "in", value: [] }],
      }),
    ).toEqual([]);
  });
});
