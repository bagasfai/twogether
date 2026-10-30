"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateAbout } from "@/lib/actions/community-content";
import { aboutSchema, type AboutInput } from "@/lib/validation/community-content";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import type { AboutRow } from "@/lib/community-content/locale";

export function AboutEditor({ about }: { about: AboutRow | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<AboutInput>({
    resolver: zodResolver(aboutSchema),
    defaultValues: {
      titleEn: about?.title_en ?? "",
      titleId: about?.title_id ?? "",
      bodyEn: about?.body_en ?? "",
      bodyId: about?.body_id ?? "",
    },
  });

  if (!about) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        About row is missing. Re-run the migrations to restore it.
      </p>
    );
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateAbout(values);
      if (result.ok) {
        toast.success("About page saved.");
        router.refresh();
      } else {
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      }
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="titleEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title (English)</FormLabel>
                <FormControl>
                  <Input className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="titleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title (Indonesian)</FormLabel>
                <FormControl>
                  <Input className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bodyEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Body (English)</FormLabel>
                <FormControl>
                  <Textarea rows={8} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bodyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Body (Indonesian)</FormLabel>
                <FormControl>
                  <Textarea rows={8} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div>
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Saving…" : "Save about page"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
