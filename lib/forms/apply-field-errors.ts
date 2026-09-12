import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

// Only the two methods actually used, and only in the shape this file calls
// them (getValues with no arguments). setError is typed exactly as
// react-hook-form types it -- depending on TFieldValues alone, never on a
// form's TContext or TTransformedValues -- so this one signature structurally
// accepts a UseFormReturn from any of the app's forms, single-generic or
// three-generic, with no cast required at any call site.
type FieldErrorTarget<TFieldValues extends FieldValues> = {
  getValues: () => TFieldValues;
  setError: UseFormSetError<TFieldValues>;
};

// field is narrowed to a real key of the form's own values before it is ever
// handed to setError, so the one `as` below asserts something already
// confirmed at runtime -- it does not assert the raw, unvalidated key a
// Server Action returned.
function isOwnField<TFieldValues extends FieldValues>(
  field: string,
  values: TFieldValues,
): field is FieldPath<TFieldValues> {
  return Object.prototype.hasOwnProperty.call(values, field);
}

/**
 * Maps a Server Action's fieldErrors onto a form. Keys come from the action as
 * an unconstrained Record<string, string[]>, so they are checked against the
 * form's own fields before use rather than asserted with `as`. "_form" and any
 * key the form does not own are skipped -- the caller surfaces result.message
 * through the root error.
 */
export function applyFieldErrors<TFieldValues extends FieldValues>(
  form: FieldErrorTarget<TFieldValues>,
  fieldErrors: Record<string, string[]> | undefined,
): void {
  if (!fieldErrors) return;
  const values = form.getValues();

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field === "_form") continue;
    if (!isOwnField(field, values)) continue;

    const message = messages[0];
    if (message) form.setError(field, { message });
  }
}
