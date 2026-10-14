const PATHS = {
  first: "M17 18l-6-6 6-6M11 18l-6-6 6-6",
  prev: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  last: "M7 18l6-6-6-6M13 18l6-6-6-6",
  flip: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  back: "M19 12H5M11 18l-6-6 6-6",
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
