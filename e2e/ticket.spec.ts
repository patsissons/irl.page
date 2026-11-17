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
  await onboard(host.page, "🚀");
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

  // The guest scans the QR code with their phone's camera: the link opens
  // the home page with ?ticket=, and they sign up on the way in.
  await guest.page.goto(`/?ticket=${code}`);
  await expect(
    guest.page.getByRole("heading", { name: "Sign in to join this ticket" }),
  ).toBeVisible();
  await onboard(guest.page, "🍕");
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
  await onboard(host.page, "🌵");

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
  await onboard(page, "🎸");
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your avatar" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Blocky/ }).check();
  await page.getByRole("button", { name: "Save avatar" }).click();
  await expect(
    page.getByRole("link", { name: "Your profile" }).getByRole("img"),
  ).toHaveAttribute("data-avatar-kind", "blocky");
  await page.reload();
  await expect(page.getByRole("radio", { name: /Blocky/ })).toBeChecked();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toHaveCount(0);
});
