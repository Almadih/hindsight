"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BadgeIcon } from "@/components/BadgeIcon";
import { Board } from "@/components/Board";
import { EvalBar } from "@/components/EvalBar";
import { EvalGraph } from "@/components/EvalGraph";
import { CoachCard } from "@/components/landing/CoachCard";
import { GameFinder } from "@/components/landing/GameFinder";
import { GameList } from "@/components/landing/GameList";
import { VerdictLadder } from "@/components/landing/VerdictLadder";
import { DEMO } from "@/lib/demo-game";
import { Icon } from "@/components/Icon";
import { BADGE, keyMoments, NOTABLE } from "@/lib/review";
import { playMove, primeSounds } from "@/lib/sfx";
import type { Platform } from "@/lib/api";
import type { GameSummary } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LAST = DEMO.moves.length;
// Tempo: book moves rattle off, ordinary moves stay brisk, verdicts worth reading linger.
const BOOK_MS = 520;
const STEP_MS = 820;
const KEY_MS = 3400;
const END_MS = 5600;
// Reduced motion shows one still frame: the game's most famous moment.
const STILL_PLY = DEMO.moves.findIndex((m) => m.san === "Qb8+") + 1;
// The three coached moments that decided the game, chosen the same way as the review page's Key moments.
const TURNING = keyMoments(DEMO.moves.filter((m) => m.coach), 3);

const SITE = "https://hindsight.almadih.dev";
const APK_URL = "https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk";
const RELEASES_URL = "https://github.com/Almadih/hindsight/releases/latest";
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "Hindsight Chess", url: SITE },
    {
      "@type": "WebApplication",
      name: "Hindsight Chess",
      url: SITE,
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
      author: { "@id": `${SITE}/#author` },
    },
    { "@type": "Person", "@id": `${SITE}/#author`, name: "Almadih", url: "https://almadih.dev", sameAs: ["https://github.com/Almadih"] },
  ],
}).replace(/</g, "\\u003c");

const FAQ = [
  ["Is it really free?", "Yes. Unlimited reviews, no account, no daily cap."],
  ["How do I review a Chess.com game?", "Pick Chess.com, type your username and choose a game."],
  ["Does it work with Lichess?", "Yes, same flow. Lichess users also get verdicts in plain words, not just engine lines."],
  ["Which engine does it use?", "Stockfish 19, run in your browser at depth 16 by default."],
] as const;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function holdFor(ply: number) {
  const m = DEMO.moves[ply - 1];
  if (ply === LAST) return END_MS;
  if (!m) return STEP_MS;
  if (m.badge === "book") return BOOK_MS;
  return NOTABLE.has(m.badge) || m.coach ? KEY_MS : STEP_MS;
}

export default function Home() {
  const router = useRouter();
  const reduced = useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED).matches, () => false);
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const [found, setFound] = useState<{ games: GameSummary[]; username: string; platform: Platform } | null>(null);
  // Off by default every visit; the toggle click doubles as the gesture browsers require before audio.
  const [sound, setSound] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("sound") === "1";
    } catch {
      return false;
    }
  });
  const toggleSound = () => {
    if (!sound) primeSounds();
    const next = !sound;
    setSound(next);
    try {
      sessionStorage.setItem("sound", next ? "1" : "0");
    } catch {}
  };
  const ply = reduced ? STILL_PLY : step;

  useEffect(() => {
    if (reduced || held) return;
    const t = setTimeout(() => setStep((p) => (p >= LAST ? 0 : p + 1)), holdFor(step));
    return () => clearTimeout(t);
  }, [step, held, reduced]);

  const move = ply ? DEMO.moves[ply - 1] : null;
  const lastMoveRef = useRef(move);

  useEffect(() => {
    if (sound && move && lastMoveRef.current !== move) playMove(move);
    lastMoveRef.current = move;
  }, [sound, move]);
  const review = (pgn: string) => {
    sessionStorage.setItem("pgn", pgn);
    router.push("/review");
  };
  const toFinder = () => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    document.getElementById("username")?.focus({ preventScroll: true });
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      <section className="mx-auto grid w-full max-w-[1400px] gap-x-12 gap-y-6 px-4 pt-5 pb-14 sm:px-8 lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:grid-rows-[auto_auto_1fr] lg:pb-8">
        <header className="flex items-baseline justify-between gap-4 lg:col-span-2">
          <Link href="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.04em]">
            {/* Static export serves /brand/mark.svg as-is; next/image would need SVG opt-in for no gain. The text names the link, so the mark is decorative. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.svg" alt="" width={27} height={28} className="self-center" />
            Hindsight
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <Link href="/how-it-works" className="text-sm text-muted hover:text-fg">
              How it works
            </Link>
            <a href={APK_URL} className="text-sm text-muted hover:text-fg">
              Android app
            </a>
            <p className="hidden text-sm text-muted sm:block">Free · No account · Chess.com & Lichess</p>
            <button
              onClick={toggleSound}
              aria-pressed={sound}
              className="flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg aria-pressed:text-fg"
            >
              <Icon name={sound ? "soundOn" : "soundOff"} size={18} />
              {sound ? "Sound on" : "Sound off"}
            </button>
          </div>
        </header>

        <div className="lg:col-start-2 lg:row-start-2 lg:pt-8">
          <h1 className="text-[clamp(2.4rem,5.4vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">Every move, judged.</h1>
          <p className="mt-5 max-w-[34ch] text-lg text-pretty text-muted">
            See where your game turned: every move rated, mistakes explained, the better move on the board.
          </p>
          <p className="mt-3 max-w-[40ch] text-sm text-muted">Free chess game review for Chess.com &amp; Lichess. Unlimited, powered by Stockfish.</p>
        </div>

        <div
          className="relative lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:self-center"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
        >
          <div className="mx-auto flex w-full max-w-[calc(100dvh-7.5rem)] gap-2">
            <EvalBar ev={move ?? DEMO.start} flipped={false} />
            <div className="min-w-0 flex-1 shadow-[0_24px_70px_rgba(0,0,0,0.5)]" aria-label="Demo review of the Opera Game" role="img">
              <Board fen={move?.fen ?? START_FEN} flipped={false} move={move} fx={{ intensity: "epic", prevFen: ply > 1 ? DEMO.moves[ply - 2].fen : START_FEN }} />
            </div>
          </div>
          <div className="relative z-40 mx-auto mt-4 max-w-[calc(100dvh-7.5rem)] lg:absolute lg:inset-x-0 lg:bottom-[5%] lg:mt-0 lg:px-[7%] lg:pl-[calc(7%+2.25rem)]">
            <GameFinder onGames={(games, username, platform) => setFound({ games, username, platform })} onPgn={review} />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4 lg:col-start-2 lg:row-start-3 lg:max-h-[calc(100dvh-22rem)]">
          {found ? (
            <GameList
              games={found.games}
              username={found.username}
              onPick={review}
              onClose={() => setFound(null)}
              playerHref={`/player?p=${found.platform}&u=${encodeURIComponent(found.username)}`}
            />
          ) : (
            <>
              {/* Graph first: the coach card changes height per move, and a control must not move under the cursor. */}
              <EvalGraph
                report={DEMO}
                ply={ply}
                onSelect={(p) => {
                  setStep(p);
                  setHeld(true);
                }}
                className="h-16 shrink-0"
              />
              <CoachCard move={move} totalPlies={LAST} opening={DEMO.opening} />
              <p className="text-sm text-muted">
                A real Hindsight review of the Opera Game: Paul Morphy vs the Duke of Brunswick and Count Isouard, Paris 1858. Accuracy{" "}
                <span className="font-semibold text-fg tabular-nums">{DEMO.accuracy.white}</span> vs{" "}
                <span className="font-semibold text-fg tabular-nums">{DEMO.accuracy.black}</span>. Click the graph to jump.
              </p>
            </>
          )}
        </aside>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em]">Where the game turned</h2>
        <p className="mt-4 max-w-[52ch] text-lg text-pretty text-muted">
          The graph is White&rsquo;s chance of winning, move by move. The review finds the moments that moved it and tells you why.
        </p>
        <EvalGraph report={DEMO} ply={ply} onSelect={(p) => setStep(p)} className="mt-10 h-44 sm:h-56" />
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {TURNING.map((m) => (
            <li key={m.ply} className="border-t-2 pt-5" style={{ borderColor: BADGE[m.badge].color }}>
              <div className="mb-5 max-w-[300px]">
                <Board id={`turning-${m.ply}`} fen={m.fen} flipped={false} move={m} />
              </div>
              <p className="flex items-center gap-3 text-xl font-bold">
                <BadgeIcon badge={m.badge} size={30} />
                <span>
                  <span className="tabular-nums">
                    {Math.ceil(m.ply / 2)}.{m.color === "black" ? ".." : ""}
                  </span>{" "}
                  {m.san} <span style={{ color: BADGE[m.badge].color }}>{BADGE[m.badge].phrase}</span>
                </span>
              </p>
              <p className="mt-3 text-pretty text-fg/85">{m.coach}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="verdicts" className="mx-auto w-full max-w-[1400px] scroll-mt-6 px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em] text-balance">Ten verdicts, one scale</h2>
            <p className="mt-4 max-w-[38ch] text-lg text-pretty text-muted">
              Every move gets one, measured by how much of your winning chances it kept or gave away.
            </p>
          </div>
          <VerdictLadder />
        </div>
      </section>

      <section id="mobile" className="mx-auto w-full max-w-[1400px] scroll-mt-6 px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <div className="flex flex-col items-start justify-between gap-8 rounded-2xl border border-line bg-surface p-8 sm:p-12 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em] text-balance">
              Also on Android
            </h2>
            <p className="mt-4 max-w-[52ch] text-lg text-pretty text-muted">
              Review games on your phone with Stockfish 19, move verdicts, coach notes and retry mode. Free, no account, and opens shared Hindsight links straight in the app.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <a
              href={APK_URL}
              className="inline-flex items-center gap-2.5 rounded-lg bg-accent px-6 py-3.5 text-base font-bold text-[#141311] hover:brightness-110"
            >
              <Icon name="download" size={18} />
              Download Android APK
            </a>
            <a href={RELEASES_URL} className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-fg">
              Latest release on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-16 sm:px-8 lg:pt-28">
        <h2 className="text-[clamp(2rem,3.6vw,3.25rem)] leading-none font-extrabold tracking-[-0.035em]">Questions</h2>
        <div className="mt-8 grid max-w-[60ch] gap-6">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <h3 className="text-xl font-bold">{q}</h3>
              <p className="mt-2 text-pretty text-muted">{a}</p>
            </div>
          ))}
          <div>
            <h3 className="text-xl font-bold">Is there a mobile app?</h3>
            <p className="mt-2 text-pretty text-muted">
              Yes, for Android.{" "}
              <a href={APK_URL} className="underline decoration-line underline-offset-4 hover:text-fg">
                Download the latest APK
              </a>{" "}
              directly from GitHub.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold">How is accuracy calculated?</h3>
            <p className="mt-2 text-pretty text-muted">
              From the winning chances each move loses, checked against Chess.com&rsquo;s own numbers.{" "}
              <Link href="/how-it-works" className="underline decoration-line underline-offset-4 hover:text-fg">
                How it works
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 pt-20 pb-24 sm:px-8 lg:pt-32">
        <div className="flex flex-col items-start gap-8 border-t border-line pt-14 md:flex-row md:items-end md:justify-between">
          <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">Your last game is waiting.</h2>
          <button onClick={toFinder} className="shrink-0 rounded-lg bg-accent px-7 py-4 text-lg font-bold text-[#141311] hover:brightness-110">
            Find my games
          </button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 text-sm text-muted sm:px-8">
        <nav className="mb-4 flex gap-5">
          <Link href="/how-it-works" className="hover:text-fg">
            How it works
          </Link>
          <a href={APK_URL} className="hover:text-fg">
            Android APK
          </a>
          <a href="https://github.com/Almadih/hindsight" className="hover:text-fg">
            GitHub
          </a>
        </nav>
        <p className="mb-2">Built by Almadih.</p>
        <p className="max-w-[80ch] text-pretty">
          Hindsight is an independent project, not affiliated with or endorsed by Chess.com or Lichess. Reviews are shared: once a game has been reviewed, anyone can open
          it. Sounds from Pixabay. Chess pieces: Staunty by sadsnake1,{" "}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" className="underline decoration-line underline-offset-4 hover:text-fg">
            CC BY-NC-SA 4.0
          </a>
          .
        </p>
      </footer>
    </>
  );
}
