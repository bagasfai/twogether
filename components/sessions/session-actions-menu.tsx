"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionForm } from "@/components/sessions/session-form";
import { cancelSession, getSessionShareText } from "@/lib/actions/sessions";
import type { HostedSession } from "@/lib/dal/sessions";

// Editing only makes sense pre-lifecycle -- SessionForm's own status field
// only offers draft/scheduled (see its comment), so a 'live'/'completed'
// session has no valid option to preselect. Cancelling a session that's
// already cancelled/completed is a no-op the menu shouldn't offer.
function canEdit(status: HostedSession["status"]): boolean {
  return status === "draft" || status === "scheduled";
}

function canCancel(status: HostedSession["status"]): boolean {
  return status !== "cancelled" && status !== "completed";
}

export function SessionActionsMenu({
  session,
  showManageLink = true,
}: {
  session: HostedSession;
  showManageLink?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Uses navigator.clipboard.write with a ClipboardItem whose value is a
  // Promise<string>, rather than writeText after an awaited
  // getSessionShareText round-trip. Safari/WebKit only allows
  // clipboard writes inside the task derived from the user's click gesture
  // -- awaiting the server call first would let that transient activation
  // expire before writeText ever ran, silently failing on iOS Safari. The
  // clipboard API call below happens synchronously (before any await), so
  // the gesture is still active; only the text itself resolves later.
  const copyShareText = () =>
    startTransition(async () => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": getSessionShareText(session.id).then((result) => {
              if (!result.ok) throw new Error(result.message);
              return result.data.text;
            }),
          }),
        ]);
        toast.success("Copied to clipboard");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not copy to clipboard");
      }
    });

  const confirmCancel = () =>
    startTransition(async () => {
      const result = await cancelSession(session.id);
      if (result.ok) {
        toast.success("Session cancelled");
        setCancelOpen(false);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              copyShareText();
            }}
          >
            Copy WhatsApp text
          </DropdownMenuItem>
          {canEdit(session.status) ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setEditOpen(true);
              }}
            >
              Edit
            </DropdownMenuItem>
          ) : null}
          {showManageLink ? (
            <DropdownMenuItem asChild>
              <Link href={`/sessions/${session.id}/manage`}>Manage</Link>
            </DropdownMenuItem>
          ) : null}
          {canCancel(session.status) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setCancelOpen(true);
                }}
              >
                Cancel session
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
          </DialogHeader>
          <SessionForm
            sessionId={session.id}
            initialValues={{
              title: session.title,
              description: session.description ?? "",
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              location: session.location,
              locationUrl: session.locationUrl ?? "",
              price: session.price !== null ? String(session.price) : "",
              courtCount: String(session.courtCount),
              maxParticipants: String(session.maxParticipants),
              waitlistCapacity: String(session.waitlistCapacity),
              registrationState: session.registrationState,
              // canEdit(session.status) above guarantees this is 'draft' or
              // 'scheduled' whenever this dialog is reachable.
              status: session.status as "draft" | "scheduled",
            }}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>
              This cancels the session. Registered players will not be notified automatically
              &mdash; let them know yourself (e.g. in your WhatsApp group). This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setCancelOpen(false)}>
              Keep session
            </Button>
            <Button variant="destructive" disabled={pending} onClick={confirmCancel}>
              {pending ? "Cancelling…" : "Cancel session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
