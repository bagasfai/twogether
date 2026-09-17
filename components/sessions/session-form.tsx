"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/sessions/datetime-picker";
import { createSession, updateSession } from "@/lib/actions/sessions";
import { sessionSchema, type SessionInput } from "@/lib/validation/session";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";

type SessionFormValues = z.input<typeof sessionSchema>;

const CONTROL_CLASS =
  "border-input bg-transparent flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none";

export function SessionForm({
  sessionId,
  initialValues,
  onSuccess,
}: {
  sessionId?: string;
  initialValues?: SessionFormValues;
  onSuccess?: () => void;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEditing = sessionId !== undefined;

  const form = useForm<SessionFormValues, unknown, SessionInput>({
    resolver: zodResolver(sessionSchema),
    defaultValues: initialValues ?? {
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      location: "",
      locationUrl: "",
      price: "",
      courtCount: "4",
      maxParticipants: "16",
      waitlistCapacity: "4",
      registrationState: "closed",
      status: "draft",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      // datetime-local has no zone. Convert HERE, in the browser, where the
      // local zone is the user's own. new Date(...).toISOString() also
      // handles an already-zoned instant (what initialValues.startsAt is,
      // in edit mode, until the picker is touched) as a no-op re-encode.
      const toInstant = (local: string) => new Date(local).toISOString();

      const payload = {
        ...values,
        startsAt: toInstant(values.startsAt),
        endsAt: toInstant(values.endsAt),
      };

      if (isEditing) {
        const result = await updateSession(sessionId, payload);
        if (result.ok) {
          onSuccess?.();
          router.refresh();
          return;
        }
        applyFieldErrors(form, result.fieldErrors);
        form.setError("root", { message: result.message });
        return;
      }

      const result = await createSession(payload);
      if (result.ok) {
        router.push(`/sessions/${result.data.id}/manage`);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      form.setError("root", { message: result.message });
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session details</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Friday Night Badminton" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      className={`${CONTROL_CLASS} h-auto`}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <DateTimePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <DateTimePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="GOR Jakarta Barat" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Map link</FormLabel>
                  <FormControl>
                    <Input type="url" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={isEditing ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-4"}>
              {!isEditing ? (
                <FormField
                  control={form.control}
                  name="courtCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courts</FormLabel>
                      <FormControl>
                        {/* z.coerce.number()'s input side types as unknown in zod 4. String()
                            converts at runtime instead of asserting, and degrades to "" rather
                            than undefined if that invariant is ever broken by a refactor --
                            same pattern as description/locationUrl's `?? ""` above. */}
                        <Input type="number" min={1} {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="maxParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} value={String(field.value ?? "")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="waitlistCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waitlist</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} value={String(field.value ?? "")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per player (Rp)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="45000" {...field} value={String(field.value ?? "")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="registrationState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration</FormLabel>
                    <FormControl>
                      <select className={CONTROL_CLASS} {...field}>
                        <option value="closed">Closed</option>
                        <option value="open">Open</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <select className={CONTROL_CLASS} {...field}>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}

            <FormDescription>
              Status: Draft is visible only to you. Scheduled appears publicly.
            </FormDescription>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save changes" : "Create session"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
