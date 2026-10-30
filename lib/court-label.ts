// Courts are numbered in the database (court_number int, unique per session --
// see supabase/migrations/20260911000005_courts_matches.sql); the letter is a
// display-only transform so the unique-constraint race guard on court_number
// stays untouched.
export function courtLabel(courtNumber: number): string {
  if (courtNumber >= 1 && courtNumber <= 26) {
    return `Court ${String.fromCharCode(64 + courtNumber)}`;
  }
  return `Court ${courtNumber}`;
}
