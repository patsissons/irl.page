import { expect, test } from "@playwright/test";
import type { GraphData } from "../shared/types.ts";
import { seededVenue, visitor } from "./fixtures.ts";

// Runs against the demo site (the `demo` project in playwright.config.ts):
// the same app in demo mode, with no database behind it.

const DEMO_TICKET = "demo2026";

const world = async (request: { get: (url: string) => Promise<unknown> }) =>
  (await (
    (await request.get("/api/graph")) as { json: () => Promise<GraphData> }
  ).json()) as GraphData;

test("the demo runs the whole ticket flow and keeps none of it", async ({
  browser,
  baseURL,
  page,
}) => {
  const before = await world(page.request);
  expect(before.people.length).toBeGreaterThan(100);

  // Standing at a venue in the made-up world, far from the demo ticket's.
  const venue = await seededVenue(page);
  const host = await visitor(browser, baseURL, venue);
  await host.page.goto("/new");
  await expect(host.page.getByRole("note").first()).toContainText(
    "everything here is made up",
  );
  await expect(host.page.getByText("Demo people")).toBeVisible();
  await expect(
    host.page.getByRole("button", { name: "Sign in as a new person" }),
  ).toHaveCount(0);
  await host.page
    .getByRole("button", { name: "Sign in as seed user 1", exact: true })
    .click();

  // Whatever venue is picked, the ticket is the demo ticket, as the host's.
  await host.page
    .getByRole("list", { name: "Nearby venues" })
    .getByRole("button", { name: new RegExp(venue.name) })
    .click();
  await expect(host.page).toHaveURL(new RegExp(`/ticket/${DEMO_TICKET}$`));
  await expect(
    host.page.getByRole("img", { name: "Ticket QR code" }),
  ).toBeVisible();
  const submit = host.page.getByRole("button", { name: "Submit ticket" });
  await expect(submit).toBeDisabled();
  await expect(
    host.page.getByText("The demo's ticket stays open"),
  ).toBeVisible();

  // A guest on the other side of the world can join: no location needed.
  const guest = await visitor(browser, baseURL, { lat: 0, lng: 0 });
  await guest.page.goto(`/?ticket=${DEMO_TICKET}`);
  await guest.page
    .getByRole("button", { name: "Sign in as seed user 2", exact: true })
    .click();
  await guest.page.getByRole("button", { name: "Join this ticket" }).click();
  await expect(guest.page.getByText("You're on the ticket")).toBeVisible();
  // It survives a reload, because it lives in the guest's session...
  await guest.page.reload();
  await expect(guest.page.getByText("You're on the ticket")).toBeVisible();

  // ...and it is listed among the host's tickets until they cancel it.
  await host.page.goto("/tickets");
  await expect(
    host.page.getByRole("link", { name: /Velvet Canary Records/ }).first(),
  ).toBeVisible();
  await host.page.goto(`/ticket/${DEMO_TICKET}`);
  await host.page.getByRole("button", { name: "Cancel ticket" }).click();
  await expect(host.page).toHaveURL(/\/tickets$/);
  await host.page.goto(`/ticket/${DEMO_TICKET}`);
  await expect(submit).toHaveCount(0);

  // Nothing any of that did reached the world.
  expect(await world(page.request)).toEqual(before);
});

test("the demo shows the graph and the globe to a signed-out visitor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("Demo");
  const people = page
    .getByTestId("stage")
    .locator("dl > div")
    .filter({ hasText: "People" });
  await expect(people).toHaveText(/^140\s*People$/);
  const response = await page.request.get("/");
  expect(response.headers()["x-robots-tag"]).toBe("noindex");
});
