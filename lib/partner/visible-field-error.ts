const VISIBLE_FIELDS = ["name", "organisation", "email", "whatsapp", "inquiryType", "message"];

// True when a server validation result touches a field the user can see, so the
// form can skip its generic root message. The honeypot ("website") is not visible.
export function hasVisibleFieldError(fieldErrors: Record<string, string[]> | undefined): boolean {
  if (!fieldErrors) return false;
  return Object.keys(fieldErrors).some((k) => VISIBLE_FIELDS.includes(k));
}
