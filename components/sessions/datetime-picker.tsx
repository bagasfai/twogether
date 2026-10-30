"use client";

import type { ComponentProps } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Value is the naive "YYYY-MM-DDTHH:mm" local string datetime-local produced,
// kept so callers (session-form's toInstant) still parse it in the browser's zone.
type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
} & Omit<ComponentProps<typeof Button>, "onChange" | "value" | "type">;

function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalValue(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, disabled, className, ...rest }: DateTimePickerProps) {
  const date = toDate(value);
  const time = date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";

  return (
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("flex-1 justify-start font-normal", !date && "text-muted-foreground", className)}
            {...rest}
          >
            <CalendarIcon className="size-4" />
            {date ? date.toLocaleDateString() : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(selected) => {
              if (!selected) return;
              onChange(toLocalValue(selected, time || "00:00"));
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        lang="en-GB"
        className="w-[120px]"
        disabled={disabled}
        value={time}
        onChange={(event) => onChange(toLocalValue(date ?? new Date(), event.target.value))}
      />
    </div>
  );
}
