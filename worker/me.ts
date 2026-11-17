import { validateAvatar } from "../shared/avatar";
import type { PersonRec } from "../shared/db";
import type { Me, MeResponse } from "../shared/types";
import { authOptions } from "./auth";
import { DEMO_READ_ONLY } from "./demo";
import { gravatarPicture } from "./gravatar";
import { fail, json, readJson, type Ctx } from "./http";
import type { SessionPayload } from "./session";
import { currentUser, publicUser } from "./users";

function me(person: PersonRec, session: SessionPayload): Me {
  return {
    ...publicUser(person),
    onboarded: person.onboarded,
    oauthPicture: session.picture,
    gravatar: Boolean(session.gravatar),
  };
}

/** GET /api/me -> who is signed in, and which sign-in options exist. */
export async function handleMe(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  const body: MeResponse = {
    user: signed ? me(signed.person, signed.session) : null,
    auth: authOptions(ctx.env),
    demo: ctx.demo,
  };
  return json(body);
}

/** PUT /api/me/avatar { kind, value } -> also completes onboarding. */
export async function handleAvatar(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  if (!signed) return fail(401, "sign in first");
  if (ctx.demo) return fail(403, DEMO_READ_ONLY);
  const input = await readJson(ctx.request);
  // A Gravatar is fetched here, by the Worker, rather than taken from the
  // client; the key to fetch it with never leaves the session.
  const wantsGravatar =
    (input as { kind?: unknown } | null)?.kind === "gravatar";
  const gravatar =
    wantsGravatar && signed.session.gravatar
      ? await gravatarPicture(ctx, signed.session.gravatar)
      : null;
  const avatar = validateAvatar(input, signed.session.picture, gravatar);
  if (!avatar) return fail(400, "invalid avatar");
  const person = await ctx.db.update("people", signed.person.id, {
    avatar_kind: avatar.kind,
    avatar_value: avatar.value,
    onboarded: true,
  });
  return json(me(person, signed.session));
}
