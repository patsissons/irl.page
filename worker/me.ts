import { validateAvatar } from "../shared/avatar";
import type { PersonRec } from "../shared/db";
import type { Me, MeResponse } from "../shared/types";
import { authOptions } from "./auth";
import { fail, json, readJson, type Ctx } from "./http";
import { currentUser, publicUser } from "./users";

function me(person: PersonRec, picture: string | null): Me {
  return {
    ...publicUser(person),
    onboarded: person.onboarded,
    oauthPicture: picture,
  };
}

/** GET /api/me -> who is signed in, and which sign-in options exist. */
export async function handleMe(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  const body: MeResponse = {
    user: signed ? me(signed.person, signed.session.picture) : null,
    auth: authOptions(ctx.env),
  };
  return json(body);
}

/** PUT /api/me/avatar { kind, value } -> also completes onboarding. */
export async function handleAvatar(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  if (!signed) return fail(401, "sign in first");
  const avatar = validateAvatar(
    await readJson(ctx.request),
    signed.session.picture,
  );
  if (!avatar) return fail(400, "invalid avatar");
  const person = await ctx.db.update("people", signed.person.id, {
    avatar_kind: avatar.kind,
    avatar_value: avatar.value,
    onboarded: true,
  });
  return json(me(person, signed.session.picture));
}
