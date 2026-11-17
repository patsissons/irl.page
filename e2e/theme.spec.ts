import { expect, test } from "@playwright/test";

/** --background in light mode (src/index.css #faf8f5). */
const LIGHT_BG = "rgb(250, 248, 245)";
const html = (page: import("@playwright/test").Page) => page.locator("html");

test.describe("on a dark system", () => {
  test.use({ colorScheme: "dark" });

  test("starts dark, toggles to light and remembers it", async ({ page }) => {
    await page.goto("/tickets");
    await expect(html(page)).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
    await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_BG);

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeVisible();
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });

  // The inline script in index.html sets the theme before the app loads.
  test("applies the theme before the app's JavaScript runs", async ({
    page,
  }) => {
    await page.route("**/src/main.tsx", (route) => route.abort());
    await page.goto("/");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#141218",
    );
  });
});
