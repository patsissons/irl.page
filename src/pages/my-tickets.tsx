import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { TicketView } from "@shared/types";
import { AvatarStack } from "@/components/avatar";
import { RequireUser } from "@/components/require-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function List() {
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .myTickets()
      .then((body) => live && setTickets(body.tickets))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <p role="alert">Your tickets couldn&apos;t be loaded.</p>;
  if (!tickets) return <Skeleton className="h-48 w-full" />;
  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="font-medium">No tickets yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Make one where you are, or scan a friend&apos;s.
        </p>
        <Button asChild className="mt-4" size="lg">
          <Link to="/new">New ticket</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="grid gap-3">
      {tickets.map((ticket) => (
        <li key={ticket.code}>
          <Link
            to={`/ticket/${ticket.code}`}
            className="flex items-center gap-4 rounded-2xl border bg-card p-4 transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{ticket.venue.name}</p>
              <p className="tabular text-sm text-muted-foreground">
                {DATE.format(new Date(ticket.submittedAt ?? ticket.createdAt))}
                {ticket.isCreator ? " · you hosted" : ""}
              </p>
              <div className="mt-2">
                <AvatarStack
                  users={[ticket.creator, ...ticket.participants]}
                  size={28}
                  max={7}
                />
              </div>
            </div>
            {ticket.status === "open" && <Badge>Open</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Every ticket I created or joined: the people I've met, and where. */
export function MyTickets() {
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">My tickets</h1>
      <RequireUser title="Sign in to see your tickets">
        <List />
      </RequireUser>
    </div>
  );
}
