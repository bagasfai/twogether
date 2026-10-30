import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type ShareSession = {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  courtCount: number;
  price: number | null;
};

export type ShareParticipant = {
  fullName: string;
  status: ParticipantStatus;
  paidAt: string | null;
};

// This runs inside a Server Action (see getSessionShareText in
// lib/actions/sessions.ts), not the browser -- the server process is UTC on
// Vercel (see createSession's comment in lib/actions/sessions.ts), so an
// implicit-local-zone formatter would render the wrong wall-clock time for
// this Jakarta-based community. Every formatter below pins Asia/Jakarta
// explicitly instead of relying on the runtime's default zone.
const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" });
const DAY_MONTH = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
// en-GB, not id-ID: id-ID renders a dot separator ("09.00"); the source
// format this reproduces uses a colon ("09:00").
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});
const PRICE = new Intl.NumberFormat("id-ID");

function courtLetters(count: number): string {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index)).join(" , ");
}

function numbered(entries: ShareParticipant[], withCheckmark: boolean): string[] {
  return entries.map((entry, index) => {
    const check = withCheckmark && entry.paidAt !== null ? " ✅" : "";
    return `${index + 1}. ${entry.fullName}${check}`;
  });
}

export function buildWhatsAppShareText(session: ShareSession, roster: ShareParticipant[]): string {
  const starts = new Date(session.startsAt);
  const ends = new Date(session.endsAt);

  const lines: string[] = [
    `${WEEKDAY.format(starts)} ${DAY_MONTH.format(starts)}`.toUpperCase(),
    `🕑 ${TIME.format(starts)} - ${TIME.format(ends)}`,
    `📍${session.location}`,
    `LAP. ${courtLetters(session.courtCount)}`,
  ];

  if (session.price !== null) {
    lines.push(`💰${PRICE.format(session.price)}`);
  }

  lines.push("", "LIST NAMA");
  // Filtering to exactly "confirmed"/"waiting_list" here is what excludes
  // cancelled rows -- no separate cancelled-status branch needed.
  lines.push(...numbered(roster.filter((entry) => entry.status === "confirmed"), true));

  const waiting = roster.filter((entry) => entry.status === "waiting_list");
  if (waiting.length > 0) {
    lines.push("", "OPEN WL:");
    lines.push(...numbered(waiting, false));
  }

  return lines.join("\n");
}
