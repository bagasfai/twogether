import type { ReactElement } from "react";
import type { Database } from "@/types/supabase";
import { Bumped } from "@/lib/email/templates/bumped";
import { RegistrationCancelled } from "@/lib/email/templates/registration-cancelled";
import { RegistrationConfirmed } from "@/lib/email/templates/registration-confirmed";
import { RegistrationWaitlisted } from "@/lib/email/templates/registration-waitlisted";
import { SessionCancelled } from "@/lib/email/templates/session-cancelled";
import { SessionChanged } from "@/lib/email/templates/session-changed";
import { SessionReminder } from "@/lib/email/templates/session-reminder";
import { WaitlistPromoted } from "@/lib/email/templates/waitlist-promoted";

export type EmailType = Database["public"]["Enums"]["email_type"];

export type EmailContext = {
  name: string | null;
  sessionTitle: string;
  startsAt: string;
  endsAt: string;
  location: string;
  sessionUrl: string;
  profileUrl: string;
  payload: Record<string, unknown>;
};

export const EMAIL_TEMPLATES: Record<
  EmailType,
  {
    subject: (ctx: EmailContext) => string;
    Component: (props: { ctx: EmailContext }) => ReactElement;
  }
> = {
  registration_confirmed: {
    subject: (ctx) => `Pendaftaran kamu terkonfirmasi: ${ctx.sessionTitle}`,
    Component: RegistrationConfirmed,
  },
  registration_waitlisted: {
    subject: (ctx) => `Kamu masuk daftar tunggu: ${ctx.sessionTitle}`,
    Component: RegistrationWaitlisted,
  },
  registration_cancelled: {
    subject: (ctx) => `Pendaftaran kamu dibatalkan: ${ctx.sessionTitle}`,
    Component: RegistrationCancelled,
  },
  waitlist_promoted: {
    subject: (ctx) => `Kamu dapat slot di ${ctx.sessionTitle}`,
    Component: WaitlistPromoted,
  },
  bumped: {
    subject: () => "Kamu dipindah ke daftar tunggu",
    Component: Bumped,
  },
  session_cancelled: {
    subject: (ctx) => `Sesi dibatalkan: ${ctx.sessionTitle}`,
    Component: SessionCancelled,
  },
  session_changed: {
    subject: (ctx) => `Perubahan jadwal sesi: ${ctx.sessionTitle}`,
    Component: SessionChanged,
  },
  session_reminder: {
    subject: (ctx) => `Pengingat: ${ctx.sessionTitle} besok`,
    Component: SessionReminder,
  },
};
