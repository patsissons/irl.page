import type { TicketView } from "@shared/types";
import { ticketLink } from "./links";

export const canShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * Opens the system share sheet with the ticket's link. Just the link: chat
 * apps unfurl it as the ticket image (worker/preview.ts), and a single item
 * gets a proper preview in the share sheet. Returns false if the person
 * dismissed the sheet.
 */
export async function shareTicket(ticket: TicketView): Promise<boolean> {
  try {
    await navigator.share({
      title: `Join me at ${ticket.venue.name}`,
      url: ticketLink(ticket.code),
    });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      return false;
    throw error;
  }
}
