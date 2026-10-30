"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LABELS } from "@/components/admin/social-link-dialog";
import {
  createFeaturedPost,
  deleteFeaturedPost,
  deleteOrphanFeaturedImage,
  updateFeaturedPost,
} from "@/lib/actions/featured-posts";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_TYPES, ImageEncodeError, resizeForUpload, validatePickedFile } from "@/lib/gallery/image";
import { formatDate, jakartaDateString } from "@/lib/format/datetime";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import {
  FEATURED_POST_KINDS,
  SOCIAL_PLATFORMS,
  featuredPostSchema,
  type FeaturedPostInput,
} from "@/lib/validation/socials";
import type { FeaturedPost } from "@/lib/dal/socials";

const KIND_LABELS: Record<(typeof FEATURED_POST_KINDS)[number], string> = {
  schedule: "Schedule",
  match: "Match",
  video: "Video",
  other: "Other",
};

const CAPTION_MAX = 200;

function valuesFor(post?: FeaturedPost): FeaturedPostInput {
  return {
    platform: post?.platform ?? "instagram",
    postUrl: post?.postUrl ?? "https://",
    captionEn: post?.captionEn ?? "",
    captionId: post?.captionId ?? "",
    kind: post?.kind ?? "other",
    postedAt: post?.postedAt ?? jakartaDateString(),
    isVisible: post?.isVisible ?? true,
  };
}

// "YYYY-MM-DD" <-> the local-zone Date the calendar works with.
function toCalendarDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

function fromCalendarDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function displayDate(value: string): string {
  return formatDate(`${value}T00:00:00+07:00`);
}

function FeaturedPostDialog({ post }: { post?: FeaturedPost }) {
  const editing = post !== undefined;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const router = useRouter();
  const form = useForm<FeaturedPostInput>({
    resolver: zodResolver(featuredPostSchema),
    defaultValues: valuesFor(post),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      form.reset(valuesFor(post));
      setFile(null);
      setFileError(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!editing && !file) {
      setFileError("Choose an image.");
      return;
    }
    startTransition(async () => {
      let uploadedPath: string | undefined;
      try {
        if (file) {
          const check = validatePickedFile(file);
          if (!check.ok) {
            setFileError(
              check.reason === "type"
                ? "Use a JPEG, PNG or WebP image."
                : check.reason === "empty"
                  ? "That file is empty."
                  : "That file is too large.",
            );
            return;
          }
          const { blob, ext } = await resizeForUpload(file);
          const path = `${crypto.randomUUID()}.${ext}`;
          const { error } = await createClient()
            .storage.from("featured-posts")
            .upload(path, blob, { contentType: blob.type, upsert: false });
          if (error) {
            toast.error("Could not upload the image.");
            return;
          }
          uploadedPath = path;
        }

        const result = editing
          ? await updateFeaturedPost(post.id, { ...values, imagePath: uploadedPath })
          : await createFeaturedPost({ ...values, imagePath: uploadedPath! });

        if (result.ok) {
          toast.success(editing ? "Post updated." : "Post added.");
          setOpen(false);
          router.refresh();
          return;
        }
        if (uploadedPath) await deleteOrphanFeaturedImage(uploadedPath).catch(() => {});
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      } catch (error) {
        if (uploadedPath) await deleteOrphanFeaturedImage(uploadedPath).catch(() => {});
        toast.error(
          error instanceof ImageEncodeError
            ? "This browser cannot prepare that image."
            : "Could not read that image.",
        );
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-11" variant={editing ? "outline" : "default"}>
          {editing ? "Edit" : "Add post"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit post" : "Add post"}</DialogTitle>
          <DialogDescription>Link to the original post and add a short caption in both languages.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="featured-post-image" className="text-sm font-medium">
                Image{editing ? " (leave empty to keep the current one)" : ""}
              </label>
              <Input
                id="featured-post-image"
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="h-11"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setFileError(null);
                }}
              />
              {fileError ? (
                <p role="alert" className="text-sm text-destructive-text">
                  {fileError}
                </p>
              ) : null}
            </div>
            <FormField
              control={form.control}
              name="postUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Post URL</FormLabel>
                  <FormControl>
                    <Input className="h-11" type="url" inputMode="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kind</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FEATURED_POST_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
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
              name="captionEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caption (English)</FormLabel>
                  <FormControl>
                    <Textarea maxLength={CAPTION_MAX} rows={2} {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {field.value.length}/{CAPTION_MAX}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="captionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caption (Indonesian)</FormLabel>
                  <FormControl>
                    <Textarea maxLength={CAPTION_MAX} rows={2} {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {field.value.length}/{CAPTION_MAX}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postedAt"
              render={({ field }) => {
                const selected = toCalendarDate(field.value);
                return (
                  <FormItem className="flex flex-col">
                    <FormLabel>Posted on</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button type="button" variant="outline" className="h-11 justify-start font-normal">
                            <CalendarIcon className="size-4" />
                            {selected ? displayDate(field.value) : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selected}
                          defaultMonth={selected}
                          onSelect={(date) => {
                            if (date) field.onChange(fromCalendarDate(date));
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
              {pending ? "Saving…" : editing ? "Save changes" : "Add post"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function FeaturedPostsEditor({ posts }: { posts: FeaturedPost[] }) {
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<FeaturedPost | null>(null);
  const router = useRouter();

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteFeaturedPost(id);
      if (result.ok) {
        setToDelete(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <FeaturedPostDialog />
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.id} className="min-w-0">
              <Card className="h-full overflow-hidden">
                <div className="relative aspect-video bg-muted">
                  <Image
                    src={post.imageUrl}
                    alt={post.captionEn}
                    fill
                    sizes="(min-width: 640px) 336px, 100vw"
                    className="object-cover"
                  />
                </div>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{post.captionEn}</p>
                    <Badge variant={post.isVisible ? "default" : "outline"}>
                      {post.isVisible ? "Visible" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {PLATFORM_LABELS[post.platform]} · {KIND_LABELS[post.kind]} · {displayDate(post.postedAt)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <FeaturedPostDialog post={post} />
                    <Button
                      variant="destructive"
                      className="h-11"
                      disabled={pending}
                      onClick={() => setToDelete(post)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(next) => !next && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              {toDelete ? `"${toDelete.captionEn}" will be removed from the public site.` : ""} This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={pending}
              onClick={() => toDelete && remove(toDelete.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
