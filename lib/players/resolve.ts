import { levelWeight, type Gender, type SkillLevel } from "@/lib/players/levels";

export type PlayerAttributes = {
  gender: Gender | null;
  level: SkillLevel | null;
  unrated: boolean;
  weight: number;
};

export function resolvePlayerAttributes(raw: {
  gender: Gender | null;
  level: SkillLevel | null;
}): PlayerAttributes {
  return {
    gender: raw.gender,
    level: raw.level,
    unrated: raw.level === null,
    weight: levelWeight(raw.level),
  };
}

// A guest has no profile to carry a gender, so the host must record one
// before check-in. Members may be checked in without one.
export function checkInBlockedReason(p: {
  isGuest: boolean;
  gender: Gender | null;
}): string | null {
  if (p.isGuest && p.gender === null) {
    return "Set this guest's gender before checking them in.";
  }
  return null;
}
