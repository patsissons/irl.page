import type { ReactNode } from "react";
import { Globe, QrCode, ScanLine, Ticket } from "lucide-react";
import { Link, NavLink } from "react-router";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { to: "/", label: "Explore", icon: Globe },
  { to: "/new", label: "New ticket", icon: QrCode },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/tickets", label: "My tickets", icon: Ticket },
];

export function Logo() {
  return (
    <Link
      to="/"
      aria-label="IRL Page home"
      className="flex items-center gap-2 text-lg font-bold tracking-tight"
    >
      <img src="/favicon.svg" alt="" className="size-7" />
      <span>
        IRL<span className="text-primary">.page</span>
      </span>
    </Link>
  );
}

/**
 * Header on top, tab bar at the bottom on phones. `bleed` pages (the graph
 * and globe) fill everything in between; other pages get a centred column.
 */
export function AppShell({
  children,
  bleed = false,
}: {
  children: ReactNode;
  bleed?: boolean;
}) {
  const { user } = useSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-x sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 backdrop-blur">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden gap-1 sm:flex">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground",
                  isActive && "bg-secondary text-foreground",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <Link
              to="/profile"
              aria-label="Your profile"
              className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Avatar user={user} size={36} />
            </Link>
          )}
        </div>
      </header>

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !bleed && "safe-x mx-auto w-full max-w-2xl py-6",
        )}
      >
        {children}
      </main>

      <nav
        aria-label="Main"
        className="safe-b sticky bottom-0 z-20 grid shrink-0 grid-cols-4 border-t bg-background/95 pt-1 backdrop-blur sm:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground",
                isActive && "text-primary",
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
