export type RotationCandidate = {
  participantId: string;
  checkedInAt: string;
  lastPlayedAt: string | null;
};

function availableSince(candidate: RotationCandidate): number {
  return new Date(candidate.lastPlayedAt ?? candidate.checkedInAt).getTime();
}

export function sortRotationQueue<T extends RotationCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const diff = availableSince(a) - availableSince(b);
    if (diff !== 0) return diff;
    return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  });
}
