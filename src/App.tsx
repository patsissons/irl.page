import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router";
import { isTicketCode } from "@shared/ids";
import { AppShell } from "./components/app-shell";
import { Skeleton } from "./components/ui/skeleton";
import { Explore } from "./pages/explore";
import { MyTickets } from "./pages/my-tickets";
import { Profile } from "./pages/profile";
import { TicketPage } from "./pages/ticket";

// Pages with heavy, browser-only dependencies (maps, the camera scanner).
const NewTicket = lazy(() => import("./pages/new-ticket"));
const Scan = lazy(() => import("./pages/scan"));

/**
 * A ticket's QR code is https://irl.page?ticket=<code>, so scanning it with
 * any camera app lands here, on the home page, and is sent on to the ticket.
 */
function Home() {
  const [params] = useSearchParams();
  const code = params.get("ticket");
  if (code && isTicketCode(code)) {
    return <Navigate to={`/ticket/${code}`} replace />;
  }
  return (
    <AppShell bleed>
      <Explore error={params.get("error")} />
    </AppShell>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {children}
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/new"
        element={
          <Page>
            <NewTicket />
          </Page>
        }
      />
      <Route
        path="/scan"
        element={
          <Page>
            <Scan />
          </Page>
        }
      />
      <Route
        path="/tickets"
        element={
          <Page>
            <MyTickets />
          </Page>
        }
      />
      <Route
        path="/ticket/:code"
        element={
          <Page>
            <TicketPage />
          </Page>
        }
      />
      <Route
        path="/profile"
        element={
          <Page>
            <Profile />
          </Page>
        }
      />
      <Route
        path="/welcome"
        element={
          <Page>
            <Profile welcome />
          </Page>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
