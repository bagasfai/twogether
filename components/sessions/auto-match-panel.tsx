"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmSuggestions, generateSuggestions, type SuggestionPlayer } from "@/lib/actions/matcher";
import { courtLabel } from "@/lib/court-label";
import { lineupWarnings, swapPlayers, type Slot } from "@/lib/matcher/lineup";
import type { MatchFormat, SuggestedMatch } from "@/lib/matcher/types";

const FORMAT_LABEL: Record<MatchFormat, string> = {
  mens: "Men's double",
  womens: "Women's double",
  mixed: "Mixed double",
};

type CourtRef = { courtId: string; courtNumber: number };
type Selection = { kind: "slot"; slot: Slot } | { kind: "unused"; id: string } | null;

const sameSlot = (a: Slot, b: Slot) => a.matchIndex === b.matchIndex && a.team === b.team && a.position === b.position;

export function AutoMatchPanel({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  const [format, setFormat] = useState<MatchFormat>("mixed");
  const [generated, setGenerated] = useState(false);
  // The Select can change after generating; warnings must judge the lineups
  // against the format they were generated for.
  const [generatedFormat, setGeneratedFormat] = useState<MatchFormat>("mixed");
  const [courts, setCourts] = useState<CourtRef[]>([]);
  const [matches, setMatches] = useState<SuggestedMatch[]>([]);
  const [unused, setUnused] = useState<string[]>([]);
  const [players, setPlayers] = useState<Map<string, SuggestionPlayer>>(new Map());
  const [reason, setReason] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  const nameOf = (id: string) => players.get(id)?.name ?? "Unknown player";

  const levelBadge = (id: string) => (
    <Badge variant="outline" className="ml-2 capitalize">
      {players.get(id)?.level ?? "?"}
    </Badge>
  );

  const generate = () =>
    startTransition(async () => {
      const result = await generateSuggestions({ sessionId, format });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setCourts(result.data.suggestions.map((s) => ({ courtId: s.courtId, courtNumber: s.courtNumber })));
      setMatches(result.data.suggestions.map((s) => ({ team1: s.team1, team2: s.team2 })));
      setUnused(result.data.unused);
      setPlayers(new Map(result.data.players.map((p) => [p.participantId, p])));
      setReason(result.data.reason);
      setGeneratedFormat(format);
      setSelection(null);
      setGenerated(true);
    });

  const clickSlot = (slot: Slot) => {
    if (!selection) return setSelection({ kind: "slot", slot });
    if (selection.kind === "slot") {
      if (sameSlot(selection.slot, slot)) return setSelection(null);
      const next = swapPlayers(matches, unused, selection.slot, slot);
      setMatches(next.matches);
      return setSelection(null);
    }
    const next = swapPlayers(matches, unused, slot, "unused", selection.id);
    setMatches(next.matches);
    setUnused(next.unused);
    setSelection(null);
  };

  const clickUnused = (id: string) => {
    if (selection?.kind === "slot") {
      const next = swapPlayers(matches, unused, selection.slot, "unused", id);
      setMatches(next.matches);
      setUnused(next.unused);
      return setSelection(null);
    }
    setSelection(selection?.kind === "unused" && selection.id === id ? null : { kind: "unused", id });
  };

  const discard = (index: number) => {
    const removed = matches[index];
    setUnused([...unused, ...removed.team1, ...removed.team2]);
    setMatches(matches.filter((_, i) => i !== index));
    setCourts(courts.filter((_, i) => i !== index));
    if (matches.length === 1) setReason(null);
    setSelection(null);
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmSuggestions({
        sessionId,
        matches: matches.map((m, i) => ({ courtId: courts[i].courtId, team1: m.team1, team2: m.team2 })),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const failed = new Set<string>();
      for (const outcome of result.data.results) {
        const court = courts.find((c) => c.courtId === outcome.courtId);
        const label = court ? courtLabel(court.courtNumber) : "Court";
        if (outcome.ok) toast.success(`${label}: match created`);
        else {
          failed.add(outcome.courtId);
          toast.error(`${label}: ${outcome.message}`);
        }
      }
      const keep = courts.map((c, i) => (failed.has(c.courtId) ? i : -1)).filter((i) => i >= 0);
      setCourts(keep.map((i) => courts[i]));
      setMatches(keep.map((i) => matches[i]));
      // "Need N more..." described the generation, not what is left.
      if (keep.length === 0) setReason(null);
      setSelection(null);
    });

  const warningsByIndex = useMemo(
    () => matches.map((m) => lineupWarnings(m, generatedFormat, players)),
    [matches, generatedFormat, players],
  );

  const isSelected = (slot: Slot) => selection?.kind === "slot" && sameSlot(selection.slot, slot);

  const slotButton = (matchIndex: number, team: 1 | 2, position: 0 | 1, id: string) => {
    const slot: Slot = { matchIndex, team, position };
    return (
      <Button
        key={`${team}-${position}`}
        type="button"
        size="sm"
        variant={isSelected(slot) ? "default" : "outline"}
        className="h-11 justify-start"
        disabled={pending}
        aria-pressed={isSelected(slot)}
        onClick={() => clickSlot(slot)}
      >
        {nameOf(id)}
        {levelBadge(id)}
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <h2 className="text-sm font-medium">Auto-match</h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <Label>Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as MatchFormat)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FORMAT_LABEL) as MatchFormat[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="h-11" disabled={pending} onClick={generate}>
          {generated ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {generated && reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
      {generated && matches.length === 0 && !reason ? (
        <p className="text-sm text-muted-foreground">No suggestions left.</p>
      ) : null}

      {matches.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {matches.map((m, i) => (
            <li key={courts[i].courtId} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{courtLabel(courts[i].courtNumber)}</span>
                <Button size="sm" variant="ghost" className="h-11 sm:h-9" disabled={pending} onClick={() => discard(i)}>
                  Discard
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label>Team 1</Label>
                  {slotButton(i, 1, 0, m.team1[0])}
                  {slotButton(i, 1, 1, m.team1[1])}
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Team 2</Label>
                  {slotButton(i, 2, 0, m.team2[0])}
                  {slotButton(i, 2, 1, m.team2[1])}
                </div>
              </div>
              {warningsByIndex[i].map((w) => (
                <p key={w} className="text-sm text-warning-foreground dark:text-warning">
                  {w}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      {generated && unused.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>Unused players</Label>
          <ul className="flex flex-wrap gap-2">
            {unused.map((id) => (
              <li key={id}>
                <Button
                  type="button"
                  size="sm"
                  variant={selection?.kind === "unused" && selection.id === id ? "default" : "outline"}
                  className="h-11 sm:h-9"
                  disabled={pending}
                  onClick={() => clickUnused(id)}
                >
                  {nameOf(id)}
                  {levelBadge(id)}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {matches.length > 0 ? (
        <Button className="h-11 w-full sm:w-auto sm:self-start" disabled={pending} onClick={confirm}>
          Confirm all
        </Button>
      ) : null}
    </div>
  );
}
