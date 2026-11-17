// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryDatastore } from "../shared/memory-db";
import { submitTicket } from "../shared/submit";
import { DRAFT, openTicket, person, T0 } from "../shared/testing";
import type { Env } from "./env";
import { handleApi, handleTicketPage, pageTicketCode } from "./index";
import { injectPreview } from "./preview";

const ORIGIN = "https://irl.test";
const SHELL = `<!doctype html>
<html>
  <head>
    <title>IRL Page</title>
    <meta
      name="description"
      content="A map of people who met in real life."
    />
    <meta property="og:title" content="IRL Page" />
    <meta property="og:url" content="https://irl.page/" />
    <meta property="og:image" content="https://irl.page/og.png" />
    <meta
      name="twitter:image"
      content="https://irl.page/og.png"
    />
  </head>
  <body><div id="root"></div></body>
</html>`;

const now = () => new Date(T0);
const env = (html = SHELL) =>
  ({
    ASSETS: {
      fetch: async () =>
        new Response(html, { headers: { "content-type": "text/html" } }),
    },
  }) as unknown as Env;

async function world() {
  const db = memoryDatastore();
  const [a, b] = await Promise.all([1, 2].map((n) => person(db, n)));
  const ticket = await openTicket(db, a.id, [b.id]);
  return { db, ticket };
}

const get = (path: string) => {
  const url = new URL(path, ORIGIN);
  return { request: new Request(url), url };
};

describe("preview image", () => {
  it("renders an open ticket as a cacheable PNG", async () => {
    const { db, ticket } = await world();
    const drawn: string[] = [];
    const png = async (svg: string) => {
      drawn.push(svg);
      return new Uint8Array([137, 80, 78, 71]);
    };
    const { request, url } = get(`/api/tickets/${ticket.code}/preview.png`);
    const response = await handleApi(request, env(), url, { db, now, png });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toContain('width="1200" height="630"');
    expect(drawn[0]).toContain(DRAFT.name);
    expect(drawn[0]).toContain(ticket.code);
    // 12:00 UTC on Jan 1 is the small hours of Jan 1 in Vancouver.
    expect(drawn[0]).toContain("Jan 1, 2026");
  });

  it("has no image for a submitted, expired or unknown ticket", async () => {
    const { db, ticket } = await world();
    const png = async () => {
      throw new Error("nothing should be drawn");
    };
    const image = (code: string, at = now) => {
      const { request, url } = get(`/api/tickets/${code}/preview.png`);
      return handleApi(request, env(), url, { db, now: at, png });
    };
    expect((await image("nosuch12")).status).toBe(404);
    const tomorrow = () => new Date(Date.parse(T0) + 25 * 3600 * 1000);
    expect((await image(ticket.code, tomorrow)).status).toBe(404);
    await submitTicket(db, ticket, T0);
    expect((await image(ticket.code)).status).toBe(404);
  });
});

describe("ticket link pages", () => {
  it("finds the ticket code in either link shape", () => {
    expect(pageTicketCode(new URL("https://irl.test/?ticket=asdf1234"))).toBe(
      "asdf1234",
    );
    expect(pageTicketCode(new URL("https://irl.test/ticket/asdf1234"))).toBe(
      "asdf1234",
    );
    expect(pageTicketCode(new URL("https://irl.test/"))).toBeNull();
    expect(pageTicketCode(new URL("https://irl.test/tickets"))).toBeNull();
  });

  it("gives an open ticket's link its own preview tags", async () => {
    const { db, ticket } = await world();
    const { request, url } = get(`/?ticket=${ticket.code}`);
    const response = await handleTicketPage(request, env(), url, ticket.code, {
      db,
      now,
    });
    const html = await response.text();

    expect(html).toContain(
      `<meta property="og:title" content="Join me at ${DRAFT.name}" />`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${ORIGIN}/api/tickets/${ticket.code}/preview.png" />`,
    );
    expect(html).toContain(`content="${ORIGIN}/?ticket=${ticket.code}"`);
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    );
    // The shell's own tags are replaced, not duplicated.
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/og:image"/g)).toHaveLength(1);
    expect(html.match(/twitter:image"/g)).toHaveLength(1);
    expect(html).not.toContain("og.png");
    expect(html).not.toContain("A map of people");
    expect(html).toContain('<div id="root"></div>');
  });

  it("serves the plain shell when the ticket can't be previewed", async () => {
    const { db, ticket } = await world();
    await submitTicket(db, ticket, T0);
    for (const code of [ticket.code, "nosuch12"]) {
      const { request, url } = get(`/ticket/${code}`);
      const response = await handleTicketPage(request, env(), url, code, {
        db,
        now,
      });
      expect(await response.text()).toBe(SHELL);
    }
  });

  it("still serves the shell if the lookup fails", async () => {
    const broken = memoryDatastore();
    broken.list = async () => {
      throw new Error("database down");
    };
    const { request, url } = get("/?ticket=asdf1234");
    const response = await handleTicketPage(request, env(), url, "asdf1234", {
      db: broken,
      now,
    });
    expect(await response.text()).toBe(SHELL);
  });

  it("escapes venue names in the tags", () => {
    const html = injectPreview(SHELL, {
      title: 'Join me at "Quotes" <b>',
      description: "d",
      image: "https://irl.test/i.png",
      url: "https://irl.test/?ticket=x",
    });
    expect(html).toContain('content="Join me at &quot;Quotes&quot; &lt;b&gt;"');
  });
});
