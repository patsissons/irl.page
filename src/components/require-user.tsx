import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "@/lib/session";
import { SignIn } from "./sign-in";
import { Skeleton } from "./ui/skeleton";

/** Gates a page on being signed in and having picked an avatar. */
export function RequireUser({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { loading, user } = useSession();
  const location = useLocation();
  const here = location.pathname + location.search;

  if (loading) return <Skeleton className="mx-auto h-40 w-full max-w-sm" />;
  if (!user) return <SignIn next={here} title={title} />;
  if (!user.onboarded) {
    return (
      <Navigate to={`/welcome?next=${encodeURIComponent(here)}`} replace />
    );
  }
  return children;
}
