// Chess move sounds from Chess.com. Played only after the visitor turns sound on.
type Sound = "move" | "capture" | "castle" | "check" | "promote";

const FILES: Record<Sound, { src: string; volume: number }> = {
  move: { src: "/sfx/move-self.mp3", volume: 0.6 },
  capture: { src: "/sfx/capture.mp3", volume: 0.6 },
  castle: { src: "/sfx/castle.mp3", volume: 0.6 },
  check: { src: "/sfx/move-check.mp3", volume: 0.6 },
  promote: { src: "/sfx/promote.mp3", volume: 0.6 },
};

const cache = new Map<Sound, HTMLAudioElement>();

function play(sound: Sound) {
  const { src, volume } = FILES[sound];
  let el = cache.get(sound);
  if (!el) {
    el = new Audio(src);
    el.volume = volume;
    cache.set(sound, el);
  }
  el.currentTime = 0;
  // Browsers reject play() until the page has had a user gesture; the toggle click is that gesture.
  el.play().catch(() => {});
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

function moveSound(san: string): Sound {
  if (san.includes("=")) return "promote";
  if (san.endsWith("+") || san.endsWith("#")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

/** The sound for one move: plays the matching Chess.com piece movement sound. */
export function playMove(move: { san: string }) {
  play(moveSound(move.san));
}
