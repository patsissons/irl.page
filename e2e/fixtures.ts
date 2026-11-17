import { expect, type Browser, type Page } from "@playwright/test";
import type { GraphData, GraphVenue } from "../shared/types.ts";

/** A seeded venue, read from the public graph. */
export async function seededVenue(page: Page): Promise<GraphVenue> {
  const response = await page.request.get("/api/graph");
  const graph = (await response.json()) as GraphData;
  const [busiest] = graph.venues.sort((a, b) => b.visits - a.visits);
  return busiest;
}

/** Signs in as a brand-new person and picks an emoji avatar. */
export async function onboard(page: Page, emoji: string) {
  await page.getByRole("button", { name: "Sign in as a new person" }).click();
  await expect(
    page.getByRole("heading", { name: "Pick your avatar" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Emoji/ }).check();
  await page.getByRole("button", { name: `Use ${emoji}` }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** A separate browser profile standing at the given spot. */
export async function visitor(
  browser: Browser,
  baseURL: string | undefined,
  at: { lat: number; lng: number },
) {
  const context = await browser.newContext({
    baseURL,
    geolocation: { latitude: at.lat, longitude: at.lng },
    permissions: ["geolocation"],
    reducedMotion: "reduce",
  });
  // Stand in for the system share sheet (desktop browsers have none) and
  // record what would have been shared.
  await context.addInitScript(() => {
    const target = window as unknown as { shared?: unknown };
    navigator.share = async (data?: ShareData) => {
      target.shared = {
        url: data?.url,
        title: data?.title,
        files: data?.files?.length ?? 0,
      };
    };
  });
  return { context, page: await context.newPage() };
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
