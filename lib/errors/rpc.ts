// The JB codes are raised by the SECURITY DEFINER registration RPCs. Map off
// error.code only -- never error.message. The messages are internal wording and
// have already been reworded once; the codes are the contract.
//
//   JB001 registration is not open
//   JB002 session is full
//   JB003 already registered, or nothing to cancel
//   JB004 not authenticated
//   JB005 invalid match player
//   JB006 wrong transaction isolation
//   JB007 not authorized
//   JB008 session, participant or gallery photo not found
//   JB009 court not available for a new/starting match
//   JB010 court has an active match, cannot delete
//   JB011 guest registration missing a required field
//   JB012 not eligible to add photos to this gallery
//   JB013 photo upload window for the session has closed
//   JB014 pending-photo cap reached
//   JB015 invalid upload path or missing/foreign uploaded object
//   JB016 stale or invalid state: photo not pending, unknown review action,
//         or session not scheduled (start_session)
//   JB017 participant is already in a scheduled or in-progress match
//   JB018 membership or plan not found or inactive (admin membership RPCs;
//         also a grant to a missing user)
//   JB019 membership already cancelled

export const RPC_CODE_MAP = {
  JB001: "registration_closed",
  JB002: "session_full",
  JB003: "registration_conflict",
  JB004: "not_authenticated",
  JB005: "invalid_match_player",
  JB006: "wrong_isolation",
  JB007: "not_authorized",
  JB008: "not_found",
  JB009: "court_not_available",
  JB010: "court_has_active_match",
  JB011: "validation",
  JB012: "upload_not_eligible",
  JB013: "upload_window_closed",
  JB014: "upload_cap_reached",
  JB015: "invalid_upload",
  JB016: "invalid_state",
  JB017: "player_busy",
  JB018: "not_found",
  JB019: "invalid_state",
} as const;

export type RpcErrorCode = Exclude<(typeof RPC_CODE_MAP)[keyof typeof RPC_CODE_MAP], "validation">;
export type AppErrorCode = RpcErrorCode | "validation" | "unknown";

const MESSAGES: Record<AppErrorCode, string> = {
  registration_closed: "Registration for this session is not open.",
  session_full: "This session is full.",
  // JB003 is still overloaded between "already registered" and "nothing to
  // cancel". Both mean the caller acted on a stale view, so one message covers
  // them; splitting the code would buy copy, not behaviour.
  registration_conflict: "Your registration changed. Reload the page and try again.",
  not_authenticated: "Please log in to continue.",
  invalid_match_player: "That player cannot be added to this match.",
  // JB006 means the RPC ran under the wrong transaction isolation. That is a
  // programming error, never the user's doing, so it gets a generic message and
  // the detail goes to the log.
  wrong_isolation: "Something went wrong on our side. Please try again.",
  not_authorized: "You do not have permission to do that.",
  not_found: "We could not find that.",
  court_not_available: "That court isn't available right now.",
  court_has_active_match: "Cancel or complete the match on this court before deleting it.",
  upload_not_eligible: "You can't add photos to this album.",
  upload_window_closed: "The window for adding photos to this session has closed.",
  upload_cap_reached: "You have 20 photos waiting for approval. Wait for a host to review them.",
  invalid_upload: "That photo could not be added. Please try again.",
  invalid_state: "This has already changed. Reload and try again.",
  player_busy: "A player in this match is already in another active match.",
  validation: "Please check the highlighted fields.",
  unknown: "Something went wrong. Please try again.",
};

export type MappedRpcError = {
  code: AppErrorCode;
  message: string;
  /** Raw database message, for server-side logging only. Never render this. */
  detail?: string;
};

export function mapRpcError(
  error: { code?: string | null; message?: string } | null | undefined,
): MappedRpcError {
  const pgCode = error?.code ?? "";
  const code: AppErrorCode =
    pgCode in RPC_CODE_MAP ? RPC_CODE_MAP[pgCode as keyof typeof RPC_CODE_MAP] : "unknown";

  return { code, message: MESSAGES[code], detail: error?.message };
}

export function messageForCode(code: AppErrorCode): string {
  return MESSAGES[code];
}
