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
export function SessionRealtimeWatcher({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = debounce(() => router.refresh(), DEBOUNCE_MS);

    const channel = supabase
      .channel(`session:${sessionId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courts", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, router]);

  return null;
}
