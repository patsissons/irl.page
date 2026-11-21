import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { isAvatarUrl, isEmoji, MAX_DATA_URI } from "@shared/avatar";
import type { Avatar as AvatarValue, AvatarKind } from "@shared/types";
import { Avatar } from "@/components/avatar";
import { SignIn } from "@/components/sign-in";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiFailure } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// Every emoji and its names: loaded only when the emoji choice is open.
const EmojiPicker = lazy(() => import("@/components/emoji-picker"));
// The colour square and its styles, kept out of the first paint.
const ColorPicker = lazy(() => import("@/components/color-picker"));

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function Choice({
  kind,
  selected,
  onSelect,
  title,
  hint,
  children,
}: {
  kind: AvatarKind;
  selected: AvatarKind;
  onSelect: (kind: AvatarKind) => void;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  const active = kind === selected;
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 transition",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name="avatar-kind"
          className="mt-1 size-4 accent-primary"
          checked={active}
          onChange={() => onSelect(kind)}
        />
        <span>
          <span className="block font-medium">{title}</span>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </span>
      </label>
      {active && children && <div className="mt-3 pl-7">{children}</div>}
    </div>
  );
}

/** Pick how you appear. Doubles as onboarding (`welcome`). */
export function Profile({ welcome = false }: { welcome?: boolean }) {
  const { loading, user, refresh } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));

  const [kind, setKind] = useState<AvatarKind | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  /** null until a colour is picked; a color of undefined is the default. */
  const [picked, setPicked] = useState<{ color: string | undefined } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** undefined while asking, null when there is none. */
  const [gravatar, setGravatar] = useState<string | null | undefined>();

  // The Worker looks the Gravatar up; the key it uses never reaches here.
  const canGravatar = Boolean(user?.gravatar);
  useEffect(() => {
    if (!canGravatar) return;
    let live = true;
    api
      .gravatar()
      .then(({ picture }) => live && setGravatar(picture))
      .catch(() => live && setGravatar(null));
    return () => {
      live = false;
    };
  }, [canGravatar]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!user) {
    return (
      <SignIn
        next={
          welcome ? `/welcome?next=${encodeURIComponent(next)}` : "/profile"
        }
      />
    );
  }

  // Someone who hasn't picked yet is onboarding, wherever they arrived.
  const picking = welcome || !user.onboarded;
  const current = user.avatar;
  const selected = kind ?? current.kind;
  const emojiValue = emoji ?? (current.kind === "emoji" ? current.value : "🦊");
  const urlValue = url ?? user.avatarLink ?? "";
  const background = picked ? picked.color : current.background;
  const chosen: AvatarValue =
    selected === "emoji"
      ? { kind: "emoji", value: emojiValue.trim() }
      : selected === "url"
        ? { kind: "url", value: urlValue.trim() }
        : selected === "oauth"
          ? { kind: "oauth", value: user.oauthPicture ?? current.value }
          : selected === "gravatar"
            ? { kind: "gravatar", value: gravatar ?? current.value }
            : { kind: "blocky", value: "" };
  // Sent without a background, the avatar goes back to the default one.
  const draft: AvatarValue = background ? { ...chosen, background } : chosen;
  const valid =
    selected === "emoji"
      ? isEmoji(draft.value)
      : selected === "url"
        ? isAvatarUrl(draft.value)
        : selected === "oauth"
          ? user.oauthPicture !== null
          : selected === "gravatar"
            ? Boolean(gravatar)
            : true;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setAvatar(draft);
      await refresh();
      if (welcome) navigate(next, { replace: true });
    } catch (failure) {
      setError(
        failure instanceof ApiFailure ? failure.message : "Couldn't save",
      );
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await api.logout();
    await refresh();
    navigate("/");
  }

  return (
    <div className="grid gap-5">
      <header className="flex items-center gap-4">
        <Avatar
          user={{
            id: user.id,
            avatar: { ...(valid ? chosen : current), background },
          }}
          size={72}
        />
        <div>
          <h1 className="text-2xl font-bold">
            {picking ? "Pick your avatar" : "Your avatar"}
          </h1>
          <p className="text-sm text-muted-foreground">
            This is all anyone sees of you. No name, no email.
          </p>
        </div>
      </header>

      <fieldset className="grid gap-3">
        <legend className="sr-only">Avatar</legend>
        <Choice
          kind="blocky"
          selected={selected}
          onSelect={setKind}
          title="Blocky"
          hint="A pattern made from your id. Says nothing about you."
        />
        <Choice
          kind="emoji"
          selected={selected}
          onSelect={setKind}
          title="Emoji"
          hint="Any emoji you like."
        >
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <EmojiPicker value={emojiValue} onChange={setEmoji} />
          </Suspense>
        </Choice>
        {user.oauthPicture && (
          <Choice
            kind="oauth"
            selected={selected}
            onSelect={setKind}
            title="Your sign-in picture"
            hint="The picture from the account you signed in with."
          />
        )}
        {(gravatar || current.kind === "gravatar") && (
          <Choice
            kind="gravatar"
            selected={selected}
            onSelect={setKind}
            title="Gravatar"
            hint="The Gravatar for the address you signed in with. We save a copy of the picture, never the address."
          />
        )}
        <Choice
          kind="url"
          selected={selected}
          onSelect={setKind}
          title="Image link"
          hint={`Any https image, or a small image pasted as a data: URI (up to ${MAX_DATA_URI / 1024} KB). People who know it may recognise you.`}
        >
          <input
            type="url"
            inputMode="url"
            placeholder="https://… or data:image/…"
            aria-label="Image link"
            value={urlValue}
            onChange={(event) => setUrl(event.target.value)}
            className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </Choice>
      </fieldset>

      <section
        aria-labelledby="avatar-background"
        className="grid gap-3 rounded-2xl border bg-card p-4"
      >
        <div>
          <h2 id="avatar-background" className="font-medium">
            Background
          </h2>
          <p className="text-sm text-muted-foreground">
            The colour behind your avatar. It shows through transparent pictures
            and replaces the blocky&apos;s tint.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <ColorPicker
            value={background}
            onChange={(color) => setPicked({ color })}
          />
        </Suspense>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={!valid || saving} onClick={save}>
          {picking ? "Continue" : "Save avatar"}
        </Button>
        {!picking && (
          <Button size="lg" variant="ghost" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        )}
      </div>
      <p className="font-mono text-xs text-muted-foreground">id {user.id}</p>
    </div>
  );
}
