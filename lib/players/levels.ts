export const SKILL_LEVELS = ["newbie", "beginner", "novice", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

// Weight used for a player with no recorded level: the middle of the 1..5 scale.
export const UNRATED_WEIGHT = 3;

export function levelWeight(level: SkillLevel | null): number {
  if (level === null) return UNRATED_WEIGHT;
  return SKILL_LEVELS.indexOf(level) + 1;
}
