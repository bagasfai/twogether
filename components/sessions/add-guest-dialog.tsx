"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { registerGuestForSession } from "@/lib/actions/registration";
import type { RegisterOutcome } from "@/lib/actions/registration";

export function AddGuestDialog({
  sessionId,
  onRegistered,
}: {
  sessionId: string;
  onRegistered: (outcome: RegisterOutcome) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(async () => {
      const result = await registerGuestForSession(sessionId, name, phone.trim() || null);
      if (result.ok) {
        toast.success(
          result.data.status === "confirmed"
            ? `${name} is in.`
            : `${name} was added to the waitlist at #${result.data.waitlistPosition ?? 0}.`,
        );
        onRegistered(result.data);
        setOpen(false);
        setName("");
        setPhone("");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Bring a guest
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bring a guest</DialogTitle>
          <DialogDescription>
            Register a friend or partner who doesn&apos;t have an account. You&apos;ll be able to
            cancel their spot yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Guest's name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <Input
            type="tel"
            placeholder="Phone number (optional)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button disabled={name.trim().length < 2 || pending} onClick={onSubmit}>
            {pending ? "Adding…" : "Add guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
