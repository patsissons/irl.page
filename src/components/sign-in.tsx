import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import type { PublicUser } from "@shared/types";
import { api, loginUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Button } from "./ui/button";

/**
 * Sign-in choices. `next` is where to land afterwards. The seed-user picker
 * appears only when the Worker runs with DEV_LOGIN=1, and on the demo site,
 * where it is the only way in.
 */
export function SignIn({ next, title }: { next: string; title?: string }) {
  const { auth, demo, refresh } = useSession();
  const [devUsers, setDevUsers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.dev) return;
    let live = true;
    api
      .devUsers()
      .then(({ users }) => live && setDevUsers(users))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [auth.dev]);

  async function dev(body: { userId: string } | { fresh: true }) {
    setBusy(true);
    try {
      await api.devLogin(body);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Sign in"
      className="mx-auto w-full max-w-sm rounded-2xl border bg-card p-5 text-center"
    >
      <h2 className="text-lg font-semibold">
        {title ?? "Sign in to continue"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {demo
          ? "This is the demo, so there are no accounts. Pick one of these made-up people to look around as."
          : "We use your email once, to recognise you next time. Only a scrambled fingerprint of it is kept."}
      </p>
      <div className="mt-4 grid gap-2">
        {auth.google && (
          <Button asChild size="lg" variant="outline">
            <a href={loginUrl("google", next)}>Continue with Google</a>
          </Button>
        )}
        {auth.github && (
          <Button asChild size="lg" variant="outline">
            <a href={loginUrl("github", next)}>Continue with GitHub</a>
          </Button>
        )}
        {!auth.google && !auth.github && !auth.dev && (
          <p className="text-sm text-muted-foreground">
            Sign-in isn&apos;t set up on this server yet.
          </p>
        )}
      </div>
      {auth.dev && (
        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {demo ? "Demo people" : "Local development"}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {devUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                disabled={busy}
                onClick={() => dev({ userId: user.id })}
                aria-label={`Sign in as seed user ${index + 1}`}
                className="cursor-pointer rounded-full transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Avatar user={user} size={40} />
              </button>
            ))}
          </div>
          {!demo && (
            <Button
              className="mt-3"
              variant="secondary"
              disabled={busy}
              onClick={() => dev({ fresh: true })}
            >
              <UserPlus /> Sign in as a new person
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
