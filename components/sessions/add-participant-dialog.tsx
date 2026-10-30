"use client";

import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hostAddParticipant, searchMembers } from "@/lib/actions/participants";
import type { AddableMember } from "@/lib/dal/participants";
import type { Database } from "@/types/supabase";

type AddableStatus = Exclude<Database["public"]["Enums"]["participant_status"], "cancelled">;

// No debounce library in this project's dependency set -- a single timer ref
// swapped out on every keystroke is the same effect for one input.
const SEARCH_DELAY_MS = 250;

export function AddParticipantDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableMember[]>([]);
  const [selected, setSelected] = useState<AddableMember | null>(null);
  const [status, setStatus] = useState<AddableStatus>("confirmed");
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setStatus("confirmed");
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(null);
    if (timer) clearTimeout(timer);

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }

    setSearching(true);
    setTimer(
      setTimeout(() => {
        startTransition(async () => {
          const result = await searchMembers(sessionId, trimmed);
          setSearching(false);
          if (result.ok) setResults(result.data);
          else toast.error(result.message);
        });
      }, SEARCH_DELAY_MS),
    );
  };

  const onSubmit = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await hostAddParticipant(sessionId, selected.id, status);
      if (result.ok) {
        toast.success(`${selected.fullName ?? "Player"} added. They'll need to confirm their spot.`);
        setOpen(false);
        reset();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add participant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a participant</DialogTitle>
          <DialogDescription>
            They&apos;ll show up on the roster right away, but this doesn&apos;t give you their phone
            number until they confirm the spot themselves.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Search by name…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            autoFocus
          />

          {searching ? <p className="text-sm text-muted-foreground">Searching…</p> : null}

          {!searching && query.trim().length > 0 && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching members.</p>
          ) : null}

          {results.length > 0 ? (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-1">
              {results.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(member)}
                    className={`w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                      selected?.id === member.id ? "bg-accent/15 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    {member.fullName ?? "Unnamed player"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Register as</span>
              <Select value={status} onValueChange={(value) => setStatus(value as AddableStatus)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="waiting_list">Waitlist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={!selected || pending} onClick={onSubmit}>
            {pending ? "Adding…" : "Add participant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
