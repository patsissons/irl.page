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
