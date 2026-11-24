import { A, ArticleShell, H2, P, SECTION } from "@/components/ArticleShell";
import { CONTACT_EMAIL, pageMeta, REPO_URL } from "@/lib/site";

const PATH = "/privacy";
const TITLE = "Privacy Policy";
const DESCRIPTION = "What data Hindsight Chess collects, how reviews are cached and shared, which third-party services are used, and how to contact us.";

export const metadata = pageMeta(PATH, TITLE, DESCRIPTION);

export default function PrivacyPolicy() {
  return (
    <ArticleShell path={PATH} title={TITLE} description={DESCRIPTION} modified="2026-11-24" updated="November 24, 2026">
      <section className={SECTION}>
        <h2 className={H2}>Overview</h2>
        <p className={P}>
          Hindsight Chess is a free, account-free chess game review tool available on the web and Android. We do not require registration, do not sell personal
          data, and do not show third-party ads.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Data we collect and store</h2>
        <p className={P}>
          <strong>Chess games and reviews (publicly shared):</strong> When you analyze a game, the PGN, player usernames, ratings, and generated review are
          stored in our database (Cloudflare D1) under a deterministic hash of the game. Once a game is reviewed, anyone with the review link or who looks up
          that game or player can view the cached review. If you use &ldquo;Re-analyze privately&rdquo;, your analysis is returned only to you and is not saved.
        </p>
        <p className={P}>
          <strong>IP addresses (rate limiting &amp; abuse prevention):</strong> When you request a new game analysis or submit a coach-note report, we store
          your IP address temporarily in Cloudflare D1 to enforce per-connection rate limits (5 new analyses per minute, 60 per day; 10 reports per day). Rate-limit
          records older than 24 hours are automatically pruned.
        </p>
        <p className={P}>
          <strong>Coach-note reports:</strong> If you report an AI-generated coach note in the app, we store the game hash, move number (ply), your selected
          reason, and the timestamp so we can review and improve coach quality.
        </p>
        <p className={P}>
          <strong>On-device preferences:</strong> Recent usernames you look up (up to 5), your last chosen platform, engine depth, and sound setting are stored
          locally on your device (<code className="text-fg">localStorage</code> on the web, <code className="text-fg">SharedPreferences</code> on Android) and
          are never synced to an account.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Third-party services</h2>
        <p className={P}>
          <strong>Cloudflare:</strong> Hosts the web app, API (Workers), cache (KV), database (D1), and Workers AI (Meta Llama 3.3 70B), which receives move
          summaries and sanitized player names to generate short coach comments.
        </p>
        <p className={P}>
          <strong>Chess.com &amp; Lichess:</strong> When you look up a username or paste a game link, our server fetches publicly available game data from
          Chess.com&rsquo;s Published-Data API or Lichess&rsquo;s public API and caches game lists briefly (5 minutes for lists, 1 hour for single-game links).
        </p>
        <p className={P}>
          <strong>Analytics:</strong> The Android app contains <strong>no</strong> analytics, tracking, or advertising SDKs. The website uses a lightweight,
          self-hosted, cookieless page-view counter (<code className="text-fg">stats.almadih.dev</code>).
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Children&rsquo;s privacy</h2>
        <p className={P}>
          Hindsight is intended for a general audience aged 13 and older. We do not knowingly collect personal information from children under 13.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Removal requests &amp; contact</h2>
        <p className={P}>
          Because Hindsight has no user accounts, there is no account to delete. You can clear locally stored usernames and settings at any time by clearing
          your browser data or Android app storage. If you would like a cached review removed or have privacy questions, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={A}>
            {CONTACT_EMAIL}
          </a>
          . The full source code is available on{" "}
          <a href={REPO_URL} className={A}>
            GitHub
          </a>
          .
        </p>
      </section>
    </ArticleShell>
  );
}
