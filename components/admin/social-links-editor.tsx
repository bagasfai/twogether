"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SocialIcon } from "@/components/marketing/social-icon";
import { SocialLinkDialog } from "@/components/admin/social-link-dialog";
import { deleteSocialLink, moveSocialLink } from "@/lib/actions/socials";
import type { SocialLink } from "@/lib/dal/socials";

export function SocialLinksEditor({ links }: { links: SocialLink[] }) {
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<SocialLink | null>(null);
  const router = useRouter();

  const run = (action: () => ReturnType<typeof moveSocialLink>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        after?.();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <SocialLinkDialog />
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((link, index) => (
            <li key={link.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <SocialIcon platform={link.platform} className="size-6 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{link.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                    </div>
                    <Badge variant={link.isVisible ? "default" : "outline"}>
                      {link.isVisible ? "Visible" : "Hidden"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={index === 0 || pending}
                      onClick={() => run(() => moveSocialLink({ id: link.id, direction: "up" }))}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={index === links.length - 1 || pending}
                      onClick={() => run(() => moveSocialLink({ id: link.id, direction: "down" }))}
                    >
                      Move down
                    </Button>
                    <SocialLinkDialog link={link} />
                    <Button
                      variant="destructive"
                      className="h-11"
                      disabled={pending}
                      onClick={() => setToDelete(link)}
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
            <DialogTitle>Delete this link?</DialogTitle>
            <DialogDescription>
              {toDelete ? `"${toDelete.label}" will be removed from the public site.` : ""} This cannot be
              undone.
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
              onClick={() => {
                if (!toDelete) return;
                const id = toDelete.id;
                run(() => deleteSocialLink(id), () => setToDelete(null));
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
