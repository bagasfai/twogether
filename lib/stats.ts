// Competition ranking (1, 2, 2, 4) over rows already sorted by gamesPlayed desc.
export function assignRanks<T extends { gamesPlayed: number }>(
  rows: T[],
): (T & { rank: number })[] {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.gamesPlayed !== rows[index - 1].gamesPlayed) {
      rank = index + 1;
    }
    return { ...row, rank };
  });
}

export function displayName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Member";
}
