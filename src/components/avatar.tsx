import { useState } from "react";
import { blocky } from "@shared/avatar";
import type { PublicUser } from "@shared/types";
import { cn } from "@/lib/utils";

function Blocky({ id }: { id: string }) {
  const { cells, color, background } = blocky(id);
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden="true">
      <rect width="64" height="64" fill={background} />
      {cells.map((on, index) =>
        on ? (
          <rect
            key={index}
            x={7 + (index % 5) * 10}
            y={7 + Math.floor(index / 5) * 10}
            width="10"
            height="10"
            fill={color}
          />
        ) : null,
      )}
    </svg>
  );
}

/**
 * A person, as much as anyone sees of them: a picture, an emoji, or the
 * blocky pattern derived from their id. A picture that fails to load falls
 * back to the blocky.
 */
export function Avatar({
  user,
  size = 40,
  className,
}: {
  user: PublicUser;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const { kind, value } = user.avatar;
  const picture = (kind === "url" || kind === "oauth") && broken !== value;

  return (
    <span
      role="img"
      aria-label={`Avatar ${user.id.slice(0, 6)}`}
      data-avatar-kind={kind}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10 select-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}
    >
      {picture ? (
        <img
          src={value}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setBroken(value)}
        />
      ) : kind === "emoji" ? (
        <span aria-hidden="true">{value}</span>
      ) : (
        <Blocky id={user.id} />
      )}
    </span>
  );
}

export function AvatarStack({
  users,
  size = 32,
  max = 8,
}: {
  users: PublicUser[];
  size?: number;
  max?: number;
}) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((user, index) => (
        <Avatar
          key={user.id}
          user={user}
          size={size}
          className={cn("ring-2 ring-ticket", index > 0 && "-ml-2")}
        />
      ))}
      {extra > 0 && (
        <span className="tabular ml-1.5 text-sm font-medium">+{extra}</span>
      )}
    </span>
  );
}
