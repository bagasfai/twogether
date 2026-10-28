import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";

function Stub() {
  const form = useForm<{ email: string }>({
    errors: { email: { type: "required", message: "Email is required" } },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("form error semantics", () => {
  it("FormMessage announces field errors with role=alert", () => {
    const html = renderToStaticMarkup(<Stub />);
    expect(html).toContain("Email is required");
    expect(html).toContain('role="alert"');
  });

  it("login form root error element has role=alert", () => {
    const src = readFileSync(
      join(process.cwd(), "components/auth/login-form.tsx"),
      "utf8"
    );
    expect(src).toMatch(/<p[^>]*role="alert"[^>]*>\s*\{form\.formState\.errors\.root/);
  });
});
