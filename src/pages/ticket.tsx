import { useEffect, useState } from "react";
import { Check, Copy, Send, Share2, Trash2, UserPlus } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { formatDistance } from "@shared/geo";
import { PRESENT_RADIUS_M, distanceFromVenue } from "@shared/proximity";
import type { TicketView } from "@shared/types";
import { LocationBanner } from "@/components/location-banner";
import { SignIn } from "@/components/sign-in";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePosition } from "@/hooks/use-position";
import { api, ApiFailure } from "@/lib/api";
import { ticketLink } from "@/lib/links";
import { useSession } from "@/lib/session";
import { canShare, shareTicket } from "@/lib/share";

const POLL_MS = 3000;

/**
 * One ticket. While it is open this is the invitation: the creator shows the
 * QR code, others land here by scanning it and join, and the creator submits.
 */
export function TicketPage() {
  const { code = "" } = useParams();
  const { loading, user } = useSession();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Loaded on arrival and whenever the viewer changes (a submitted ticket
  // is members-only), then polled while open, as people scan it.
  const viewer = user?.id;
  const open = ticket?.status === "open";
  useEffect(() => {
    let live = true;
    const load = () =>
      api.ticket(code).then(
        (current) => live && setTicket(current),
        (failure) =>
          live &&
          failure instanceof ApiFailure &&
          failure.status === 404 &&
          setMissing(true),
      );
    void load();
    const timer = open ? setInterval(load, POLL_MS) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [code, viewer, open]);

  const member = Boolean(ticket?.isCreator || ticket?.isParticipant);
  const party = ticket?.participants.length ?? 0;
  const sharable = open && member && canShare();

  // Joining needs a confirmed location: a link or a photo of the QR code
  // can reach someone who isn't here. Only asked of people who could join.
  const joining = Boolean(open && user?.onboarded && !member);
  const location = usePosition(joining);
  const away =
    ticket && location.position
      ? distanceFromVenue(location.position, ticket.venue)
      : null;
  const tooFar = away !== null && away > PRESENT_RADIUS_M;

  async function share() {
    if (!ticket) return;
    try {
      await shareTicket(ticket);
    } catch {
      setError("Couldn't open the share sheet");
    }
  }

  async function act(action: () => Promise<TicketView | void>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result) setTicket(result);
      else navigate("/tickets");
    } catch (failure) {
      setError(
        failure instanceof ApiFailure ? failure.message : "That didn't work",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(ticketLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy the link");
    }
  }

  if (missing) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">Ticket not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been cancelled or expired, or it&apos;s final and you
          weren&apos;t on it.
        </p>
        <Button asChild className="mt-4" variant="secondary">
          <Link to="/">Back to the map</Link>
        </Button>
      </div>
    );
  }
  if (!ticket || loading)
    return <Skeleton className="mx-auto h-[32rem] w-full max-w-sm" />;

  const here = `/ticket/${code}`;
  if (user && !user.onboarded) {
    return (
      <Navigate to={`/welcome?next=${encodeURIComponent(here)}`} replace />
    );
  }

  return (
    <div className="grid gap-5">
      <h1 className="sr-only">Ticket for {ticket.venue.name}</h1>
      <TicketCard ticket={ticket} />

      <div className="mx-auto grid w-full max-w-sm gap-3">
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}

        {open && !user && (
          <SignIn next={here} title="Sign in to join this ticket" />
        )}

        {joining && (
          <>
            <LocationBanner
              location={location}
              reason="Joining a ticket means you were there, so we need your location to check you're at the venue."
            />
            {tooFar && away !== null && (
              <p role="alert" className="text-center text-sm text-destructive">
                You&apos;re about {formatDistance(away)} from{" "}
                {ticket.venue.name}. You need to be there to join.
              </p>
            )}
            <Button
              size="lg"
              disabled={busy || !location.position || tooFar}
              onClick={() => {
                const at = location.position;
                if (at) void act(() => api.join(code, { at }));
              }}
            >
              <UserPlus /> Join this ticket
            </Button>
            {tooFar && (
              <Button variant="ghost" onClick={location.retry}>
                Check my location again
              </Button>
            )}
          </>
        )}

        {open && ticket.isParticipant && (
          <>
            <p className="text-center text-sm text-muted-foreground">
              You&apos;re on the ticket. It becomes final when the host submits
              it.
            </p>
            {sharable && (
              <Button variant="secondary" className="mx-auto" onClick={share}>
                <Share2 /> Share
              </Button>
            )}
          </>
        )}

        {open && ticket.isCreator && (
          <>
            <Button
              size="lg"
              disabled={busy || party === 0}
              onClick={() => act(() => api.submit(code))}
            >
              <Send /> Submit ticket
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {party === 0
                ? "Have someone scan the code to join. A ticket needs at least two people."
                : "Submitting makes the ticket final. Nobody can join or leave after that."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {sharable && (
                <Button variant="secondary" onClick={share}>
                  <Share2 /> Share
                </Button>
              )}
              <Button variant="secondary" onClick={copy}>
                {copied ? <Check /> : <Copy />}{" "}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => act(() => api.cancel(code))}
              >
                <Trash2 /> Cancel ticket
              </Button>
            </div>
          </>
        )}

        {!open && (
          <Button asChild variant="secondary">
            <Link to="/tickets">All my tickets</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
