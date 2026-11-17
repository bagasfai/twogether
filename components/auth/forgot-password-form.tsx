"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { requestPasswordReset } from "@/lib/actions/auth";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const rootErrorRef = useFocusFormError(form.formState.errors.root);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await requestPasswordReset(values);

      if (result.ok) {
        setSent(true);
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      form.setError("root", { message: result.message });
    }),
  );

  if (sent) {
    return (
      <Card className="w-full max-w-sm rounded-3xl border-0 shadow-float">
        <CardHeader>
          <CardTitle className="text-4xl font-extrabold uppercase italic"><h1>Check your email</h1></CardTitle>
          <CardDescription>
            If an account uses that address, we sent a link to set a new password. It works for one hour.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full"><Link href="/login">Back to login</Link></Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm rounded-3xl border-0 shadow-float">
      <CardHeader>
        <CardTitle className="text-4xl font-extrabold uppercase italic"><h1>Forgot password</h1></CardTitle>
        <CardDescription>Enter your email and we will send a link to set a new one.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p ref={rootErrorRef} role="alert" tabIndex={-1} className="text-sm text-destructive-text outline-none">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending link…" : "Send reset link"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Remembered it? <Link href="/login" className="underline">Log in</Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
