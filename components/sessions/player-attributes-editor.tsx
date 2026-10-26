"use client";

import { useEffect, useState } from "react";
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

// Host-only. Rendered solely from the host manage page (RosterTable), which is
// gated by requireHost; level and gender must never reach a member-facing prop.
export function PlayerAttributesEditor({
  participantId,
  userId,
  isGuest,
  attributes,
}: {
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
  useEffect(() => {
    setGender(attributes?.gender ?? null);
    setLevel(attributes?.level ?? null);
  }, [attributes?.gender, attributes?.level]);

  const saveLevel = async (next: SkillLevel) => {
    const prev = level;
    setLevel(next);
    const result =
      isGuest || userId === null
        ? await setGuestAttributes({ participantId, level: next })
        : await setMemberLevel({ userId, level: next });
    if (!result.ok) {
      setLevel(prev);
      toast.error(result.message);
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
      toast.error(result.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={gender ?? ""}
        onValueChange={(v) => saveGender(v as Gender)}
      >
        <SelectTrigger size="sm" aria-label="Gender" className="min-w-28">
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
      <Select
        value={level ?? ""}
        onValueChange={(v) => saveLevel(v as SkillLevel)}
      >
        <SelectTrigger size="sm" aria-label="Skill level" className="min-w-32">
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
  );
}
