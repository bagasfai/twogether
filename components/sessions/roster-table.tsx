"use client";

import { useId, useState, useTransition } from "react";
import { Check, Ellipsis, Search } from "lucide-react";
import { toast } from "sonner";
import { AddParticipantDialog } from "@/components/sessions/add-participant-dialog";
import { PlayerAttributesEditor } from "@/components/sessions/player-attributes-editor";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmActionButton } from "@/components/sessions/confirm-action-button";
import { ReplaceSeatDialog } from "@/components/sessions/replace-seat-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setCheckedIn, setNoShow, setPaid, setParticipantStatus } from "@/lib/actions/participants";
import type { PlayerAttributes } from "@/lib/players/resolve";
import { amountOwed, payerUserId } from "@/lib/sessions/amount-owed";
import type { SessionKind } from "@/lib/dal/sessions";
import { cn } from "@/lib/utils";
// types/supabase.ts is a plain generated types module (no server-only guard),
// safe to import for real (not type-only) in a client component. Deriving
// from the enum here, rather than hand-copying the union, means a status
// added or removed in the database fails this file at compile time instead of
// silently drifting from lib/dal/participants.ts's RosterEntry type.
import type { Database } from "@/types/supabase";
import { formatDateTime } from "@/lib/format/datetime";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

type Entry = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  paidAt: string | null;
  noShowAt: string | null;
  addedBy: string | null;
  consentedAt: string | null;
  fullName: string | null;
  isGuest: boolean;
  userId: string | null;
  isPremium: boolean;
  bumpedAt: string | null;
  replacedBy: string | null;
  paidByUserId: string | null;
  paidByName: string | null;
};

const rupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

// "paid by X" shows only when a seat hand-off left someone other than the seat
// holder paying (paid_by_user_id set). Owed is the surcharge for a premium
// entry, the session price otherwise.
function OwedLine({
  entry,
  pricing,
}: {
  entry: Entry;
  pricing: { price: number; premiumSurchargeIdr: number };
}) {
  const payerId = payerUserId(entry);
  const differentPayer = payerId !== null && payerId !== entry.userId;
  const owed = entry.status === "confirmed" ? amountOwed(pricing, entry) : 0;
  if (owed === 0 && !differentPayer) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {owed > 0 ? <span className="tabular-nums">{rupiah(owed)}</span> : null}
      {differentPayer ? (
        <span className="text-muted-foreground">paid by {entry.paidByName ?? "another member"}</span>
      ) : null}
    </div>
  );
}

function cancelCopy(entry: Entry, inMatch: boolean) {
  const name = entry.fullName ?? "this player";
  const notes: string[] = [];
  if (inMatch) notes.push(`${name} is in a scheduled or in-progress match. Check that match first.`);
  else if (entry.checkedInAt) notes.push(`${name} is already checked in.`);
  notes.push(
    entry.status === "confirmed"
      ? "Their seat opens up and the first person on the waitlist is confirmed automatically."
      : "They are removed from the waitlist.",
  );
  return { title: `Cancel ${name}?`, description: notes.join(" ") };
}

function StatusBadge({ status }: { status: ParticipantStatus }) {
  if (status === "confirmed") return <Badge variant="success">Confirmed</Badge>;
  if (status === "waiting_list") return <Badge variant="warning">Waitlist</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
}

// A host can see this participant on the roster the moment they're added,
// but profiles_private_select_self_admin_or_host withholds their phone until
// consentedAt is set -- see docs/superpowers/core-schema-follow-ups.md. This
// badge is the roster's only signal of that state; nothing here reads phone.
function ConsentBadge({ addedBy, consentedAt }: { addedBy: string | null; consentedAt: string | null }) {
  if (addedBy === null || consentedAt !== null) return null;
  return <Badge variant="outline">Awaiting their confirmation</Badge>;
}

// Guests are brought by a member and have no account -- see
// register_guest_for_session in the guest-participants migration.
function GuestBadge({ isGuest }: { isGuest: boolean }) {
  if (!isGuest) return null;
  return <Badge variant="outline">Guest</Badge>;
}

function PremiumBadges({ isPremium, bumpedAt }: { isPremium: boolean; bumpedAt: string | null }) {
  return (
    <>
      {isPremium ? <Badge variant="success">Premium</Badge> : null}
      {bumpedAt !== null ? <Badge variant="warning">Bumped</Badge> : null}
    </>
  );
}

type Actions = {
  pending: boolean;
  busyIds: Set<string>;
  sessionId: string;
  sessionKind: SessionKind;
  sessionStatus: Database["public"]["Enums"]["session_status"];
  change: (participantId: string, status: Entry["status"]) => void;
  toggleCheckedIn: (participantId: string, checkedIn: boolean) => void;
  togglePaid: (participantId: string, paid: boolean) => void;
  toggleNoShow: (participantId: string, noShow: boolean) => void;
};

type Filter = "all" | "waiting" | "not_checked_in" | "checked_in";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "not_checked_in", label: "Not checked in" },
  { id: "checked_in", label: "Checked in" },
  { id: "waiting", label: "Waitlist" },
];

function matchesFilter(entry: Entry, filter: Filter) {
  if (filter === "waiting") return entry.status === "waiting_list";
  if (filter === "checked_in") return entry.checkedInAt !== null;
  if (filter === "not_checked_in") return entry.status === "confirmed" && entry.checkedInAt === null;
  return true;
}

function StateBadges({ entry }: { entry: Entry }) {
  return (
    <>
      {entry.checkedInAt ? (
        <Badge variant="outline" className="border-sky-deep/50 text-accent-text">
          <Check className="size-3" aria-hidden="true" />
          Checked in
        </Badge>
      ) : null}
      {entry.paidAt ? <Badge variant="success">Paid</Badge> : null}
      {entry.noShowAt ? <Badge variant="warning">No-show</Badge> : null}
    </>
  );
}

// One main action per row (Check in, or Confirm for someone not yet in), then
// "More" for everything else, so a misfire near the thumb costs nothing.
function RowActions({ entry, actions, card }: { entry: Entry; actions: Actions; card: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { pending, sessionId, sessionKind, sessionStatus, change, toggleCheckedIn, togglePaid, toggleNoShow } = actions;
  const size = card ? "h-11" : "";
  const confirmed = entry.status === "confirmed";
  const inMatch = actions.busyIds.has(entry.id);

  return (
    <div className={cn("flex flex-col gap-2", !card && "items-end")}>
      <div className="flex gap-2">
        {confirmed ? (
          entry.checkedInAt ? (
            <Button size="sm" variant="outline" disabled={pending} className={cn(size, card && "flex-1")} onClick={() => toggleCheckedIn(entry.id, false)}>
              Undo check-in
            </Button>
          ) : (
            <Button size="sm" disabled={pending} className={cn(size, card && "flex-1")} onClick={() => toggleCheckedIn(entry.id, true)}>
              Check in
            </Button>
          )
        ) : (
          <Button size="sm" disabled={pending} className={cn(size, card && "flex-1")} onClick={() => change(entry.id, "confirmed")}>
            Confirm
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className={cn(card ? "size-11" : "")}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`More actions for ${entry.fullName ?? "player"}`}
          onClick={() => setOpen((v) => !v)}
        >
          <Ellipsis aria-hidden="true" />
          {card ? null : <span>More</span>}
        </Button>
      </div>

      <div id={panelId} hidden={!open} className="flex flex-wrap gap-2">
        {confirmed ? (
          entry.paidAt ? (
            <Button size="sm" variant="outline" disabled={pending} className={cn(size, card && "flex-1 basis-32")} onClick={() => togglePaid(entry.id, false)}>
              Undo paid
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} className={cn(size, card && "flex-1 basis-32")} onClick={() => togglePaid(entry.id, true)}>
              Mark paid
            </Button>
          )
        ) : null}
        {sessionStatus === "completed" && confirmed ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            className={cn(size, card && "flex-1 basis-32")}
            onClick={() => toggleNoShow(entry.id, !entry.noShowAt)}
          >
            {entry.noShowAt ? "Undo no-show" : "Mark no-show"}
          </Button>
        ) : null}
        {entry.status !== "waiting_list" ? (
          <Button size="sm" variant="outline" disabled={pending} className={cn(size, card && "flex-1 basis-32")} onClick={() => change(entry.id, "waiting_list")}>
            Move to waitlist
          </Button>
        ) : null}
        {confirmed ? (
          <ReplaceSeatDialog
            participantId={entry.id}
            sessionKind={sessionKind}
            sessionId={sessionId}
            triggerLabel="Replace"
            triggerClassName={card ? "h-11 flex-1 basis-32" : undefined}
            isHost
          />
        ) : null}
        {entry.status !== "cancelled" ? (
          <ConfirmActionButton
            label="Cancel player"
            {...cancelCopy(entry, inMatch)}
            confirmLabel="Cancel player"
            disabled={pending}
            className={cn(size, "text-destructive-text", card && "flex-1 basis-32")}
            onConfirm={() => change(entry.id, "cancelled")}
          />
        ) : null}
      </div>
    </div>
  );
}

export function RosterTable({
  sessionId,
  entries,
  sessionStatus,
  attributes,
  sessionKind,
  price,
  premiumSurchargeIdr,
  busyParticipantIds,
}: {
  sessionId: string;
  entries: Entry[];
  sessionKind: SessionKind;
  /** null (free session) is treated as 0 */
  price: number | null;
  premiumSurchargeIdr: number;
  // Host-only data keyed by participant id (a Map cannot cross the
  // server/client boundary). Supplied only by the host manage page.
  attributes: Record<string, PlayerAttributes>;
  sessionStatus: Database["public"]["Enums"]["session_status"];
  /** participants in a scheduled or in-progress match */
  busyParticipantIds: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const pricing = { price: price ?? 0, premiumSurchargeIdr };

  const run = (task: () => Promise<{ ok: boolean; message?: string }>, success: string) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(success);
      else toast.error(result.message ?? "Something went wrong. Try again.");
    });

  const actions: Actions = {
    pending,
    busyIds: new Set(busyParticipantIds),
    sessionId,
    sessionKind,
    sessionStatus,
    change: (participantId, status) => run(() => setParticipantStatus(participantId, sessionId, status), "Participant updated"),
    toggleCheckedIn: (participantId, checkedIn) =>
      run(() => setCheckedIn(participantId, sessionId, checkedIn), checkedIn ? "Checked in" : "Check-in undone"),
    togglePaid: (participantId, paid) => run(() => setPaid(participantId, sessionId, paid), paid ? "Marked paid" : "Payment undone"),
    toggleNoShow: (participantId, noShow) =>
      run(() => setNoShow(participantId, sessionId, noShow), noShow ? "Marked no-show" : "No-show undone"),
  };

  const needle = query.trim().toLowerCase();
  // Who still needs attention comes first: confirmed and not yet in, then the
  // waitlist, then checked in, then cancelled. Array.sort is stable.
  const rank = (entry: Entry) =>
    entry.status === "cancelled" ? 3 : entry.checkedInAt ? 2 : entry.status === "waiting_list" ? 1 : 0;
  const visible = entries
    .filter((entry) => matchesFilter(entry, filter) && (needle === "" || (entry.fullName ?? "").toLowerCase().includes(needle)))
    .sort((a, b) => rank(a) - rank(b));
  const countFor = (id: Filter) => entries.filter((entry) => matchesFilter(entry, id)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">
          Roster <span className="tabular-nums text-muted-foreground">({entries.length})</span>
        </h2>
        <AddParticipantDialog sessionId={sessionId} />
      </div>

      {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has registered yet.</p> : null}

      {entries.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              inputMode="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a player"
              aria-label="Find a player"
              className="h-11 pl-9 md:h-9"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter roster">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold outline-none transition-colors duration-[var(--dur-micro)] focus-visible:ring-[3px] focus-visible:ring-ring md:min-h-9",
                  filter === f.id ? "border-navy bg-navy text-white" : "border-border bg-card text-navy hover:bg-sky-pale",
                )}
              >
                {f.label}
                <span className="tabular-nums opacity-80">{countFor(f.id)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {entries.length > 0 && visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          No players match{needle ? ` "${query.trim()}"` : ""}
          {filter !== "all" ? " in this filter" : ""}.{" "}
          <button
            type="button"
            className="font-semibold text-accent-text underline underline-offset-4"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear search
          </button>
        </p>
      ) : null}

      {/* Mobile / tablet: one card per participant. Name and state first, one
          main action, everything else behind More. */}
      <ul className={cn("flex-col gap-2 md:hidden", visible.length > 0 ? "flex" : "hidden")}>
        {visible.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border p-3",
              entry.checkedInAt && "border-sky-deep/40 bg-sky-pale"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{entry.fullName ?? "Unnamed player"}</span>
              <StatusBadge status={entry.status} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StateBadges entry={entry} />
              <PremiumBadges isPremium={entry.isPremium} bumpedAt={entry.bumpedAt} />
              <GuestBadge isGuest={entry.isGuest} />
              <ConsentBadge addedBy={entry.addedBy} consentedAt={entry.consentedAt} />
            </div>
            <OwedLine entry={entry} pricing={pricing} />
            <RowActions entry={entry} actions={actions} card />
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Gender and level
              </summary>
              <PlayerAttributesEditor
                participantId={entry.id}
                userId={entry.userId}
                isGuest={entry.isGuest}
                attributes={attributes[entry.id]}
              />
            </details>
          </li>
        ))}
      </ul>

      {/* Desktop: compact table sized for the ~564px half-width column on the
          manage page. */}
      <Table className={cn("hidden", visible.length > 0 && "md:table")}>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead>Owed</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((entry) => (
            <TableRow key={entry.id} className={entry.checkedInAt ? "bg-accent/5" : undefined}>
              <TableCell className="whitespace-normal">
                <div className="mb-1 font-medium">{entry.fullName ?? "Unnamed player"}</div>
                <PlayerAttributesEditor
                  compact
                  participantId={entry.id}
                  userId={entry.userId}
                  isGuest={entry.isGuest}
                  attributes={attributes[entry.id]}
                />
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={entry.status} />
                  <StateBadges entry={entry} />
                  <PremiumBadges isPremium={entry.isPremium} bumpedAt={entry.bumpedAt} />
                  <GuestBadge isGuest={entry.isGuest} />
                  <ConsentBadge addedBy={entry.addedBy} consentedAt={entry.consentedAt} />
                </div>
              </TableCell>
              <TableCell className="whitespace-normal text-xs text-muted-foreground">{formatDateTime(entry.registeredAt)}</TableCell>
              <TableCell className="whitespace-normal">
                <OwedLine entry={entry} pricing={pricing} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <RowActions entry={entry} actions={actions} card={false} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
