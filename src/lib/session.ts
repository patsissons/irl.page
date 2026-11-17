import { createContext, useContext } from "react";
import type { AuthOptions, Me } from "@shared/types";

export interface Session {
  loading: boolean;
  user: Me | null;
  auth: AuthOptions;
  /** The demo site: made-up data, and nothing the visitor does is kept. */
  demo: boolean;
  /** Re-reads /api/me, e.g. after signing in or changing the avatar. */
  refresh: () => Promise<void>;
}

export const NO_AUTH: AuthOptions = {
  google: false,
  github: false,
  dev: false,
};

export const SessionContext = createContext<Session>({
  loading: true,
  user: null,
  auth: NO_AUTH,
  demo: false,
  refresh: async () => {},
});

export function useSession(): Session {
  return useContext(SessionContext);
}
