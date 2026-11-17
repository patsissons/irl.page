import { useEffect, useState, type ReactNode } from "react";
import { UserPlus } from "lucide-react";
import { Link } from "react-router";
import type { PublicUser } from "@shared/types";
import { api, loginUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Button } from "./ui/button";

/** Google's "G", in its own colours as its branding guidelines ask. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        className="fill-google-blue"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        className="fill-google-green"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        className="fill-google-yellow"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        className="fill-google-red"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/** Apple's logo, as its sign-in button guidelines ask for. */
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** GitHub's mark. */
function GitHubLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/**
 * One provider's button. Apple asks for a black or white button and
 * Google allows either, so all three match: dark in light mode, light in
 * dark. A three-column grid (logo, label, an empty column as wide as the
 * logo) keeps the logos in one column and each label centred.
 */
function ProviderButton({
  href,
  logo,
  name,
}: {
  href: string;
  logo: ReactNode;
  name: string;
}) {
  return (
    <Button
      asChild
      size="lg"
      className="grid grid-cols-[1rem_1fr_1rem] gap-2 bg-foreground px-4 text-background hover:bg-foreground/85"
    >
      <a href={href}>
        {logo}
        <span className="text-center">Continue with {name}</span>
        <span aria-hidden="true" />
      </a>
    </Button>
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
          <ProviderButton
            href={loginUrl("google", next)}
            logo={<GoogleLogo />}
            name="Google"
          />
        )}
        {auth.apple && (
          <ProviderButton
            href={loginUrl("apple", next)}
            logo={<AppleLogo />}
            name="Apple"
          />
        )}
        {auth.github && (
          <ProviderButton
            href={loginUrl("github", next)}
            logo={<GitHubLogo />}
            name="GitHub"
          />
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
