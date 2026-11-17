import type { CSSProperties } from "react";
import type { TicketView } from "@shared/types";
import { ticketLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Avatar, AvatarStack } from "./avatar";
import { QrCode } from "./qr-code";

const DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The ticket itself: venue and party above the perforation, QR stub below.
 * Paper-coloured in both themes so the QR code keeps its contrast.
 */
export function TicketCard({
  ticket,
  className,
}: {
  ticket: TicketView;
  className?: string;
}) {
  const when = new Date(ticket.submittedAt ?? ticket.createdAt);
  const submitted = ticket.status === "submitted";
  const everyone = [ticket.creator, ...ticket.participants];

  return (
    <article
      aria-label={`Ticket for ${ticket.venue.name}`}
      style={{ "--tear": "calc(100% - 15.5rem)" } as CSSProperties}
      className={cn(
        "ticket-notch relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl bg-ticket text-ticket-foreground shadow-xl",
        className,
      )}
    >
      <div className="bg-primary px-5 py-2 text-xs font-bold tracking-[0.25em] text-primary-foreground uppercase">
        <span className="flex items-center justify-between">
          <span>IRL.page</span>
          <span>Admit all</span>
        </span>
      </div>

      <div className="px-5 pt-4 pb-5">
        <p className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-60">
          Venue
        </p>
        <h2 className="mt-0.5 text-2xl leading-tight font-extrabold text-balance">
          {ticket.venue.name}
        </h2>
        {ticket.venue.address && (
          <p className="mt-1 text-sm opacity-70">{ticket.venue.address}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-60">
              Date
            </dt>
            <dd className="tabular font-semibold">{DATE.format(when)}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-60">
              Time
            </dt>
            <dd className="tabular font-semibold">{TIME.format(when)}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-60">
            Party of {everyone.length}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Avatar
              user={ticket.creator}
              size={40}
              className="ring-2 ring-primary"
            />
            {ticket.participants.length > 0 ? (
              <AvatarStack users={ticket.participants} size={36} />
            ) : (
              <span className="text-sm opacity-60">Waiting for scans…</span>
            )}
          </div>
        </div>
      </div>

      <div className="relative h-[15.5rem] border-t-2 border-dashed border-ticket-foreground/25 px-5 py-4">
        <div className="flex h-full items-center gap-4">
          <QrCode
            value={ticketLink(ticket.code)}
            className={cn(
              "size-44 shrink-0 rounded-lg",
              submitted && "opacity-25",
            )}
          />
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase opacity-60">
              Ticket
            </p>
            <p className="font-mono text-lg font-bold break-all">
              {ticket.code}
            </p>
            <p className="mt-2 text-xs opacity-70">
              {submitted
                ? "This ticket is final."
                : "Scan to join before it's submitted."}
            </p>
          </div>
        </div>
        {submitted && (
          <span className="absolute top-1/2 left-22 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-lg border-4 border-primary px-3 py-1 text-xl font-black tracking-widest text-primary uppercase">
            Submitted
          </span>
        )}
      </div>
    </article>
  );
}
