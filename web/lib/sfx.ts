import type { Badge } from "./types";

// Pixabay sound effects (public/sfx/LICENSE.md). Played only after the visitor turns sound on.
type Sound = "move" | "capture" | "check" | "good" | "bad" | "mate" | "fanfare";

const FILES: Record<Sound, { src: string; volume: number }> = {
  move: { src: "/sfx/click-soft.mp3", volume: 0.5 },
  capture: { src: "/sfx/click.mp3", volume: 0.7 },
  check: { src: "/sfx/ping.mp3", volume: 0.45 },
  good: { src: "/sfx/sparkle.mp3", volume: 0.5 },
  bad: { src: "/sfx/impact-bass-1.mp3", volume: 0.55 },
  mate: { src: "/sfx/impact-bass-2.mp3", volume: 0.7 },
  fanfare: { src: "/sfx/chime.mp3", volume: 0.45 },
};

const cache = new Map<Sound, HTMLAudioElement>();

function play(sound: Sound, delayMs = 0) {
  const { src, volume } = FILES[sound];
  let el = cache.get(sound);
  if (!el) {
    el = new Audio(src);
    el.volume = volume;
    cache.set(sound, el);
  }
  const start = () => {
    el.currentTime = 0;
    // Browsers reject play() until the page has had a user gesture; the toggle click is that gesture.
    el.play().catch(() => {});
  };
  if (delayMs) setTimeout(start, delayMs);
  else start();
}

/** Load every file now (on the toggle click) so the first move doesn't play late. */
export function primeSounds() {
  for (const sound of Object.keys(FILES) as Sound[]) {
    if (!cache.has(sound)) {
      const el = new Audio(FILES[sound].src);
      el.volume = FILES[sound].volume;
      el.preload = "auto";
      cache.set(sound, el);
    }
  }
}

/** The sound for one move: the piece hitting the board, then the verdict on top. */
export function playMove(move: { san: string; badge: Badge }) {
  const mate = move.san.endsWith("#");
  play(move.san.includes("x") ? "capture" : "move");
  if (mate) {
    play("mate", 120);
    play("fanfare", 450);
  } else if (move.san.endsWith("+")) play("check", 90);
  if (move.badge === "brilliant" || move.badge === "great") play("good", 140);
  else if (move.badge === "blunder" || move.badge === "mistake" || move.badge === "miss") play("bad", 100);
}
