import { DEFAULT_AVATAR, publicAvatar } from "../shared/avatar";
import type { Datastore, PersonRec } from "../shared/db";
import { emailHash } from "../shared/hash";
import type { PublicUser } from "../shared/types";
import type { Ctx } from "./http";
import {
  SESSION_COOKIE,
  openSession,
  parseCookies,
  type SessionPayload,
} from "./session";

export function publicUser(person: PersonRec): PublicUser {
  return {
    id: person.id,
    avatar: publicAvatar(person),
  };
}

/** A stand-in for a person whose record has gone missing. */
export function unknownUser(id: string): PublicUser {
  return { id, avatar: DEFAULT_AVATAR };
}

/**
 * The person for an email, created on first sign-in. The email is hashed
 * here and goes no further: it is never stored, logged or returned.
 */
export async function personForEmail(
  db: Datastore,
  email: string,
  pepper: string,
  now: string,
  /** Only for throwaway addresses; see emailHash. */
  rounds?: number,
): Promise<PersonRec> {
  const hash = await emailHash(email, pepper, rounds);
  const [existing] = await db.list("people", {
    where: [{ field: "email_hash", op: "=", value: hash }],
    limit: 1,
  });
  return (
    existing ??
    db.create("people", {
      email_hash: hash,
      avatar_kind: DEFAULT_AVATAR.kind,
      avatar_value: DEFAULT_AVATAR.value,
      avatar_background: "",
      onboarded: false,
      created: now,
    })
  );
}

export interface Signed {
  session: SessionPayload;
  person: PersonRec;
}

/** The signed-in person, or null. */
export async function currentUser(ctx: Ctx): Promise<Signed | null> {
  const session = await openSession(
    ctx.env.SESSION_SECRET,
    parseCookies(ctx.request.headers.get("cookie"))[SESSION_COOKIE],
  );
  if (!session) return null;
  const person = await ctx.db.get("people", session.uid);
  return person ? { session, person } : null;
}
