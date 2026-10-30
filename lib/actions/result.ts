import type { ZodError } from "zod";
import { mapRpcError, messageForCode, type AppErrorCode } from "@/lib/errors/rpc";

export type ActionSuccess<T> = { ok: true; data: T };

export type ActionFailure = {
  ok: false;
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function fail(
  code: AppErrorCode,
  message?: string,
  fieldErrors?: Record<string, string[]>,
): ActionFailure {
  return { ok: false, code, message: message ?? messageForCode(code), fieldErrors };
}

export function failFromRpc(
  error: { code?: string | null; message?: string } | null | undefined,
): ActionFailure {
  const mapped = mapRpcError(error);
  if (mapped.code === "unknown" || mapped.code === "wrong_isolation") {
    console.error("[rpc]", mapped.code, error?.code, mapped.detail);
  }
  return { ok: false, code: mapped.code, message: mapped.message };
}

// Built from error.issues rather than a flatten helper so this keeps working
// across zod minor versions.
export function failFromZod(error: ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fail("validation", undefined, fieldErrors);
}
