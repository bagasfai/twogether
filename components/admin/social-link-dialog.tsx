"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createSocialLink, updateSocialLink } from "@/lib/actions/socials";
import { SOCIAL_PLATFORMS, socialLinkSchema, type SocialLinkInput } from "@/lib/validation/socials";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import type { SocialLink } from "@/lib/dal/socials";

export const PLATFORM_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  ayo: "AYO",
  other: "Other",
};

function valuesFor(link?: SocialLink): SocialLinkInput {
  return {
    platform: link?.platform ?? "instagram",
    url: link?.url ?? "https://",
    label: link?.label ?? "",
    isVisible: link?.isVisible ?? true,
  };
}

export function SocialLinkDialog({ link }: { link?: SocialLink }) {
  const editing = link !== undefined;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<SocialLinkInput>({
    resolver: zodResolver(socialLinkSchema),
    defaultValues: valuesFor(link),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset(valuesFor(link));
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = editing
        ? await updateSocialLink(link.id, values)
        : await createSocialLink(values);
      if (result.ok) {
        toast.success(editing ? "Link updated." : "Link added.");
        setOpen(false);
        router.refresh();
      } else {
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-11" variant={editing ? "outline" : "default"}>
          {editing ? "Edit" : "Add link"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit link" : "Add link"}</DialogTitle>
          <DialogDescription>The URL must start with https://.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormControl>
                    <Input className="h-11" type="url" inputMode="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isVisible"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  </FormControl>
                  <FormLabel className="m-0">Visible on the public site</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add link"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
