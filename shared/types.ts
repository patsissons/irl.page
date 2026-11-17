/** API shapes shared by the Worker and the client. */

export type AvatarKind = "oauth" | "url" | "emoji" | "blocky";

/** `value` is a URL for oauth/url, the emoji itself, or "" for blocky. */
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
  /** Picture captured at sign-in; held in the session, never stored. */
  oauthPicture: string | null;
}

export interface AuthOptions {
  google: boolean;
  github: boolean;
  dev: boolean;
}

export interface MeResponse {
  user: Me | null;
  auth: AuthOptions;
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

export type CreateTicketRequest = { venueId: string } | { venue: VenueDraft };

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

export interface ApiError {
  error: string;
}
