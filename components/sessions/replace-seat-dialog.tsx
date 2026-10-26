"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { searchMembers } from "@/lib/actions/participants";
import { transferSeat } from "@/lib/actions/transfers";
// Type-only: erased at compile time, so the `server-only` guard in the DAL never
// reaches the client bundle.
import type { AddableMember } from "@/lib/dal/participants";
import type { SessionKind } from "@/lib/dal/sessions";

// Same debounce as the add-participant picker: one timer, swapped per keystroke.
const SEARCH_DELAY_MS = 250;

const INVALID_STATE_NOTE =
  "That member can't take this seat, or the seat changed. Pick someone else or reload.";

// Hands a confirmed seat to another member. The caller may be the seat holder
// (member side) or a host (roster). sessionId is needed only for the member
// search, which is scoped to the session.
export function ReplaceSeatDialog({
  participantId,
  sessionKind,
  sessionId,
  triggerLabel = "Replace me",
  triggerVariant = "outline",
  triggerClassName,
  isHost = false,
  onTransferred,
}: {
  participantId: string;
  sessionKind: SessionKind;
  sessionId: string;
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "default";
  triggerClassName?: string;
  isHost?: boolean;
  /** called after a successful hand-off, e.g. to refetch the caller's own registration */
  onTransferred?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableMember[]>([]);
  const [selected, setSelected] = useState<AddableMember | null>(null);
  const [searching, setSearching] = useState(false);
  const [invalidNote, setInvalidNote] = useState(false);
  // Separate from the search transition so the submit button only reads
  // "Handing over…" while the hand-off itself runs.
  const [pending, startTransition] = useTransition();
  const [searchPending, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery("");
    setResults([]);
    setSelected(null);
    setSearching(false);
    setInvalidNote(false);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(null);
    setInvalidNote(false);
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const result = await searchMembers(sessionId, trimmed);
        setSearching(false);
        if (result.ok) setResults(result.data);
        else toast.error(result.message);
      });
    }, SEARCH_DELAY_MS);
  };

  const onSubmit = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await transferSeat(participantId, selected.id);
      if (result.ok) {
        toast.success(`Seat handed to ${selected.fullName ?? "the new player"}.`);
        setOpen(false);
        reset();
        onTransferred?.();
        return;
      }
      if (result.code === "invalid_state") {
        setInvalidNote(true);
        return;
      }
      toast.error(result.message);
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
        <Button size="sm" variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isHost ? "Replace this player" : "Hand your seat to someone else"}</DialogTitle>
          <DialogDescription>
            The member you pick takes the seat right away.{" "}
            {isHost ? "The original member stays the payer." : "You stay the payer."}
          </DialogDescription>
        </DialogHeader>

        {sessionKind === "drilling" && !isHost ? (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-sm">
            Drilling uses one quota unit per seat. Cancelling your seat does not refund it, so
            handing it to someone else is the way to keep your place filled.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Search by name…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            autoFocus
            aria-label="Search members"
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
                    onClick={() => {
                      setSelected(member);
                      setInvalidNote(false);
                    }}
                    aria-pressed={selected?.id === member.id}
                    className={`min-h-11 w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors md:min-h-0 ${
                      selected?.id === member.id ? "bg-accent/15 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    {member.fullName ?? "Unnamed player"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {invalidNote ? (
            <p role="alert" className="text-sm text-destructive">
              {INVALID_STATE_NOTE}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={!selected || pending || searchPending} onClick={onSubmit} className="h-11 md:h-9">
            {pending ? "Handing over…" : "Hand over seat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
