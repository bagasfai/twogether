"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncement, updateAnnouncement } from "@/lib/actions/announcements";
import type { AnnouncementRow } from "@/lib/dal/announcements";

export function AnnouncementForm({
  sessionId,
  announcement,
}: {
  sessionId: string | null;
  announcement?: AnnouncementRow;
}) {
  const editing = announcement !== undefined;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = () => {
    startTransition(async () => {
      const result = editing
        ? await updateAnnouncement(announcement.id, { title, body })
        : await createAnnouncement({ sessionId, title, body });

      if (result.ok) {
        toast.success(editing ? "Announcement updated." : "Announcement posted.");
        setOpen(false);
        if (!editing) {
          setTitle("");
          setBody("");
        }
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editing ? "outline" : "default"}>
          {editing ? "Edit" : "Post announcement"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit announcement" : "Post announcement"}</DialogTitle>
          <DialogDescription>
            {sessionId === null
              ? "Visible to everyone on the landing page and members' dashboards."
              : "Visible on this session's public page and to registered members."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            autoFocus
          />
          <Textarea
            placeholder="What do people need to know?"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={title.trim().length < 1 || body.trim().length < 1 || pending}
            onClick={onSubmit}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
