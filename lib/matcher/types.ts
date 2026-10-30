import type { Gender } from "@/lib/players/levels";

export type MatchFormat = "mens" | "womens" | "mixed";

export type PoolPlayer = {
  participantId: string;
  name: string;
  gender: Gender | null;
  weight: number;
  unrated: boolean;
  gamesPlayed: number;
};

// Participant ids of a completed match, one array per team.
export type PastMatch = { team1: string[]; team2: string[] };

export type SuggestedMatch = {
  team1: [string, string];
  team2: [string, string];
};

export type SuggestResult = {
  matches: SuggestedMatch[];
  unused: string[];
  reason: string | null;
};
