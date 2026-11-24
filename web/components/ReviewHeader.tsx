"use client";

import Link from "next/link";
import { useState } from "react";
import { readQuality, type AnalysisQuality } from "@/lib/engine/pool";
import { originalGameUrl } from "@/lib/review";
import type { Report, Side } from "@/lib/types";
import { Icon } from "./Icon";

type Props = {
  report: Report;
  names: Record<Side, string>;
  me: Side | null;
  myName: string | null;
  platform: "chesscom" | "lichess" | null;
  shared: boolean;
  shareUrl?: string;
  sound: boolean;
  onToggleSound: () => void;
  onReanalyze: () => void;
};

/** Review sidebar header: navigation, share/sound actions, game title, opening, and analysis depth toolbar. */
export function ReviewHeader({ report, names, me, myName, platform, shared, shareUrl, sound, onToggleSound, onReanalyze }: Props) {
  const { headers } = report;
  const origin = originalGameUrl(headers);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const [quality, setQuality] = useState<AnalysisQuality>(readQuality);

  const copyLink = async () => {
    if (!shareUrl) return;
    let ok = false;
    try {
      // writeText can hang rather than reject (hidden tab, pending permission), so cap the wait.
      await Promise.race([
        navigator.clipboard.writeText(shareUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 1000)),
      ]);
      ok = true;
    } catch {
      // Clipboard API refused or stalled (no focus, no permission, insecure context): fall back to a selected textarea.
      const area = Object.assign(document.createElement("textarea"), { value: shareUrl });
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    }
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2500);
  };

  return (
    <header className="order-4 flex flex-col gap-3 lg:order-none">
      {/* Top Utility Row: Navigation & Actions */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded py-1 text-xs font-medium text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          aria-label="Review another game"
          title="Review another game"
        >
          <Icon name="back" size={14} />
          <span>New review</span>
        </Link>

        <div className="flex items-center gap-1">
          {origin && (
            <a
              href={origin.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded bg-raised/60 hover:bg-raised px-2 py-1 text-xs font-medium text-muted hover:text-fg border border-line/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              title={`View original game on ${origin.label}`}
              aria-label={`View original game on ${origin.label}`}
            >
              <Icon name="external" size={14} />
              <span>{origin.label}</span>
            </a>
          )}
          {shareUrl && (
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded bg-raised/60 hover:bg-raised px-2 py-1 text-xs font-medium text-muted hover:text-fg border border-line/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              aria-live="polite"
              title="Copy link to review"
            >
              <Icon name="link" size={14} />
              <span>{{ idle: "Share", copied: "Copied!", failed: "Failed" }[copyState]}</span>
            </button>
          )}
          <button
            onClick={onToggleSound}
            aria-pressed={sound}
            aria-label={sound ? "Sound on" : "Sound off"}
            title={sound ? "Sound on (S)" : "Sound off (S)"}
            className="inline-flex items-center justify-center rounded bg-raised/60 hover:bg-raised p-1 text-muted hover:text-fg border border-line/50 transition-colors aria-pressed:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Icon name={sound ? "soundOn" : "soundOff"} size={14} />
          </button>
        </div>
      </div>

      {/* Game Heading & Result */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2.5">
          <h1 className="min-w-0 flex-1 text-base font-semibold leading-snug text-fg text-pretty">
            {names.white} <span className="text-muted/60 font-normal text-xs">vs</span> {names.black}
          </h1>
          {headers.Result && headers.Result !== "*" && (
            <span
              className="shrink-0 rounded bg-raised px-2 py-0.5 font-mono text-xs font-semibold text-fg border border-line/60 tracking-wider"
              title={`Result: ${headers.Result}`}
            >
              {headers.Result}
            </span>
          )}
        </div>

        {/* Opening Title */}
        <div className="flex items-start gap-1.5 text-xs text-muted" title={report.opening ?? undefined}>
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b39572]" aria-hidden="true" />
          <p className="text-pretty break-words leading-snug">
            {report.opening ?? "Unknown opening"}
          </p>
        </div>

        {/* Player affiliation if detected */}
        {me && (
          <p className="pl-3 text-xs text-muted">
            You played <span className="font-medium text-fg">{me === "white" ? "White" : "Black"}</span>
            {platform && myName && (
              <>
                <span className="text-line" aria-hidden="true"> · </span>
                <Link
                  href={`/player?p=${platform}&u=${encodeURIComponent(myName)}`}
                  className="font-medium text-accent hover:underline"
                >
                  Your player page
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {/* Analysis & Engine Depth Toolbar */}
      <div className="flex flex-col gap-1.5 rounded-md bg-raised/40 p-2 text-xs border border-line/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${!shared ? "bg-accent" : "bg-muted"}`}
              aria-hidden="true"
            />
            <span className="truncate text-muted">
              {!shared ? "Analyzed in browser" : "Shared review"}
            </span>
          </div>
          {!shared ? (
            <button
              onClick={onReanalyze}
              className="shrink-0 font-medium text-accent hover:underline text-xs"
              title="Re-run engine analysis on this game"
            >
              Re-analyze
            </button>
          ) : !confirmReanalyze ? (
            <button
              onClick={() => setConfirmReanalyze(true)}
              className="shrink-0 font-medium text-fg underline decoration-line underline-offset-2 hover:decoration-fg text-xs"
            >
              Check in browser
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line/40 pt-1.5">
          <label htmlFor="analysis-quality" className="text-muted text-[11px]">
            Engine depth
          </label>
          <select
            id="analysis-quality"
            value={quality}
            onChange={(e) => {
              const q = e.target.value as AnalysisQuality;
              setQuality(q);
              try {
                localStorage.setItem("hindsight_quality", q);
              } catch {}
            }}
            className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-fg border border-line hover:border-line focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="quick">Quick (depth 14)</option>
            <option value="standard">Standard (depth 16)</option>
            <option value="deep">Deep (depth 18)</option>
          </select>
        </div>
      </div>

      {shared && confirmReanalyze && (
        <div className="rounded-md bg-raised p-2.5 text-xs text-muted border border-line space-y-1.5">
          <p>Run your own analysis? It takes about a minute and counts toward today’s limit.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onReanalyze}
              className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-[#141311] hover:brightness-110"
            >
              Yes, re-analyze
            </button>
            <button
              onClick={() => setConfirmReanalyze(false)}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-line text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
