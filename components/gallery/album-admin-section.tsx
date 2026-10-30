"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { ReviewQueue } from "@/components/gallery/review-queue";
import { UploadPanel } from "@/components/gallery/upload-panel";
import { createAlbum, deleteAlbum, updateAlbum } from "@/lib/actions/galleries";
import { albumSchema, type AlbumInput } from "@/lib/validation/gallery";
// Type-only: erased at compile time, so the server-only DAL never reaches the
// client bundle.
import type { AdminAlbum, GalleryPhotoRow } from "@/lib/dal/galleries";

// Admin workbench for albums: make standalone albums, edit, delete, upload,
// and review pending photos across every album.
export function AlbumAdminSection({
  albums,
  pending,
  hideHeading = false,
}: {
  albums: AdminAlbum[];
  pending: GalleryPhotoRow[];
  hideHeading?: boolean;
}) {
  const titles = Object.fromEntries(albums.map((album) => [album.id, album.title]));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {hideHeading ? null : (
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">Albums</h2>
        <p className="text-sm text-muted-foreground">
          Session albums appear when a session starts. Create other albums here for events outside a
          session.
        </p>
      </header>
      )}

      <CreateAlbumForm />

      <ReviewQueue photos={pending} albumTitles={titles} />

      {albums.length === 0 ? (
        <p className="text-sm text-muted-foreground">No albums yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {albums.map((album) => (
            <AlbumRow key={album.id} album={album} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateAlbumForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<AlbumInput, unknown, ReturnType<typeof albumSchema.parse>>({
    resolver: zodResolver(albumSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = (values: { title: string; description: string | null }) =>
    startTransition(async () => {
      try {
        const result = await createAlbum({ title: values.title, description: values.description ?? "" });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success("Album created.");
        form.reset();
        router.refresh();
      } catch {
        toast.error("Could not create the album.");
      }
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
        <h3 className="text-base font-semibold">New album</h3>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input className="h-11" maxLength={120} {...field} />
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
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} maxLength={1000} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" className="h-11 px-5" disabled={pending}>
            {pending ? "Creating…" : "Create album"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AlbumRow({ album }: { album: AdminAlbum }) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);

  const remove = async () => {
    try {
      const result = await deleteAlbum(album.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Album deleted.");
      router.refresh();
    } catch {
      toast.error("Could not delete the album.");
    }
  };

  return (
    <li className="flex min-w-0 flex-col gap-3 p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-sm font-medium">{album.title}</span>
          {album.sessionId ? <Badge variant="outline">Session album</Badge> : null}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {album.photoCount} {album.photoCount === 1 ? "photo" : "photos"} · {album.pendingCount} pending
        </p>
        {album.description ? (
          <p className="break-words text-xs text-muted-foreground">{album.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={`/gallery/${album.id}`}>View</Link>
        </Button>
        <EditAlbumDialog album={album} />
        <Button
          variant="outline"
          className="h-11 px-4"
          aria-expanded={uploadOpen}
          onClick={() => setUploadOpen((open) => !open)}
        >
          {uploadOpen ? "Hide upload" : "Upload"}
        </Button>
        <HoldToConfirmButton label="Delete album" className="h-11" onConfirm={remove} />
      </div>
      <p className="text-xs text-muted-foreground">
        Deleting an album permanently removes all of its photos.
      </p>
      {uploadOpen ? <UploadPanel galleryId={album.id} autoApproved /> : null}
    </li>
  );
}

function EditAlbumDialog({ album }: { album: AdminAlbum }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<AlbumInput, unknown, ReturnType<typeof albumSchema.parse>>({
    resolver: zodResolver(albumSchema),
    defaultValues: { title: album.title, description: album.description ?? "" },
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset({ title: album.title, description: album.description ?? "" });
  };

  const onSubmit = (values: { title: string; description: string | null }) =>
    startTransition(async () => {
      try {
        // updateAlbum writes title and description together.
        const result = await updateAlbum({
          id: album.id,
          title: values.title,
          description: values.description ?? "",
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success("Album updated.");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Could not update the album.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 px-4">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit album</DialogTitle>
          <DialogDescription>Shown on the public album page.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input className="h-11" maxLength={120} {...field} />
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
                    <Textarea rows={3} maxLength={1000} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" className="h-11 px-5" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
