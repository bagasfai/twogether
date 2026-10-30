"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { grantMembership } from "@/lib/actions/memberships";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import { formatIdr } from "@/lib/memberships/format";
import { grantMembershipSchema } from "@/lib/validation/memberships";
import type { MemberRow } from "@/lib/dal/admin";
import type { PlanRow } from "@/lib/dal/memberships";

// Override fields are strings so an empty box means "use the plan's value".
type GrantFormValues = {
  userId: string;
  planId: string;
  paymentDate: string;
  priceIdr: string;
  quota: string;
  durationDays: string;
};

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyValues(): GrantFormValues {
  return { userId: "", planId: "", paymentDate: todayLocal(), priceIdr: "", quota: "", durationDays: "" };
}

// Overrides are only sent when they differ from the plan, so a grant that
// matches the plan records no override.
function overrideFor(raw: string, planValue: number | undefined): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return n === planValue ? undefined : n;
}

export function GrantMembershipDialog({
  members,
  plans,
}: {
  members: MemberRow[];
  plans: PlanRow[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<GrantFormValues>({ defaultValues: emptyValues() });
  const activePlans = plans.filter((p) => p.isActive);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset(emptyValues());
  };

  const choosePlan = (planId: string) => {
    form.setValue("planId", planId, { shouldValidate: true });
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    form.setValue("priceIdr", String(plan.priceIdr));
    form.setValue("quota", String(plan.quota));
    form.setValue("durationDays", String(plan.durationDays));
  };

  const onSubmit = form.handleSubmit((values) => {
    const plan = plans.find((p) => p.id === values.planId);
    const parsed = grantMembershipSchema.safeParse({
      userId: values.userId,
      planId: values.planId,
      // Payment date is a calendar day in the community's timezone (WIB).
      paymentReceivedAt: values.paymentDate ? `${values.paymentDate}T00:00:00+07:00` : "",
      priceIdr: overrideFor(values.priceIdr, plan?.priceIdr),
      quota: overrideFor(values.quota, plan?.quota),
      durationDays: overrideFor(values.durationDays, plan?.durationDays),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        const field = key === "paymentReceivedAt" ? "paymentDate" : key;
        if (typeof field === "string" && field in values) {
          form.setError(field as keyof GrantFormValues, {
            message: (field === "userId" || field === "planId") && values[field] === "" ? "Required" : issue.message,
          });
        }
      }
      return;
    }

    startTransition(async () => {
      const result = await grantMembership(parsed.data);
      if (result.ok) {
        toast.success("Membership granted.");
        setOpen(false);
      } else {
        applyFieldErrors(form, result.fieldErrors);
        toast.error(result.message);
      }
    });
  });

  const overrideField = (name: "priceIdr" | "quota" | "durationDays", label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input className="h-11" type="number" inputMode="numeric" min={0} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-11">Grant membership</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grant membership</DialogTitle>
          <DialogDescription>
            If the member already has an active membership, this one is queued and starts when the
            current one ends.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Choose a member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.fullName ?? "Unnamed player"}
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
              name="planId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan</FormLabel>
                  <Select value={field.value} onValueChange={choosePlan}>
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Choose a plan" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activePlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({formatIdr(p.priceIdr)})
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
              name="paymentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment received</FormLabel>
                  <FormControl>
                    <Input className="h-11" type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Optional overrides, pre-filled from the plan. Change only for a one-off deal.
            </p>
            {overrideField("priceIdr", "Price (Rp)")}
            {overrideField("quota", "Session quota")}
            {overrideField("durationDays", "Duration (days)")}
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "Granting…" : "Grant membership"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
