"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { debounce } from "@/lib/realtime/debounce";

const DEBOUNCE_MS = 300;

// Invisible. Subscribes to Postgres changes for this session's dashboard
// tables and debounce-refreshes the server component on any change, so the
// host manage page stays live across multiple hosts/devices without a
// manual reload. See docs/superpowers/specs/2026-09-13-live-session-dashboard-design.md
// for why this refetches instead of patching client state, and why
// match_players isn't subscribed directly.
//
// One channel per table, not one channel with four `.on()` registrations:
// combining the `matches` table's session_id filter with the other three on
// a single channel triggers an async "invalid column for filter session_id"
// error from Supabase Realtime, even though matches.session_id is a real,
// granted, published column -- a standalone single-table channel for
// matches subscribes cleanly. Splitting into four channels avoids the
// combination entirely.
export function SessionRealtimeWatcher({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = debounce(() => router.refresh(), DEBOUNCE_MS);

    const channels = [
      supabase
        .channel(`session:${sessionId}:dashboard:sessions`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
          refresh,
        )
        .subscribe(),
      supabase
        .channel(`session:${sessionId}:dashboard:participants`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
          refresh,
        )
        .subscribe(),
      supabase
        .channel(`session:${sessionId}:dashboard:courts`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "courts", filter: `session_id=eq.${sessionId}` },
          refresh,
        )
        .subscribe(),
      supabase
        .channel(`session:${sessionId}:dashboard:matches`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${sessionId}` },
          refresh,
        )
        .subscribe(),
    ];

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [sessionId, router]);

  return null;
}
