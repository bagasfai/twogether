import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { requireUser } from "@/lib/dal/user";
import { RESET_PASSWORD_PATH } from "@/lib/auth/otp";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  await requireUser(RESET_PASSWORD_PATH);
  return <ResetPasswordForm />;
}
