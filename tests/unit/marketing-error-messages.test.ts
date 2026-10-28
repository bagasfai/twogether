import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

const NOT_FOUND = ["body", "home", "title"];
const GENERIC = ["body", "offline", "retry", "title"];

type ErrorMessages = {
  errors?: { notFound?: Record<string, unknown>; generic?: Record<string, unknown> };
};

describe.each([
  ["en", en as ErrorMessages],
  ["id", id as ErrorMessages],
])("errors messages (%s)", (_locale, messages) => {
  it("has exactly the notFound and generic keys", () => {
    expect(Object.keys(messages.errors?.notFound ?? {}).sort()).toEqual(NOT_FOUND);
    expect(Object.keys(messages.errors?.generic ?? {}).sort()).toEqual(GENERIC);
  });

  it("has a non-empty string for every value", () => {
    const values = [
      ...Object.values(messages.errors?.notFound ?? {}),
      ...Object.values(messages.errors?.generic ?? {}),
    ];
    expect(values).toHaveLength(NOT_FOUND.length + GENERIC.length);
    for (const value of values) {
      expect(typeof value).toBe("string");
      expect((value as string).trim()).not.toBe("");
    }
  });
});

describe("errors messages parity", () => {
  it("en and id carry identical key sets", () => {
    const e = en as ErrorMessages;
    const i = id as ErrorMessages;
    expect(Object.keys(i.errors?.notFound ?? {}).sort()).toEqual(
      Object.keys(e.errors?.notFound ?? {}).sort(),
    );
    expect(Object.keys(i.errors?.generic ?? {}).sort()).toEqual(
      Object.keys(e.errors?.generic ?? {}).sort(),
    );
  });
});
