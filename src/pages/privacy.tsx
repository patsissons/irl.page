import type { ReactNode } from "react";

/**
 * The privacy policy, linked from sign-in and from Google's consent screen.
 * It describes what the code does: keep it in step with AGENTS.md's
 * product invariants whenever what is stored, shown or sent changes.
 */
export const PRIVACY_UPDATED = "November 17, 2026";

const ISSUES = "https://github.com/patsissons/irl.page/issues";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const list = "grid list-disc gap-1.5 pl-5";
const link = "text-primary underline underline-offset-2";

export function Privacy() {
  return (
    <article className="grid gap-6 leading-relaxed">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold">Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated {PRIVACY_UPDATED}
        </p>
      </header>

      <p>
        IRL Page records that people met in person, and where. It is built to
        keep as little about you as it can: it never stores your email, and it
        has no ads, analytics or tracking.
      </p>

      <Section title="Signing in">
        <p>
          You sign in with Google or GitHub. We ask Google for your email
          address, your profile picture and a sign-in id (the{" "}
          <code>openid</code>, <code>email</code> and <code>profile</code>{" "}
          scopes), and GitHub for the same through <code>read:user</code> and{" "}
          <code>user:email</code>. We only accept an email the provider has
          verified.
        </p>
        <p>
          Your email is used once, on our server, to compute a one-way
          fingerprint (a keyed hash) that recognises you next time. The
          fingerprint is stored; the email is not, and it is never logged or
          shown to anyone. Your profile picture is kept in your session cookie
          and is saved only if you choose it as your avatar.
        </p>
        <p>
          IRL Page&apos;s use of information received from Google APIs adheres
          to the{" "}
          <a
            className={link}
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. We don&apos;t sell it, use
          it for advertising, or share it with anyone.
        </p>
      </Section>

      <Section title="What we keep">
        <ul className={list}>
          <li>
            <strong>Your account:</strong> the email fingerprint, the avatar you
            pick (a generated pattern, an emoji, an image link, or your provider
            picture) and when you joined.
          </li>
          <li>
            <strong>Tickets:</strong> who created and joined each one, the
            venue, and when.
          </li>
          <li>
            <strong>Venues:</strong> public places with a name, address and map
            location.
          </li>
        </ul>
      </Section>

      <Section title="What others can see">
        <ul className={list}>
          <li>
            The explore graph and globe are public. They show each person&apos;s
            avatar and who they have met, and each venue&apos;s name and
            location.
          </li>
          <li>
            A venue&apos;s page is public. It shows who has been there, how
            often, and visits per day.
          </li>
          <li>
            An open ticket can be seen by anyone with its link or QR code. Once
            submitted, only the people on it can see it.
          </li>
        </ul>
        <p>Your email, or anything derived from it, is never shown.</p>
      </Section>

      <Section title="Your location">
        <p>
          Creating or joining a ticket asks your browser for your position, to
          check you are actually at the venue. The position is used for that
          check and not stored. To suggest venues near you, the position
          (rounded to about 10 metres) is sent from our server to
          OpenStreetMap&apos;s{" "}
          <a className={link} href="https://overpass-api.de">
            Overpass
          </a>{" "}
          service, and an address you type is sent to OpenStreetMap&apos;s{" "}
          <a className={link} href="https://nominatim.org">
            Nominatim
          </a>
          , without anything that identifies you.
        </p>
      </Section>

      <Section title="Cookies and storage">
        <ul className={list}>
          <li>
            A session cookie keeps you signed in for up to 30 days. It is sealed
            so only our server can read it.
          </li>
          <li>
            A short-lived cookie (10 minutes) protects the sign-in round trip.
          </li>
          <li>Your light or dark theme choice is kept in your browser.</li>
        </ul>
      </Section>

      <Section title="Who else is involved">
        <ul className={list}>
          <li>
            <a
              className={link}
              href="https://www.cloudflare.com/privacypolicy/"
            >
              Cloudflare
            </a>{" "}
            runs the app.
          </li>
          <li>
            <a className={link} href="https://pockethost.io">
              PocketHost
            </a>{" "}
            hosts the database.
          </li>
          <li>
            <a className={link} href="https://openfreemap.org">
              OpenFreeMap
            </a>{" "}
            serves the map tiles your browser loads on venue pages.
          </li>
          <li>
            An avatar that is a provider picture or an image link loads from
            where that image lives (for example Google or GitHub).
          </li>
          <li>
            &ldquo;Open in Google Maps&rdquo; links take you to Google only when
            you follow them.
          </li>
        </ul>
      </Section>

      <Section title="Questions and deleting your account">
        <p>
          To ask a question or have your account removed,{" "}
          <a className={link} href={ISSUES}>
            open an issue on GitHub
          </a>
          . Issues are public, so don&apos;t include your email; we will arrange
          a way to confirm the account is yours.
        </p>
      </Section>
    </article>
  );
}
