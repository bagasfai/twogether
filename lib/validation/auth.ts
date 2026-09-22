import { z } from "zod";
import { requiredPhone } from "@/lib/validation/phone";

// Matches minimum_password_length in supabase/config.toml. If one moves, move both.
const PASSWORD_MIN = 8;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  // Required so a host always has a way to reach a registrant directly --
  // see the signup-phone migration for why the database column stays
  // nullable despite this.
  phone: requiredPhone,
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`),
});

// Deliberately not signUpSchema: an existing account may predate the current
// length floor, and rejecting it here would lock the owner out of their own
// login form rather than letting Supabase answer.
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
