"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { savePlan } from "@/lib/actions/memberships";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import { formatIdr } from "@/lib/memberships/format";
import { planSchema, type PlanInput } from "@/lib/validation/memberships";
import type { PlanRow } from "@/lib/dal/memberships";

function valuesFor(plan?: PlanRow): PlanInput {
  return {
    name: plan?.name ?? "",
    priceIdr: plan?.priceIdr ?? 270000,
    quota: plan?.quota ?? 7,
    durationDays: plan?.durationDays ?? 30,
    refundCutoffHours: plan?.refundCutoffHours ?? 24,
    isActive: plan?.isActive ?? true,
  };
}

// Number inputs hold NaN while empty, which zod reports as a type error
// rather than the field being required.
function toNumber(raw: string): number {
  return raw === "" ? Number.NaN : Number(raw);
}

function PlanDialog({ plan }: { plan?: PlanRow }) {
  const editing = plan !== undefined;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<PlanInput>({
    resolver: zodResolver(planSchema),
    defaultValues: valuesFor(plan),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset(valuesFor(plan));
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await savePlan(plan?.id ?? null, values);
      if (result.ok) {
        toast.success(editing ? "Plan updated." : "Plan created.");
        setOpen(false);
      } else {
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      }
    }),
  );

  const numberField = (name: "priceIdr" | "quota" | "durationDays" | "refundCutoffHours", label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              className="h-11"
              type="number"
              inputMode="numeric"
              min={0}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={Number.isNaN(field.value) ? "" : (field.value ?? "")}
              onChange={(event) => field.onChange(toNumber(event.target.value))}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-11" variant={editing ? "outline" : "default"}>
          {editing ? "Edit" : "New plan"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            Changes apply to future grants only. Existing memberships keep their granted terms.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {numberField("priceIdr", "Price (Rp)")}
            {numberField("quota", "Session quota")}
            {numberField("durationDays", "Duration (days)")}
            {numberField("refundCutoffHours", "Refund cutoff (hours before session)")}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  </FormControl>
                  <FormLabel>Active (members can see and be granted this plan)</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create plan"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function MembershipPlansPanel({ plans }: { plans: PlanRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <PlanDialog />
      </div>
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <span className="mr-2">{plan.name}</span>
                  {!plan.isActive && <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell>{formatIdr(plan.priceIdr)}</TableCell>
                <TableCell>{plan.quota} sessions</TableCell>
                <TableCell>{plan.durationDays} days</TableCell>
                <TableCell className="text-right">
                  <PlanDialog plan={plan} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
