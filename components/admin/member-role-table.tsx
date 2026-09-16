"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setUserRole } from "@/lib/actions/admin";
import type { MemberRow } from "@/lib/dal/admin";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_LABEL: Record<UserRole, string> = {
  member: "Member",
  host: "Host",
  admin: "Admin",
};

export function MemberRoleTable({ members, currentUserId }: { members: MemberRow[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();

  const changeRole = (userId: string, role: UserRole) =>
    startTransition(async () => {
      const result = await setUserRole(userId, role);
      if (result.ok) toast.success("Role updated");
      else toast.error(result.message);
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>{member.fullName ?? "Unnamed player"}</TableCell>
            <TableCell>{new Date(member.createdAt).toLocaleDateString()}</TableCell>
            <TableCell className="text-right">
              {member.id === currentUserId ? (
                <span className="text-sm text-muted-foreground">{ROLE_LABEL[member.role]} (you)</span>
              ) : (
                <Select
                  value={member.role}
                  disabled={pending}
                  onValueChange={(value) => changeRole(member.id, value as UserRole)}
                >
                  <SelectTrigger className="ml-auto w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="host">Host</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
