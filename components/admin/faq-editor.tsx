"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FaqItemDialog } from "@/components/admin/faq-item-dialog";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { deleteFaqItem, moveFaqItem } from "@/lib/actions/community-content";
import type { FaqRow } from "@/lib/community-content/locale";

function Pair({ label, en, id }: { label: string; en: string; id: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label} (English)</p>
        <p className="whitespace-pre-wrap text-sm">{en}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label} (Indonesian)</p>
        <p className="whitespace-pre-wrap text-sm">{id}</p>
      </div>
    </div>
  );
}

export function FaqEditor({ items, hideHeading = false }: { items: FaqRow[]; hideHeading?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (action: () => ReturnType<typeof moveFaqItem>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.message);
        // Item was deleted elsewhere: reload the list so the stale row goes away.
        if (result.code === "not_found") router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className={hideHeading ? "flex justify-end" : "flex items-center justify-between gap-2"}>
        {hideHeading ? null : (
          <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">FAQ</h2>
        )}
        <FaqItemDialog />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <Pair label="Question" en={item.question_en} id={item.question_id} />
                  <Pair label="Answer" en={item.answer_en} id={item.answer_id} />
                  <div className="flex flex-wrap items-center gap-2">
                    <FaqItemDialog item={item} />
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={index === 0 || pending}
                      onClick={() => run(() => moveFaqItem(item.id, "up"))}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={index === items.length - 1 || pending}
                      onClick={() => run(() => moveFaqItem(item.id, "down"))}
                    >
                      Move down
                    </Button>
                    <HoldToConfirmButton
                      label="Hold to delete"
                      className="h-11"
                      disabled={pending}
                      onConfirm={() => run(() => deleteFaqItem(item.id))}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
