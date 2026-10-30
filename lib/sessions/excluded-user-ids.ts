// Guest participants have user_id NULL. A null inside a PostgREST `not.in.(...)`
// list breaks the filter, so drop nulls before building it.
export function excludedUserIds(rows: { user_id: string | null }[]): string[] {
  return rows.flatMap((row) => (row.user_id === null ? [] : [row.user_id]));
}
