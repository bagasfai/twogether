"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { cancelMembership } from "@/lib/actions/memberships";
import type { AdminMembershipRow, MembershipStatus } from "@/lib/dal/memberships";

const STATUS_LABEL: Record<MembershipStatus, string> = {
  queued: "Queued",
  active: "Active",
  exhausted: "Exhausted",
  expired: "Expired",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<MembershipStatus, "success" | "warning" | "secondary" | "outline" | "destructive"> = {
  active: "success",
  queued: "warning",
  exhausted: "secondary",
  expired: "outline",
  cancelled: "destructive",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function MembershipsTable({ memberships }: { memberships: AdminMembershipRow[] }) {
  const [pending, startTransition] = useTransition();

  const cancel = (id: string) =>
    startTransition(async () => {
      const result = await cancelMembership(id);
      if (result.ok) toast.success("Membership cancelled.");
      else toast.error(result.message);
    });

  if (memberships.length === 0) {
    return <p className="text-sm text-muted-foreground">No memberships granted yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Quota</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {memberships.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{m.memberName ?? "Unnamed player"}</TableCell>
            <TableCell>{m.planName ?? "-"}</TableCell>
            <TableCell>
              {m.quotaUsed} / {m.quotaTotal}
            </TableCell>
            <TableCell>{formatDate(m.expiresAt)}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {m.status === "cancelled" || m.status === "expired" || m.status === "exhausted" ? null : (
                <HoldToConfirmButton
                  label="Hold to cancel"
                  className="h-11"
                  disabled={pending}
                  onConfirm={() => cancel(m.id)}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
