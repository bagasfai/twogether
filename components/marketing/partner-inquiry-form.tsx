"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, useFocusFormError, useFormField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitPartnerInquiry } from "@/lib/actions/partner-inquiry";
import { hasVisibleFieldError } from "@/lib/partner/visible-field-error";
import { applyFieldErrors } from "@/lib/forms/apply-field-errors";
import {
  PARTNER_INQUIRY_TYPES,
  partnerInquirySchema,
  type PartnerInquiryInput,
} from "@/lib/validation/partner-inquiry";

// The schema transforms whatsapp, so the form holds the raw string it types
// and the action receives the schema output.
type FormValues = z.input<typeof partnerInquirySchema>;

// Schema and server messages are i18n keys, not copy. Anything that is not one
// of ours falls back to the generic message rather than rendering a raw key.
function FieldMessage({ translate }: { translate: (message: string) => string }) {
  const { error, formMessageId } = useFormField();
  if (!error?.message) return null;
  return (
    <p id={formMessageId} role="alert" className="text-sm text-destructive-text">
      {translate(String(error.message))}
    </p>
  );
}

export function PartnerInquiryForm() {
  const t = useTranslations("partner");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, PartnerInquiryInput>({
    resolver: zodResolver(partnerInquirySchema),
    defaultValues: {
      name: "", organisation: "", email: "", whatsapp: "", inquiryType: undefined, message: "", website: "",
    },
  });
  const rootErrorRef = useFocusFormError(form.formState.errors.root);

  const translate = (message: string) =>
    message.startsWith("partner.errors.") ? t(message.slice("partner.".length) as never) : t("genericError");

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await submitPartnerInquiry(values);
      if (result.ok) {
        setSent(true);
        return;
      }
      if (result.code === "rate_limited") {
        form.setError("root", { message: t("rateLimited") });
        return;
      }
      if (result.code === "validation") {
        applyFieldErrors(form, result.fieldErrors);
        if (hasVisibleFieldError(result.fieldErrors)) return;
      }
      form.setError("root", { message: t("genericError") });
    }),
  );

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-2xl bg-sky-pale p-6">
        <h3 className="font-display text-2xl font-extrabold uppercase italic leading-tight">
          {t("successTitle")}
        </h3>
        <p className="max-w-[52ch] text-base">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="organisation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("organisation")}</FormLabel>
              <FormControl>
                <Input autoComplete="organization" {...field} />
              </FormControl>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("email")}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("whatsapp")}</FormLabel>
              <FormControl>
                <Input type="tel" inputMode="tel" autoComplete="tel" placeholder={t("whatsappHint")} {...field} />
              </FormControl>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="inquiryType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("inquiryType")}</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange} onOpenChange={(open) => { if (!open) field.onBlur(); }}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("inquiryTypePlaceholder")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PARTNER_INQUIRY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("message")}</FormLabel>
              <FormControl>
                <Textarea rows={5} {...field} />
              </FormControl>
              <FieldMessage translate={translate} />
            </FormItem>
          )}
        />
        {/* Honeypot: off-screen, skipped by keyboard and screen readers. */}
        <div className="sr-only" aria-hidden="true">
          <Input
            {...form.register("website")}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        {form.formState.errors.root ? (
          <p
            ref={rootErrorRef}
            role="alert"
            tabIndex={-1}
            className="text-sm text-destructive-text outline-none"
          >
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <Button type="submit" className="min-h-11 self-start" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
