"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TabId = "courts" | "matches" | "roster";

const TABS: { id: TabId; label: string }[] = [
  { id: "courts", label: "Courts" },
  { id: "matches", label: "Matches" },
  { id: "roster", label: "Roster" },
];

// Mobile: one panel visible at a time via a tab strip -- the host glances at
// exactly one concern (courts / matches / roster) per tap, with counts on
// each tab so the other two stay legible without switching. All three panels
// stay mounted at all times (visibility toggled with `hidden`, not
// conditional rendering) so in-progress state -- a pending check-in
// transition, a half-built match team selection -- survives a tab switch.
// Desktop (lg+): the tab strip disappears and every panel renders
// side-by-side, since there's room to show court status and roster at once
// without navigation.
export function ManageTabs({
  courtCount,
  matchCount,
  rosterCount,
  courts,
  matches,
  roster,
}: {
  courtCount: number;
  matchCount: number;
  rosterCount: number;
  courts: ReactNode;
  matches: ReactNode;
  roster: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("roster");
  const counts: Record<TabId, number> = { courts: courtCount, matches: matchCount, roster: rosterCount };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Session panels"
        className="grid grid-cols-3 gap-1 rounded-lg border bg-muted p-1 lg:hidden"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors duration-[var(--dur-short)] ease-[var(--ease-out)]",
              active === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{tab.label}</span>
            <span className="text-xs tabular-nums">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

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
    </div>
  );
}
