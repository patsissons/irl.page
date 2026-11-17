import type {
  AddressResult,
  Avatar,
  CreateTicketRequest,
  GraphData,
  JoinTicketRequest,
  Me,
  MeResponse,
  NearbyResponse,
  PublicUser,
  TicketView,
  VenueDetail,
} from "@shared/types";

export class ApiFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers:
      init.body === undefined
        ? undefined
        : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiFailure(
      response.status,
      body?.error ?? "Something went wrong",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const ticketPath = (code: string) => `/api/tickets/${encodeURIComponent(code)}`;

export const api = {
  me: () => call<MeResponse>("/api/me"),
  logout: () => call<void>("/api/auth/logout", { method: "POST" }),
  devUsers: () => call<{ users: PublicUser[] }>("/api/auth/dev"),
  devLogin: (body: { userId: string } | { fresh: true }) =>
    call<void>("/api/auth/dev", { method: "POST", body }),
  setAvatar: (avatar: Avatar) =>
    call<Me>("/api/me/avatar", { method: "PUT", body: avatar }),
  nearby: (lat: number, lng: number) =>
    call<NearbyResponse>(`/api/venues/nearby?lat=${lat}&lng=${lng}`),
  searchAddress: (q: string, near: { lat: number; lng: number } | null) =>
    call<{ results: AddressResult[] }>(
      `/api/venues/search?q=${encodeURIComponent(q)}${
        near ? `&lat=${near.lat}&lng=${near.lng}` : ""
      }`,
    ),
  venue: (id: string) =>
    call<VenueDetail>(`/api/venues/${encodeURIComponent(id)}`),
  createTicket: (body: CreateTicketRequest) =>
    call<TicketView>("/api/tickets", { method: "POST", body }),
  ticket: (code: string) => call<TicketView>(ticketPath(code)),
  join: (code: string, body: JoinTicketRequest) =>
    call<TicketView>(`${ticketPath(code)}/join`, { method: "POST", body }),
  submit: (code: string) =>
    call<TicketView>(`${ticketPath(code)}/submit`, { method: "POST" }),
  cancel: (code: string) => call<void>(ticketPath(code), { method: "DELETE" }),
  myTickets: () => call<{ tickets: TicketView[] }>("/api/tickets"),
  graph: () => call<GraphData>("/api/graph"),
};

export function loginUrl(provider: "google" | "github", next: string): string {
  return `/api/auth/${provider}/login?next=${encodeURIComponent(next)}`;
}
