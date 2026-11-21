import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  onboard,
  seededVenue,
  visitor,
} from "./fixtures.ts";

test("two people meet: create, scan to join, submit, recall", async ({
  browser,
  baseURL,
  page,
}) => {
  const venue = await seededVenue(page);
  const host = await visitor(browser, baseURL, venue);
  const guest = await visitor(browser, baseURL, venue);

  // The host signs up, then picks the venue they are standing in.
  await host.page.goto("/new");
  await onboard(host.page, "rocket");
  await expect(host.page).toHaveURL(/\/new$/);
  const nearby = host.page.getByRole("list", { name: "Nearby venues" });
  const row = nearby.getByRole("button", { name: new RegExp(venue.name) });
  await expect(row).toContainText("On IRL");
  await row.click();

  await expect(host.page).toHaveURL(/\/ticket\/[a-z0-9]{8}$/);
  const code = host.page.url().split("/").pop()!;
  const hostTicket = host.page.getByRole("article");
  await expect(
    hostTicket.getByRole("heading", { name: venue.name }),
  ).toBeVisible();
  await expect(
    hostTicket.getByRole("img", { name: "Ticket QR code" }),
  ).toBeVisible();
  await expect(
    host.page.getByRole("button", { name: "Submit ticket" }),
  ).toBeDisabled();
  await expectNoHorizontalScroll(host.page);

  // The ticket's link unfurls as the ticket: preview tags and a 1200x630 PNG.
  const shell = await (await page.request.get(`/?ticket=${code}`)).text();
  expect(shell).toContain(`Join me at ${venue.name.replace(/&/g, "&amp;")}`);
  expect(shell).toContain(`/api/tickets/${code}/preview.png`);
  const preview = await page.request.get(`/api/tickets/${code}/preview.png`);
  expect(preview.headers()["content-type"]).toBe("image/png");
  const png = await preview.body();
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);

  // Share opens the system sheet with the ticket's link.
  await host.page.getByRole("button", { name: "Share" }).click();
  const shared = await host.page.evaluate(
    () => (window as unknown as { shared: Record<string, unknown> }).shared,
  );
  expect(shared).toEqual({
    url: `${baseURL}/?ticket=${code}`,
    title: `Join me at ${venue.name}`,
    files: 0,
  });

  // Someone the link reached who isn't at the venue can see the ticket but
  // can't join it.
  const remote = await visitor(browser, baseURL, {
    lat: venue.lat + 0.2,
    lng: venue.lng,
  });
  await remote.page.goto(`/?ticket=${code}`);
  await onboard(remote.page, "honeybee");
  await expect(remote.page.getByRole("alert")).toContainText(
    "You need to be there to join",
  );
  await expect(
    remote.page.getByRole("button", { name: "Join this ticket" }),
  ).toBeDisabled();
  await remote.context.close();

  // Someone with location switched off is told how to turn it on.
  const blocked = await browser.newContext({
    baseURL,
    reducedMotion: "reduce",
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(`/?ticket=${code}`);
  await onboard(blockedPage, "owl");
  await expect(blockedPage.getByRole("alert")).toContainText(
    /Location is turned off|couldn't find where you are/,
  );
  await expect(
    blockedPage.getByRole("button", { name: "Join this ticket" }),
  ).toBeDisabled();
  await blocked.close();

  // The guest scans the QR code with their phone's camera: the link opens
  // the home page with ?ticket=, and they sign up on the way in.
  await guest.page.goto(`/?ticket=${code}`);
  await expect(
    guest.page.getByRole("heading", { name: "Sign in to join this ticket" }),
  ).toBeVisible();
  await onboard(guest.page, "pizza");
  await expect(guest.page).toHaveURL(new RegExp(`/ticket/${code}$`));
  await guest.page.getByRole("button", { name: "Join this ticket" }).click();
  await expect(guest.page.getByText("You're on the ticket")).toBeVisible();

  // The host's ticket picks the guest up by itself, then gets submitted.
  await expect(hostTicket.getByText("Party of 2")).toBeVisible();
  await host.page.getByRole("button", { name: "Submit ticket" }).click();
  await expect(hostTicket.getByText("Submitted")).toBeVisible();
  await expect(
    host.page.getByRole("button", { name: "Submit ticket" }),
  ).toHaveCount(0);

  // The guest sees it become final, and both can recall it.
  await expect(
    guest.page.getByRole("article").getByText("Submitted"),
  ).toBeVisible();
  await guest.page.goto("/tickets");
  const recalled = guest.page.getByRole("link", {
    name: new RegExp(venue.name),
  });
  await expect(recalled).toBeVisible();
  await expect(recalled.getByRole("img")).toHaveCount(2);

  // A final ticket's link no longer unfurls.
  const finalShell = await (await page.request.get(`/?ticket=${code}`)).text();
  expect(finalShell).not.toContain("preview.png");

  // A final ticket is invisible to anyone who wasn't on it.
  await page.goto(`/ticket/${code}`);
  await expect(
    page.getByRole("heading", { name: "Ticket not found" }),
  ).toBeVisible();

  await host.context.close();
  await guest.context.close();
});

test("adding a venue by hand offers the existing one, or creates a new one", async ({
  browser,
  baseURL,
  page,
}) => {
  const venue = await seededVenue(page);
  const host = await visitor(browser, baseURL, venue);
  await host.page.goto("/new");
  await onboard(host.page, "cactus");

  await host.page.getByRole("tab", { name: "Somewhere else" }).click();
  await expect(host.page.getByTestId("pin")).toContainText(
    venue.lat.toFixed(5),
  );

  // Typing a name that's already here prompts for the existing venue.
  const name = host.page.getByLabel("Venue name");
  await name.fill(venue.name.toLowerCase());
  await expect(host.page.getByRole("status")).toContainText(
    "already on IRL Page",
  );
  await expect(
    host.page.getByRole("button", { name: `Use ${venue.name}` }),
  ).toBeVisible();

  // A new name creates a ticket for a venue that doesn't exist yet.
  await name.fill("Brand New Test Venue");
  await expect(host.page.getByRole("status")).toHaveCount(0);
  await host.page.getByLabel(/^Address/).fill("9 Test Lane");
  await host.page.getByRole("button", { name: "Create ticket" }).click();
  await expect(host.page).toHaveURL(/\/ticket\/[a-z0-9]{8}$/);
  const ticket = host.page.getByRole("article");
  await expect(
    ticket.getByRole("heading", { name: "Brand New Test Venue" }),
  ).toBeVisible();
  await expect(ticket.getByText("9 Test Lane")).toBeVisible();

  // The host can still cancel it; it disappears from their tickets.
  await host.page.getByRole("button", { name: "Cancel ticket" }).click();
  await expect(host.page).toHaveURL(/\/tickets$/);
  await expect(host.page.getByText("No tickets yet")).toBeVisible();
  await host.context.close();
});

test("the avatar can be changed from the profile", async ({ page }) => {
  await page.goto("/profile");
  await onboard(page, "guitar");
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your avatar" }),
  ).toBeVisible();
  const header = page
    .getByRole("link", { name: "Your profile" })
    .getByRole("img");
  // Each choice shows in the header as soon as it is picked.
  await page.getByRole("radio", { name: /Blocky/ }).check();
  await expect(header).toHaveAttribute("data-avatar-kind", "blocky");
  await page.getByRole("radio", { name: /Image link/ }).check();
  await expect(header).toHaveAttribute("data-avatar-kind", "url");
  await page.getByRole("radio", { name: /Emoji/ }).check();
  await expect(header).toHaveAttribute("data-avatar-kind", "emoji");
  await page.getByRole("radio", { name: /Blocky/ }).check();
  await page.getByRole("button", { name: "Save avatar" }).click();
  await expect(
    page.getByRole("link", { name: "Your profile" }).getByRole("img"),
  ).toHaveAttribute("data-avatar-kind", "blocky");
  await page.reload();
  await expect(page.getByRole("radio", { name: /Blocky/ })).toBeChecked();

  // A small image pasted as a data: URI, longer than the old 500-character
  // column, is saved whole.
  const image = `data:image/png;base64,${"A".repeat(4000)}`;
  await page.getByRole("radio", { name: /Image link/ }).check();
  await page.getByRole("textbox", { name: "Image link" }).fill(image);
  await page.getByRole("button", { name: "Save avatar" }).click();
  await expect(
    page.getByRole("link", { name: "Your profile" }).getByRole("img"),
  ).toHaveAttribute("data-avatar-kind", "url");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Image link" })).toHaveValue(
    image,
  );

  // A toned emoji, picked from the list.
  await page.getByRole("radio", { name: /Emoji/ }).check();
  await page.getByRole("radio", { name: "Medium-dark skin tone" }).click();
  await page.getByLabel("Filter emoji").fill("thumbs up");
  await page.getByRole("button", { name: "thumbs up", exact: true }).click();
  await page.getByRole("button", { name: "Save avatar" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "thumbs up", exact: true }),
  ).toHaveText("👍🏾");

  // A background colour, from the quick picks and then typed.
  const hex = page.getByRole("textbox", { name: "Background colour hex" });
  const avatar = page
    .getByRole("link", { name: "Your profile" })
    .getByRole("img");
  await expect(hex).toHaveValue("");
  await expect(avatar).toHaveCSS("background-color", "rgb(255, 255, 255)");

  // The header shows a colour as soon as it is picked, but leaving the
  // profile without saving puts the saved one back.
  await page.getByRole("button", { name: "#ef4444" }).click();
  await expect(avatar).toHaveCSS("background-color", "rgb(239, 68, 68)");
  await page
    .getByRole("link", { name: "My tickets" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/tickets$/);
  await expect(avatar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(hex).toHaveValue("");

  await page.getByRole("button", { name: "#3b82f6" }).click();
  await expect(hex).toHaveValue("#3b82f6");
  await expect(avatar).toHaveCSS("background-color", "rgb(59, 130, 246)");
  await hex.fill("#0af");
  await page.getByRole("button", { name: "Save avatar" }).click();
  await expect(avatar).toHaveCSS("background-color", "rgb(0, 170, 255)");
  await page.reload();
  await expect(hex).toHaveValue("#00aaff");
  await expect(avatar).toHaveCSS("background-color", "rgb(0, 170, 255)");
  await page.getByRole("button", { name: "Default" }).click();
  await page.getByRole("button", { name: "Save avatar" }).click();
  await expect(avatar).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toHaveCount(0);
});

test("making a ticket needs location to be on", async ({ page }) => {
  await page.goto("/new");
  await onboard(page, "watermelon");
  const banner = page.getByRole("alert");
  await expect(banner).toContainText(
    /Location is turned off|couldn't find where you are/,
  );
  await expect(banner).toContainText("we need your location to make one");
  await expect(banner.getByRole("button")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nearby" })).toHaveCount(0);
});
