"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startSession } from "@/lib/actions/sessions";

// scheduled -> live. The start_session RPC also creates the session's album
// (trigger), so the refresh brings in the Photos tab. The page only renders
// this while the session is scheduled; the RPC re-checks the status.
export function StartSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onStart = () =>
    startTransition(async () => {
      try {
        const result = await startSession(sessionId);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Could not start the session. Try again.");
      }
    });

  return (
    <Button className="h-11 px-5" disabled={pending} onClick={onStart}>
      {pending ? "Starting…" : "Start session"}
    </Button>
  );
}
