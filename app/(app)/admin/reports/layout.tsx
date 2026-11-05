import type { ReactNode } from "react";
import { PageTitle } from "@/components/app/page-title";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageTitle description="Attendance, revenue, members and hosts for a date range. Dates are in Asia/Jakarta.">
        Reports
      </PageTitle>
      {children}
    </div>
  );
}
