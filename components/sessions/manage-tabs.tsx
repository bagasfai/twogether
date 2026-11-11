"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TabId = "courts" | "matches" | "roster" | "photos";

const TABS: { id: TabId; label: string }[] = [
  { id: "courts", label: "Courts" },
  { id: "matches", label: "Matches" },
  { id: "roster", label: "Roster" },
  { id: "photos", label: "Photos" },
];

// Mobile: one panel visible at a time via a tab strip pinned to the bottom of
// the screen (thumb zone, always reachable mid-scroll) -- the host glances at
// exactly one concern (courts / matches / roster) per tap, with counts on
// each tab (courts in use, open matches) so the other two stay legible without switching. All three panels
// stay mounted at all times (visibility toggled with `hidden`, not
// conditional rendering) so in-progress state -- a pending check-in
// transition, a half-built match team selection -- survives a tab switch.
// Desktop (lg+): the tab strip disappears and every panel renders
// side-by-side, since there's room to show court status and roster at once
// without navigation. Photos (review queue, captions, uploads) is wide and
// not glanced at mid-game, so on desktop it sits full width below the grid.
export function ManageTabs({
  courtsInUse,
  courtCount,
  matchCount,
  rosterCount,
  photosCount,
  courts,
  matches,
  roster,
  photos,
}: {
  courtsInUse: number;
  courtCount: number;
  matchCount: number;
  rosterCount: number;
  // Pending photos waiting for review.
  photosCount: number;
  courts: ReactNode;
  matches: ReactNode;
  roster: ReactNode;
  photos: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("roster");
  const counts: Record<TabId, string> = {
    courts: `${courtsInUse}/${courtCount}`,
    matches: String(matchCount),
    roster: String(rosterCount),
    photos: String(photosCount),
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-6">
          <div
            id="panel-courts"
            role="tabpanel"
            aria-labelledby="tab-courts"
            className={cn(active === "courts" ? "block" : "hidden", "lg:block")}
          >
            {courts}
          </div>
          <div
            id="panel-matches"
            role="tabpanel"
            aria-labelledby="tab-matches"
            className={cn(active === "matches" ? "block" : "hidden", "lg:block")}
          >
            {matches}
          </div>
        </div>
        <div
          id="panel-roster"
          role="tabpanel"
          aria-labelledby="tab-roster"
          className={cn(active === "roster" ? "block" : "hidden", "lg:block")}
        >
          {roster}
        </div>
      </div>

      <div
        id="panel-photos"
        role="tabpanel"
        aria-labelledby="tab-photos"
        className={cn(active === "photos" ? "block" : "hidden", "lg:block lg:border-t lg:pt-6")}
      >
        {photos}
      </div>

      <div
        role="tablist"
        aria-label="Session panels"
        className="sticky bottom-3 z-20 grid grid-cols-4 gap-1 rounded-2xl border bg-sky-pale p-1 shadow-bar lg:hidden"
        onKeyDown={onTabKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring transition-colors duration-[var(--dur-short)] ease-[var(--ease-out)]",
              active === tab.id
                ? "bg-navy text-white shadow-sm"
                : "text-navy hover:bg-white/70"
            )}
          >
            <span>{tab.label}</span>
            <span className="text-xs tabular-nums">{counts[tab.id]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
