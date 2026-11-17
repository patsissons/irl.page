import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll } from "./fixtures.ts";

test("shows the seeded network as a graph, then on a globe", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("stage");
  await expect(stage.getByText("People")).toBeVisible();
  await expect(stage.locator("canvas")).toBeVisible();
  await expect(stage.locator("[data-view=graph]")).toBeVisible();

  await page.getByRole("button", { name: "Globe" }).click();
  await expect(page).toHaveURL(/view=globe/);
  await expect(stage.locator("[data-view=globe] canvas")).toBeVisible();

  for (const layer of ["Spikes", "Arcs", "Heat"]) {
    await page.getByRole("button", { name: layer }).click();
    await expect(page.getByRole("button", { name: layer })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(new RegExp(`layer=${layer.toLowerCase()}`));
    await expect(stage.locator("canvas")).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
});

test("a scanned ticket link lands on the ticket", async ({ page }) => {
  await page.goto("/?ticket=nosuch12");
  await expect(page).toHaveURL(/\/ticket\/nosuch12$/);
  await expect(
    page.getByRole("heading", { name: "Ticket not found" }),
  ).toBeVisible();
});

test("gated pages ask for sign-in", async ({ page }) => {
  await page.goto("/tickets");
  await expect(
    page.getByRole("heading", { name: "Sign in to see your tickets" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("sign-in links the privacy policy", async ({ page }) => {
  await page.goto("/tickets");
  await page.getByRole("link", { name: "How we handle your data" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the scanner accepts a typed code", async ({ page }) => {
  await page.goto("/scan");
  await page.getByLabel("Or enter the ticket code").fill("not a code");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("alert")).toContainText("doesn't look like");
  await page
    .getByLabel("Or enter the ticket code")
    .fill("https://irl.page?ticket=nosuch12");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/ticket\/nosuch12$/);
});

test("“Just me” narrows both views to my own connections", async ({ page }) => {
  await page.goto("/tickets");
  await page
    .getByRole("button", { name: "Sign in as seed user 1", exact: true })
    .click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();

  await page.goto("/");
  const stage = page.getByTestId("stage");
  const people = stage.locator("dl > div").filter({ hasText: "People" });
  const count = async () => Number.parseInt((await people.innerText()).trim());
  await expect(people).toHaveText(/^\d+\s*People$/);
  // Other specs add people while this runs, so compare, don't hardcode.
  const everyone = await count();

  const justMe = page.getByRole("button", { name: "Just me" });
  await justMe.click();
  await expect(justMe).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/focus=[a-z0-9]+/);
  await expect(stage.getByText("Tickets")).toHaveCount(0);
  await expect.poll(count).toBeLessThan(everyone);
  const mine = await count();
  await expect(stage.locator("[data-view=graph] canvas")).toBeVisible();

  // The focus carries over to the globe.
  await page.getByRole("button", { name: "Globe" }).click();
  await expect(page).toHaveURL(/focus=[a-z0-9]+/);
  await expect(justMe).toHaveAttribute("aria-pressed", "true");
  await expect(stage.locator("[data-view=globe] canvas")).toBeVisible();

  await justMe.click();
  await expect(page).not.toHaveURL(/focus=/);
  await expect.poll(count).toBeGreaterThan(mine);
});

test("a focus link shows one node's connections and can be cleared", async ({
  page,
}) => {
  const graph = await (await page.request.get("/api/graph")).json();
  const venue = graph.venues[0];
  await page.goto(`/?focus=${venue.id}`);
  const chip = page.getByRole("status");
  await expect(chip).toContainText(venue.name);
  await expect(page.getByTestId("stage").getByText("Venues")).toBeVisible();
  await expect(
    page.getByTestId("stage").locator("dl > div").filter({ hasText: "Venues" }),
  ).toHaveText(/^1\s*Venues$/);

  await page.getByRole("button", { name: "Show everyone" }).click();
  await expect(page).not.toHaveURL(/focus=/);
  await expect(chip).toHaveCount(0);

  // Someone with no submitted ticket has no node to focus on yet.
  await page.goto("/tickets");
  await page.getByRole("button", { name: "Sign in as a new person" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Just me" })).toBeDisabled();
});

test("a focused venue's name leads to its page", async ({ page }) => {
  const graph = (await (await page.request.get("/api/graph")).json()) as {
    venues: { id: string; venueId: string; name: string; visits: number }[];
  };
  const [venue] = graph.venues.sort((a, b) => b.visits - a.visits);
  await page.goto(`/?focus=${venue.id}`);
  await page
    .getByRole("status")
    .getByRole("link", { name: venue.name })
    .click();
  await expect(page).toHaveURL(new RegExp(`/venue/${venue.venueId}$`));

  await expect(
    page.getByRole("heading", { level: 1, name: venue.name }),
  ).toBeVisible();
  // Other specs add tickets while this runs, so read the numbers back.
  const detail = (await (
    await page.request.get(`/api/venues/${venue.venueId}`)
  ).json()) as { lat: number; lng: number };
  const stat = (label: string) =>
    page.locator("dl > div").filter({ hasText: label }).locator("dd");
  await expect(stat("Visits")).toHaveText(/^\d+$/);
  expect(Number(await stat("Visits").innerText())).toBeGreaterThanOrEqual(
    venue.visits,
  );
  await expect(
    page.getByRole("application", { name: `Map showing ${venue.name}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`google\\.com/maps/search/.*${detail.lat.toFixed(6)}`),
  );
  await expect(
    page.getByRole("group", { name: /Running total of visits/ }),
  ).toBeVisible();
  // Everyone counted is listed (both numbers come from the same load).
  await expect(
    page.getByRole("list", { name: "People who visited" }).getByRole("link"),
  ).toHaveCount(Number(await stat("People").innerText()));
  await expectNoHorizontalScroll(page);

  // And back to the graph, focused on the venue.
  await page.getByRole("link", { name: "Show on the graph" }).click();
  await expect(page).toHaveURL(new RegExp(`focus=${venue.id}`));
  await expect(page.getByRole("status")).toContainText(venue.name);

  await page.goto("/venue/aaaaaaaaaaaaaaa");
  await expect(
    page.getByRole("heading", { name: "That venue isn't on IRL Page" }),
  ).toBeVisible();
});
