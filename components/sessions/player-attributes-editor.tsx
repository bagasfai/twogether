"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  setGuestAttributes,
  setMemberGender,
  setMemberLevel,
} from "@/lib/actions/player-attributes";
import {
  GENDERS,
  SKILL_LEVELS,
  type Gender,
  type SkillLevel,
} from "@/lib/players/levels";
import type { PlayerAttributes } from "@/lib/players/resolve";

const LABEL: Record<Gender | SkillLevel, string> = {
  male: "Male",
  female: "Female",
  newbie: "Newbie",
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// A save failure should read as a roster message. The generic zod form
// message ("Please check the highlighted fields.") means nothing here, so only
// a failure with a specific code-derived message is shown as-is.
function failureMessage(
  result: { code: string; message: string },
  what: "level" | "gender",
) {
  return result.code === "validation"
    ? `Could not save ${what}. Try again.`
    : result.message || `Could not save ${what}. Try again.`;
}

// Host-only. Rendered solely from the host manage page (RosterTable), which is
// gated by requireHost; level and gender must never reach a member-facing prop.
export function PlayerAttributesEditor({
  participantId,
  userId,
  isGuest,
  attributes,
  compact = false,
}: {
  compact?: boolean;
  participantId: string;
  userId: string | null;
  isGuest: boolean;
  attributes: PlayerAttributes | undefined;
}) {
  const [gender, setGender] = useState<Gender | null>(
    attributes?.gender ?? null,
  );
  const [level, setLevel] = useState<SkillLevel | null>(
    attributes?.level ?? null,
  );

  // Re-sync when the server re-renders with fresh data (after revalidation).
  // Adjusting state during render, keyed on the incoming props, avoids the
  // extra effect pass and a stale frame.
  const [seen, setSeen] = useState({
    gender: attributes?.gender ?? null,
    level: attributes?.level ?? null,
  });
  const incomingGender = attributes?.gender ?? null;
  const incomingLevel = attributes?.level ?? null;
  if (seen.gender !== incomingGender || seen.level !== incomingLevel) {
    setSeen({ gender: incomingGender, level: incomingLevel });
    setGender(incomingGender);
    setLevel(incomingLevel);
  }

  const saveLevel = async (next: SkillLevel) => {
    const prev = level;
    setLevel(next);
    const result =
      isGuest || userId === null
        ? await setGuestAttributes({ participantId, level: next })
        : await setMemberLevel({ userId, level: next });
    if (!result.ok) {
      setLevel(prev);
      toast.error(failureMessage(result, "level"));
    }
  };

  const saveGender = async (next: Gender) => {
    const prev = gender;
    setGender(next);
    const result =
      isGuest || userId === null
        ? await setGuestAttributes({ participantId, gender: next })
        : await setMemberGender({ userId, gender: next });
    if (!result.ok) {
      setGender(prev);
      toast.error(failureMessage(result, "gender"));
    }
  };

  return (
    <div
      className={
        compact
          ? "flex flex-col items-start gap-1 whitespace-normal"
          : "flex flex-wrap items-center gap-1.5"
      }
    >
      <Select
        value={gender ?? ""}
        onValueChange={(v) => saveGender(v as Gender)}
      >
        <SelectTrigger size="sm" aria-label="Gender" className={compact ? "w-32 px-2 text-xs" : "min-w-28"}>
          {/* Null gender can also mean a member has not consented to share it
              with hosts, so the prompt is neutral rather than "unset". */}
          <SelectValue placeholder="Set gender" />
        </SelectTrigger>
        <SelectContent>
          {GENDERS.map((g) => (
            <SelectItem key={g} value={g}>
              {LABEL[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
      <Select
        value={level ?? ""}
        onValueChange={(v) => saveLevel(v as SkillLevel)}
      >
        <SelectTrigger size="sm" aria-label="Skill level" className={compact ? "w-32 px-2 text-xs" : "min-w-32"}>
          <SelectValue placeholder="Set level" />
        </SelectTrigger>
        <SelectContent>
          {SKILL_LEVELS.map((l) => (
            <SelectItem key={l} value={l}>
              {LABEL[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {level === null ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex">
                <Badge variant="outline" aria-label="Unrated">
                  ?
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Unrated: matcher assumes a mid level
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      </div>
    </div>
  );
}
