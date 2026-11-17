import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TicketView } from "@shared/types";
import { ticketLink } from "@/lib/links";
import { TicketCard } from "./ticket-card";

const user = (id: string) => ({
  id,
  avatar: { kind: "blocky" as const, value: "" },
});
const TICKET: TicketView = {
  code: "asdf1234",
  status: "open",
  createdAt: "2026-01-01T12:00:00.000Z",
  submittedAt: null,
  venue: {
    id: null,
    name: "The Copper Owl",
    address: "1 Main St",
    lat: 1,
    lng: 2,
  },
  creator: user("host"),
  participants: [],
  isCreator: true,
  isParticipant: false,
};

describe("TicketCard", () => {
  it("shows the venue, the code and a QR code while open", () => {
    render(<TicketCard ticket={TICKET} />);
    expect(
      screen.getByRole("heading", { name: "The Copper Owl" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("asdf1234")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Ticket QR code" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Party of 1")).toBeInTheDocument();
    expect(screen.getByText("Waiting for scans…")).toBeInTheDocument();
    expect(screen.queryByText("Submitted")).toBeNull();
  });

  it("stamps a submitted ticket and shows the whole party", () => {
    render(
      <TicketCard
        ticket={{
          ...TICKET,
          status: "submitted",
          submittedAt: "2026-01-01T13:00:00.000Z",
          participants: [user("a"), user("b")],
        }}
      />,
    );
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Party of 3")).toBeInTheDocument();
    expect(screen.getByText("This ticket is final.")).toBeInTheDocument();
  });

  it("links the QR code to the home page with ?ticket=", () => {
    expect(ticketLink("asdf1234", "https://irl.page")).toBe(
      "https://irl.page/?ticket=asdf1234",
    );
  });
});
