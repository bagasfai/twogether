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
//   JB008 session or participant not found
//   JB009 court not available for a new/starting match
//   JB010 court has an active match, cannot delete
//   JB011 guest registration missing a required field

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
