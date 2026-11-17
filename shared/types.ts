/** API shapes shared by the Worker and the client. */

export type AvatarKind = "oauth" | "gravatar" | "url" | "emoji" | "blocky";

/**
 * `value` is a URL for oauth/url (an https link or a data: URI), a data:
 * URI for gravatar, the emoji itself, or "" for blocky.
 */
export interface Avatar {
  kind: AvatarKind;
  value: string;
}

export interface PublicUser {
  id: string;
  avatar: Avatar;
}

export interface Me extends PublicUser {
  onboarded: boolean;
  /**
   * A link to the picture captured at sign-in (/api/me/picture). The
   * picture's own URL stays in the session, and is stored only if chosen.
   */
  oauthPicture: string | null;
  /**
   * This person's own image link or pasted image, so they can edit it.
   * Everyone else, them included, is shown it through publicAvatar.
   */
  avatarLink: string | null;
  /**
   * The session can look up a Gravatar (GET /api/me/gravatar). The key it
   * looks up by stays sealed in the session cookie.
   */
  gravatar: boolean;
}

export interface AuthOptions {
  google: boolean;
  github: boolean;
  apple: boolean;
  dev: boolean;
}

export interface MeResponse {
  user: Me | null;
  auth: AuthOptions;
  /** True on the demo site: made-up data that nothing can change. */
  demo: boolean;
}

export interface VenueDraft {
  name: string;
  address: string;
  lat: number;
  lng: number;
  osmId: string | null;
}

/** A place offered when creating a ticket, closest first. */
export interface VenueCandidate extends VenueDraft {
  /** Set when the venue already exists on IRL Page. */
  id: string | null;
  /** Metres from the search point. */
  distance: number;
}

export interface NearbyResponse {
  venues: VenueCandidate[];
  /** False when the OpenStreetMap lookup failed or is switched off. */
  osm: boolean;
}

export interface AddressResult {
  /** The place's own name, or "" for a plain street address. */
  name: string;
  label: string;
  lat: number;
  lng: number;
}

export type TicketStatus = "open" | "submitted";

export interface TicketView {
  code: string;
  status: TicketStatus;
  createdAt: string;
  submittedAt: string | null;
  venue: {
    id: string | null;
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  creator: PublicUser;
  participants: PublicUser[];
  isCreator: boolean;
  isParticipant: boolean;
}

/** Where the browser says the person is; see shared/proximity.ts. */
export interface ReportedPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

/** `at` proves the creator is at the venue. */
export type CreateTicketRequest = (
  { venueId: string } | { venue: VenueDraft }
) & { at: ReportedPosition };

/** `at` proves the person joining is at the venue. */
export interface JoinTicketRequest {
  at: ReportedPosition;
}

export interface GraphPerson {
  id: string;
  userId: string;
  avatar: Avatar;
  /** Location of the venue on this person's most recent ticket. */
  lat: number | null;
  lng: number | null;
}

export interface GraphVenue {
  id: string;
  venueId: string;
  name: string;
  lat: number;
  lng: number;
  /** Person-to-venue edges, i.e. attendances. */
  visits: number;
}

export interface GraphLink {
  source: string;
  target: string;
  count: number;
  last: string;
}

export interface GraphData {
  people: GraphPerson[];
  venues: GraphVenue[];
  links: GraphLink[];
  tickets: number;
}

/** Someone who has been to a venue. */
export interface VenueVisitor {
  user: PublicUser;
  /** Their node on the graph, to focus on. */
  nodeId: string | null;
  /** Tickets at this venue they were on. */
  visits: number;
}

/** One day at a venue, by the venue's (estimated) local date. */
export interface VenueDay {
  /** YYYY-MM-DD. */
  date: string;
  tickets: number;
  /** People on those tickets. */
  visits: number;
}

/** GET /api/venues/<id>: the venue page. */
export interface VenueDetail {
  id: string;
  /** The venue's node on the graph, to focus on. */
  nodeId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Submitted tickets here. */
  tickets: number;
  /** People on those tickets, counted once per ticket. */
  visits: number;
  /** Distinct people. */
  people: number;
  firstVisit: string | null;
  lastVisit: string | null;
  /** Regulars first. */
  visitors: VenueVisitor[];
  /** Days with at least one ticket, oldest first. */
  days: VenueDay[];
}

export interface ApiError {
  error: string;
}
