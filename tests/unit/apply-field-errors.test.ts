import { describe, expect, it, vi } from "vitest";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";

// A minimal stub of the two react-hook-form methods the helper actually
// uses. getValues() supplies the set of keys the form owns; setError()
// records what was called so tests can assert against it.
function makeForm(values: Record<string, unknown>) {
  const setError = vi.fn();
  return {
    form: { getValues: () => values, setError },
    setError,
  };
}

describe("applyFieldErrors", () => {
  it("sets the first message on a field the form owns", () => {
    const { form, setError } = makeForm({ fullName: "", phone: "", avatarUrl: "" });

    applyFieldErrors(form, { fullName: ["Enter your name", "Name is too long"] });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("fullName", { message: "Enter your name" });
  });

  it("skips _form -- the caller surfaces it through the root error instead", () => {
    const { form, setError } = makeForm({ fullName: "" });

    applyFieldErrors(form, { _form: ["Something went wrong"] });

    expect(setError).not.toHaveBeenCalled();
  });

  it("skips a key the form does not own rather than throwing or setting it anyway", () => {
    const { form, setError } = makeForm({ fullName: "" });

    expect(() => applyFieldErrors(form, { doesNotExist: ["nope"] })).not.toThrow();
    expect(setError).not.toHaveBeenCalled();
  });

  it("is a no-op when fieldErrors is undefined", () => {
    const { form, setError } = makeForm({ fullName: "" });

    expect(() => applyFieldErrors(form, undefined)).not.toThrow();
    expect(setError).not.toHaveBeenCalled();
  });

  it("does not set an error when the message array for a known field is empty", () => {
    const { form, setError } = makeForm({ fullName: "" });

    applyFieldErrors(form, { fullName: [] });

    expect(setError).not.toHaveBeenCalled();
  });

  it("applies errors for multiple known fields and ignores unknown ones together", () => {
    const { form, setError } = makeForm({ fullName: "", phone: "" });

    applyFieldErrors(form, {
      fullName: ["Enter your name"],
      phone: ["Enter a valid phone number"],
      email: ["ignored -- not a field on this form"],
    });

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith("fullName", { message: "Enter your name" });
    expect(setError).toHaveBeenCalledWith("phone", { message: "Enter a valid phone number" });
  });
});
