"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setPartnerInquiryStatus, type PartnerInquiryStatus } from "@/lib/actions/partner-inquiry-admin";
import type { PartnerInquiry } from "@/lib/dal/partner-inquiries";
import { formatDateTime } from "@/lib/format/datetime";

type Filter = PartnerInquiryStatus | "all";

const STATUS_LABEL: Record<PartnerInquiryStatus, string> = {
  new: "New",
  replied: "Replied",
  closed: "Closed",
};

const TYPE_LABEL: Record<PartnerInquiry["inquiryType"], string> = {
  sponsorship: "Sponsorship",
  event: "Event",
  brand: "Brand",
  media: "Media",
  other: "Other",
};

const PREVIEW_LENGTH = 120;

export function PartnerInquiriesTable({ inquiries }: { inquiries: PartnerInquiry[] }) {
  const [filter, setFilter] = useState<Filter>("new");
  // Optimistic overrides keyed by inquiry id; dropped again if the update fails.
  const [overrides, setOverrides] = useState<Record<string, PartnerInquiryStatus>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const statusOf = (inquiry: PartnerInquiry) => overrides[inquiry.id] ?? inquiry.status;
  const visible = inquiries.filter((i) => filter === "all" || statusOf(i) === filter);

  const changeStatus = async (inquiry: PartnerInquiry, status: PartnerInquiryStatus) => {
    setOverrides((prev) => ({ ...prev, [inquiry.id]: status }));
    const result = await setPartnerInquiryStatus({ id: inquiry.id, status });
    if (result.ok) {
      toast.success("Status updated");
      return;
    }
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[inquiry.id];
      return next;
    });
    toast.error(result.message);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-32 min-h-11" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inquiries to show.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((inquiry) => {
              const isOpen = expanded.has(inquiry.id);
              const long = inquiry.message.length > PREVIEW_LENGTH;
              const text =
                long && !isOpen ? `${inquiry.message.slice(0, PREVIEW_LENGTH)}…` : inquiry.message;
              return (
                <TableRow key={inquiry.id}>
                  <TableCell className="whitespace-nowrap align-top">
                    {formatDateTime(inquiry.createdAt)}
                    {inquiry.emailSentAt === null ? (
                      <span className="block text-xs text-muted-foreground">email not sent</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="font-medium">{inquiry.name}</span>
                    <span className="block text-sm text-muted-foreground">{inquiry.organisation}</span>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline">{TYPE_LABEL[inquiry.inquiryType]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal align-top">
                    <p className="break-words whitespace-pre-wrap text-sm">{text}</p>
                    {long ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto min-h-11 p-0"
                        onClick={() => toggle(inquiry.id)}
                      >
                        {isOpen ? "Show less" : "Show more"}
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <a
                      href={`mailto:${encodeURIComponent(inquiry.email)}`}
                      className="block break-all underline underline-offset-2"
                    >
                      {inquiry.email}
                    </a>
                    <a
                      href={`https://wa.me/${inquiry.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all underline underline-offset-2"
                    >
                      {inquiry.whatsapp}
                    </a>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Select
                      value={statusOf(inquiry)}
                      onValueChange={(v) => changeStatus(inquiry, v as PartnerInquiryStatus)}
                    >
                      <SelectTrigger
                        className="ml-auto w-32 min-h-11"
                        aria-label={`Status for ${inquiry.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as PartnerInquiryStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
