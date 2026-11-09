"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { registerGuestForSession } from "@/lib/actions/registration";
import type { RegisterOutcome } from "@/lib/actions/registration";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import { registerGuestSchema } from "@/lib/validation/participants";

// Same schema the Server Action re-validates with, minus the sessionId the
// dialog already knows -- so a too-long name is caught under the field here
// instead of coming back as a bare "check the highlighted fields" toast.
const guestFormSchema = registerGuestSchema.omit({ sessionId: true });

type GuestFormInput = z.input<typeof guestFormSchema>;
type GuestFormOutput = z.output<typeof guestFormSchema>;

const EMPTY: GuestFormInput = { guestName: "", guestPhone: "" };

export function AddGuestDialog({
  sessionId,
  onRegistered,
}: {
  sessionId: string;
  onRegistered: (outcome: RegisterOutcome) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<GuestFormInput, unknown, GuestFormOutput>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: EMPTY,
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset(EMPTY);
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await registerGuestForSession(sessionId, values.guestName, values.guestPhone);
      if (result.ok) {
        toast.success(
          result.data.status === "confirmed"
            ? `${values.guestName} is in.`
            : `${values.guestName} was added to the waitlist at #${result.data.waitlistPosition ?? 0}.`,
        );
        onRegistered(result.data);
        setOpen(false);
      } else {
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="guestName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guest&apos;s name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="guestPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone number (optional)</FormLabel>
                  <FormControl>
                    <Input type="tel" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add guest"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
