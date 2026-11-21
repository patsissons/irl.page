import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Avatar, MeResponse } from "@shared/types";
import { api } from "@/lib/api";
import { NO_AUTH, SessionContext, type Session } from "@/lib/session";

const SIGNED_OUT: MeResponse = { user: null, auth: NO_AUTH, demo: false };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeResponse | null>(null);
  const [preview, setPreview] = useState<Avatar | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.me());
    } catch {
      setState(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api.me().then(
      (body) => live && setState(body),
      () => live && setState(SIGNED_OUT),
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
      demo: state?.demo ?? false,
      refresh,
      preview,
      setPreview,
    }),
    [state, refresh, preview],
  );

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
