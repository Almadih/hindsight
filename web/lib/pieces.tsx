import type { PieceRenderObject } from "react-chessboard";

const CODES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];

/** Staunty by sadsnake1 (CC BY-NC-SA 4.0, see public/pieces/staunty/LICENSE.md); credited in the site footer. */
export const PIECES: PieceRenderObject = Object.fromEntries(
  CODES.map((code) => [
    code,
    // eslint-disable-next-line @next/next/no-img-element -- static SVGs; next/image adds nothing in a static export
    () => <img src={`/pieces/staunty/${code}.svg`} alt="" draggable={false} className="pointer-events-none size-full select-none" />,
  ]),
);
