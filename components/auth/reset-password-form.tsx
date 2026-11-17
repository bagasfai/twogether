"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, useFocusFormError, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/lib/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";

export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const rootErrorRef = useFocusFormError(form.formState.errors.root);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updatePassword(values);
      // Success calls redirect(), which resolves this promise to `undefined`
      // rather than an ActionResult -- same as LoginForm.
      if (result && !result.ok) {
        applyFieldErrors(form, result.fieldErrors);
        if (result.code !== "validation") form.setError("root", { message: result.message });
      }
    }),
  );

  return (
    <Card className="w-full max-w-sm rounded-3xl border-0 shadow-float">
      <CardHeader>
        <CardTitle className="text-4xl font-extrabold uppercase italic"><h1>New password</h1></CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeat new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p ref={rootErrorRef} role="alert" tabIndex={-1} className="text-sm text-destructive-text outline-none">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
