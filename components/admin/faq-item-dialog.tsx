"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { createFaqItem, updateFaqItem } from "@/lib/actions/community-content";
import { faqItemSchema, type FaqItemInput } from "@/lib/validation/community-content";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import type { FaqRow } from "@/lib/community-content/locale";

function valuesFor(item?: FaqRow): FaqItemInput {
  return {
    questionEn: item?.question_en ?? "",
    questionId: item?.question_id ?? "",
    answerEn: item?.answer_en ?? "",
    answerId: item?.answer_id ?? "",
  };
}

export function FaqItemDialog({ item }: { item?: FaqRow }) {
  const editing = item !== undefined;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<FaqItemInput>({
    resolver: zodResolver(faqItemSchema),
    defaultValues: valuesFor(item),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset(valuesFor(item));
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = editing
        ? await updateFaqItem(item.id, values)
        : await createFaqItem(values);
      if (result.ok) {
        toast.success(editing ? "Question updated." : "Question added.");
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
          {editing ? "Edit" : "Add question"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Both languages are required.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="questionEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question (English)</FormLabel>
                  <FormControl>
                    <Input className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="answerEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Answer (English)</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="questionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question (Indonesian)</FormLabel>
                  <FormControl>
                    <Input className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="answerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Answer (Indonesian)</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add question"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
