import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse } from "@shared/types";
import { api } from "@/lib/api";
import { NO_AUTH, SessionContext, type Session } from "@/lib/session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.me());
    } catch {
      setState({ user: null, auth: NO_AUTH });
    }
  }, []);

  useEffect(() => {
    let live = true;
    api.me().then(
      (body) => live && setState(body),
      () => live && setState({ user: null, auth: NO_AUTH }),
    );
    return () => {
      live = false;
    };
  }, []);

  const session = useMemo<Session>(
    () => ({
      loading: state === null,
      user: state?.user ?? null,
      auth: state?.auth ?? NO_AUTH,
      refresh,
    }),
    [state, refresh],
  );

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
