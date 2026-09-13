"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/actions/profile";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";

// The schema turns "" into null on output, so the form's input type and its
// output type differ. react-hook-form takes both.
type ProfileFormValues = z.input<typeof profileSchema>;

export function ProfileForm({ defaultValues }: { defaultValues: ProfileFormValues }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileFormValues, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateProfile(values);

      if (result.ok) {
        toast.success("Profile saved");
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      form.setError("root", { message: result.message });
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>How you appear to hosts and other players.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="tel" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    Visible to you, admins, and hosts of sessions you&apos;re added to as a
                    participant — including if a host adds you without you registering yourself.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avatar URL</FormLabel>
                  <FormControl>
                    <Input type="url" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
