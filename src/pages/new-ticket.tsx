import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { formatDistance, normalizeName, type LatLng } from "@shared/geo";
import type {
  AddressResult,
  CreateTicketRequest,
  NearbyResponse,
  VenueCandidate,
} from "@shared/types";
import { RequireUser } from "@/components/require-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiFailure } from "@/lib/api";

const VenueMap = lazy(() => import("@/components/venue-map"));

type Locating = "asking" | "found" | "denied" | "unsupported";

/** Venues around a point; refetched when the point moves. */
function useNearby(point: LatLng | null) {
  const [state, setState] = useState<{
    key: string;
    data: NearbyResponse | null;
  }>({ key: "", data: null });
  const key = point ? `${point.lat.toFixed(5)},${point.lng.toFixed(5)}` : "";

  useEffect(() => {
    if (!point) return;
    let live = true;
    api
      .nearby(point.lat, point.lng)
      .then((data) => live && setState({ key, data }))
      .catch(() => live && setState({ key, data: { venues: [], osm: false } }));
    return () => {
      live = false;
    };
    // `key` stands in for `point`, which is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.data : null;
}

/** An existing venue whose name is, or contains, what was typed. */
function sameName(candidates: VenueCandidate[], name: string) {
  const typed = normalizeName(name);
  if (typed.length < 3) return null;
  return (
    candidates.find((candidate) => {
      if (!candidate.id) return false;
      const existing = normalizeName(candidate.name);
      return existing.includes(typed) || typed.includes(existing);
    }) ?? null
  );
}

function Form() {
  const navigate = useNavigate();
  const [locating, setLocating] = useState<Locating>(() =>
    "geolocation" in navigator ? "asking" : "unsupported",
  );
  const [position, setPosition] = useState<LatLng | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [matches, setMatches] = useState<AddressResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `attempt` re-runs the request when the visitor taps "Try again".
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setLocating("found");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [attempt]);
  const locate = () => {
    setLocating("asking");
    setAttempt((count) => count + 1);
  };

  const spot = pin ?? position;
  const nearby = useNearby(position);
  const aroundPin = useNearby(spot);
  const existing = useMemo(
    () => sameName(aroundPin?.venues ?? [], name),
    [aroundPin, name],
  );

  async function create(body: CreateTicketRequest) {
    setBusy(true);
    setError(null);
    try {
      const ticket = await api.createTicket(body);
      navigate(`/ticket/${ticket.code}`);
    } catch (failure) {
      setError(
        failure instanceof ApiFailure ? failure.message : "That didn't work",
      );
      setBusy(false);
    }
  }

  const choose = (venue: VenueCandidate) =>
    create(
      venue.id
        ? { venueId: venue.id }
        : {
            venue: {
              name: venue.name,
              address: venue.address,
              lat: venue.lat,
              lng: venue.lng,
              osmId: venue.osmId,
            },
          },
    );

  async function findAddress(event: FormEvent) {
    event.preventDefault();
    if (address.trim().length < 3) return;
    setSearching(true);
    try {
      setMatches((await api.searchAddress(address, position)).results);
    } catch {
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    if (!spot || !name.trim()) return;
    void create({
      venue: {
        name: name.trim(),
        address: address.trim(),
        ...spot,
        osmId: null,
      },
    });
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Tabs defaultValue="nearby">
        <TabsList>
          <TabsTrigger value="nearby">Nearby</TabsTrigger>
          <TabsTrigger value="manual">Somewhere else</TabsTrigger>
        </TabsList>

        <TabsContent value="nearby" className="grid gap-3 pt-3">
          {locating === "asking" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LocateFixed className="size-4 animate-pulse" /> Finding where you
              are…
            </p>
          )}
          {(locating === "denied" || locating === "unsupported") && (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              <p className="font-medium">We couldn&apos;t get your location</p>
              <p className="mt-1 text-muted-foreground">
                Allow location access and try again, or use “Somewhere else” to
                place the venue on a map.
              </p>
              {locating === "denied" && (
                <Button className="mt-3" variant="secondary" onClick={locate}>
                  <LocateFixed /> Try again
                </Button>
              )}
            </div>
          )}
          {locating === "found" && !nearby && (
            <Skeleton className="h-40 w-full" />
          )}
          {nearby && nearby.venues.length === 0 && (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              Nothing found close by
              {nearby.osm ? "" : " (the place lookup is unavailable right now)"}
              . Use “Somewhere else” to add the venue yourself.
            </p>
          )}
          {nearby && nearby.venues.length > 0 && (
            <ul aria-label="Nearby venues" className="grid gap-2">
              {nearby.venues.map((venue) => (
                <li key={venue.id ?? venue.osmId ?? venue.name}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => choose(venue)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-left transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    <MapPin className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {venue.name}
                      </span>
                      {venue.address && (
                        <span className="block truncate text-sm text-muted-foreground">
                          {venue.address}
                        </span>
                      )}
                    </span>
                    {venue.id && <Badge variant="secondary">On IRL</Badge>}
                    <span className="tabular shrink-0 text-sm text-muted-foreground">
                      {formatDistance(venue.distance)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="manual" className="grid gap-4 pt-3">
          <form
            id="manual-venue"
            onSubmit={submitManual}
            className="grid gap-1.5"
          >
            <label htmlFor="venue-name" className="text-sm font-medium">
              Venue name
            </label>
            <input
              id="venue-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="The Copper Owl"
              className="h-11 rounded-lg border border-input bg-background px-3"
            />
          </form>

          {existing && (
            <div
              role="status"
              className="rounded-2xl border border-primary/50 bg-primary/5 p-4"
            >
              <p className="text-sm font-medium">
                “{existing.name}” is already on IRL Page,{" "}
                {formatDistance(existing.distance)} from here.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Is this the same place?
              </p>
              <Button
                className="mt-3"
                disabled={busy}
                onClick={() => choose(existing)}
              >
                Use {existing.name}
              </Button>
            </div>
          )}

          <form onSubmit={findAddress} className="grid gap-1.5">
            <label htmlFor="venue-address" className="text-sm font-medium">
              Address <span className="text-muted-foreground">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="venue-address"
                maxLength={240}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="123 Main St, Vancouver"
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3"
              />
              <Button
                type="submit"
                variant="secondary"
                className="h-11"
                disabled={searching || address.trim().length < 3}
              >
                <Search /> Find
              </Button>
            </div>
            {matches && matches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No match for that address. Place the pin on the map instead.
              </p>
            )}
            {matches && matches.length > 0 && (
              <ul aria-label="Address matches" className="grid gap-1">
                {matches.map((match) => (
                  <li key={`${match.lat},${match.lng}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPin({ lat: match.lat, lng: match.lng });
                        setMatches(null);
                      }}
                      className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {match.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Location</p>
            <Suspense fallback={<Skeleton className="h-72 w-full" />}>
              <VenueMap value={spot} onChange={setPin} />
            </Suspense>
            <p
              className="tabular text-sm text-muted-foreground"
              data-testid="pin"
            >
              {spot
                ? `Pin at ${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}. Tap the map or drag the pin to move it.`
                : "Tap the map to place the pin."}
            </p>
          </div>

          <Button
            type="submit"
            form="manual-venue"
            size="lg"
            disabled={busy || !spot || !name.trim()}
          >
            Create ticket
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Start a ticket: pick the venue you're at, or add it. */
export default function NewTicket() {
  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-bold">New ticket</h1>
        <p className="text-sm text-muted-foreground">
          Where are you right now?
        </p>
      </header>
      <RequireUser title="Sign in to make a ticket">
        <Form />
      </RequireUser>
    </div>
  );
}
