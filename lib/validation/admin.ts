import { z } from "zod";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role"];

// Derived from the generated enum, not hand-written -- see the identical
// comment in lib/validation/participants.ts.
const USER_ROLE_VALUES = {
  member: true,
  host: true,
  admin: true,
} satisfies Record<UserRole, true>;

export const setUserRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(Object.keys(USER_ROLE_VALUES) as [UserRole, ...UserRole[]]),
});

export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;
