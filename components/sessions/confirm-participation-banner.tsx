"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelRegistration, confirmParticipation } from "@/lib/actions/registration";

// Shown on a registration a host added without the member's involvement
// (needsConfirmation, from lib/dal/participants.ts). Confirming is what lets
// that host see the member's phone through profiles_private -- see
// docs/superpowers/core-schema-follow-ups.md's "must decide" entry.
export function ConfirmParticipationBanner({ sessionId, title }: { sessionId: string; title: string }) {
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmParticipation(sessionId);
      if (result.ok) toast.success("Spot confirmed");
      else toast.error(result.message);
    });

  const decline = () =>
    startTransition(async () => {
      const result = await cancelRegistration(sessionId);
      if (result.ok) toast.success("Declined");
      else toast.error(result.message);
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p>
        A host added you to <span className="font-medium">{title}</span>. Confirm your spot, or
        decline if this wasn&apos;t you.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={confirm}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={decline}>
          Decline
        </Button>
      </div>
    </div>
  );
}
