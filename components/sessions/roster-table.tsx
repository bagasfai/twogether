"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AddParticipantDialog } from "@/components/sessions/add-participant-dialog";
import { PlayerAttributesEditor } from "@/components/sessions/player-attributes-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setCheckedIn, setNoShow, setPaid, setParticipantStatus } from "@/lib/actions/participants";
import type { PlayerAttributes } from "@/lib/players/resolve";
import { cn } from "@/lib/utils";
// types/supabase.ts is a plain generated types module (no server-only guard),
// safe to import for real (not type-only) in a client component. Deriving
// from the enum here, rather than hand-copying the union, means a status
// added or removed in the database fails this file at compile time instead of
// silently drifting from lib/dal/participants.ts's RosterEntry type.
import type { Database } from "@/types/supabase";

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
};

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

export function RosterTable({
  sessionId,
  entries,
  sessionStatus,
  attributes,
}: {
  sessionId: string;
  entries: Entry[];
  // Host-only data keyed by participant id (a Map cannot cross the
  // server/client boundary). Supplied only by the host manage page.
  attributes: Record<string, PlayerAttributes>;
  sessionStatus: Database["public"]["Enums"]["session_status"];
}) {
  const [pending, startTransition] = useTransition();

  const change = (participantId: string, status: Entry["status"]) =>
    startTransition(async () => {
      const result = await setParticipantStatus(participantId, sessionId, status);
      if (result.ok) toast.success("Participant updated");
      else toast.error(result.message);
    });

  const toggleCheckedIn = (participantId: string, checkedIn: boolean) =>
    startTransition(async () => {
      const result = await setCheckedIn(participantId, sessionId, checkedIn);
      if (result.ok) toast.success(checkedIn ? "Checked in" : "Check-in undone");
      else toast.error(result.message);
    });

  const togglePaid = (participantId: string, paid: boolean) =>
    startTransition(async () => {
      const result = await setPaid(participantId, sessionId, paid);
      if (result.ok) toast.success(paid ? "Marked paid" : "Payment undone");
      else toast.error(result.message);
    });

  const toggleNoShow = (participantId: string, noShow: boolean) =>
    startTransition(async () => {
      const result = await setNoShow(participantId, sessionId, noShow);
      if (result.ok) toast.success(noShow ? "Marked no-show" : "No-show undone");
      else toast.error(result.message);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Roster <span className="font-mono tabular-nums text-muted-foreground">({entries.length})</span>
        </h2>
        <AddParticipantDialog sessionId={sessionId} />
      </div>

      {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has registered yet.</p> : null}

      {/* Mobile / tablet: one card per participant, all columns re-flowed
          into stacked rows so nothing needs horizontal scrolling. A left
          accent bar marks the checked-in pool without merging it into the
          registration-status column. */}
      <ul className={cn("flex-col gap-2 md:hidden", entries.length > 0 ? "flex" : "hidden")}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3",
              entry.checkedInAt && "border-l-4 border-l-accent"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{entry.fullName ?? "Unnamed player"}</span>
              <div className="flex items-center gap-1.5">
                <PremiumBadges isPremium={entry.isPremium} bumpedAt={entry.bumpedAt} />
                <GuestBadge isGuest={entry.isGuest} />
                <ConsentBadge addedBy={entry.addedBy} consentedAt={entry.consentedAt} />
                <StatusBadge status={entry.status} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Registered {new Date(entry.registeredAt).toLocaleString()}
            </p>

            <PlayerAttributesEditor
                participantId={entry.id}
                userId={entry.userId}
                isGuest={entry.isGuest}
                attributes={attributes[entry.id]}
              />

            <div className="flex flex-wrap gap-2">
              {entry.status === "confirmed" ? (
                entry.checkedInAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => toggleCheckedIn(entry.id, false)}
                  >
                    Undo check-in
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => toggleCheckedIn(entry.id, true)}
                  >
                    Check in
                  </Button>
                )
              ) : null}
              {entry.status === "confirmed" ? (
                entry.paidAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => togglePaid(entry.id, false)}
                  >
                    Undo paid
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => togglePaid(entry.id, true)}
                  >
                    Mark paid
                  </Button>
                )
              ) : null}
              {sessionStatus === "completed" && entry.status === "confirmed" ? (
                entry.noShowAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => toggleNoShow(entry.id, false)}
                  >
                    Undo no-show
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="h-11 flex-1 basis-32"
                    onClick={() => toggleNoShow(entry.id, true)}
                  >
                    Mark no-show
                  </Button>
                )
              ) : null}
              {entry.status !== "confirmed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  className="h-11 flex-1 basis-32"
                  onClick={() => change(entry.id, "confirmed")}
                >
                  Confirm
                </Button>
              ) : null}
              {entry.status !== "waiting_list" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  className="h-11 flex-1 basis-32"
                  onClick={() => change(entry.id, "waiting_list")}
                >
                  Waitlist
                </Button>
              ) : null}
              {entry.status !== "cancelled" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  className="h-11 flex-1 basis-32"
                  onClick={() => change(entry.id, "cancelled")}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: compact table sized for the ~564px half-width column on the
          manage page. Gender/level sits under the name; check-in, paid,
          no-show and override share one wrapping actions cell. */}
      <Table className={cn("hidden", entries.length > 0 && "md:table")}>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
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
                  <PremiumBadges isPremium={entry.isPremium} bumpedAt={entry.bumpedAt} />
                  <GuestBadge isGuest={entry.isGuest} />
                  <ConsentBadge addedBy={entry.addedBy} consentedAt={entry.consentedAt} />
                </div>
              </TableCell>
              <TableCell className="whitespace-normal text-xs text-muted-foreground">{new Date(entry.registeredAt).toLocaleString()}</TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {entry.status === "confirmed" ? (
                    entry.checkedInAt ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleCheckedIn(entry.id, false)}>
                        Undo check-in
                      </Button>
                    ) : (
                      <Button size="sm" disabled={pending} onClick={() => toggleCheckedIn(entry.id, true)}>
                        Check in
                      </Button>
                    )
                  ) : null}
                  {entry.status === "confirmed" ? (
                    entry.paidAt ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => togglePaid(entry.id, false)}>
                        Undo paid
                      </Button>
                    ) : (
                      <Button size="sm" disabled={pending} onClick={() => togglePaid(entry.id, true)}>
                        Mark paid
                      </Button>
                    )
                  ) : null}
                  {sessionStatus === "completed" && entry.status === "confirmed" ? (
                    entry.noShowAt ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleNoShow(entry.id, false)}>
                        Undo no-show
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleNoShow(entry.id, true)}>
                        Mark no-show
                      </Button>
                    )
                  ) : null}
                              {entry.status !== "confirmed" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "confirmed")}>
                    Confirm
                  </Button>
                ) : null}
                {entry.status !== "waiting_list" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "waiting_list")}>
                    Waitlist
                  </Button>
                ) : null}
                {entry.status !== "cancelled" ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => change(entry.id, "cancelled")}>
                    Cancel
                  </Button>
                ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
