"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presetRange, type ReportPreset, type ReportRange } from "@/lib/reports/params";
import { jakartaToday } from "@/lib/reports/today";

const PRESETS: { value: ReportPreset; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "all", label: "All time" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ReportFilters({ range }: { range: ReportRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const apply = (next: ReportRange) =>
    startTransition(() => {
      router.replace(`${pathname}?from=${next.from}&to=${next.to}`);
    });

  // Only navigate once both fields hold a complete, correctly ordered range;
  // otherwise a half-typed date would bounce the page to the invalid notice.
  const onChange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (DATE_RE.test(nextFrom) && DATE_RE.test(nextTo) && nextFrom <= nextTo) {
      apply({ from: nextFrom, to: nextTo });
    }
  };

  const orderError = DATE_RE.test(from) && DATE_RE.test(to) && from > to;

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange(e.target.value, to)}
            aria-invalid={orderError || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange(from, e.target.value)}
            aria-invalid={orderError || undefined}
          />
        </div>
      </div>
      {orderError ? (
        <p role="alert" className="text-sm text-destructive">
          The start date must be on or before the end date.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = presetRange(p.value, jakartaToday());
              setFrom(next.from);
              setTo(next.to);
              apply(next);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
