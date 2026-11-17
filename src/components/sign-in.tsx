import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Link } from "react-router";
import type { PublicUser } from "@shared/types";
import { api, loginUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Button } from "./ui/button";

/** Apple's logo, as its sign-in button guidelines ask for. */
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

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
      {!demo && (
        <p className="mt-1 text-sm">
          <Link
            to="/privacy"
            className="text-primary underline underline-offset-2"
          >
            How we handle your data
          </Link>
        </p>
      )}
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
        {auth.apple && (
          // Apple asks for a black or white button: black in light mode,
          // white in dark.
          <Button
            asChild
            size="lg"
            className="bg-foreground text-background hover:bg-foreground/85"
          >
            <a href={loginUrl("apple", next)}>
              <AppleLogo /> Continue with Apple
            </a>
          </Button>
        )}
        {!auth.google && !auth.github && !auth.apple && !auth.dev && (
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
