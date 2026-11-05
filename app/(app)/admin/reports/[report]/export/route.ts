import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal/user";
import { ReportForbiddenError } from "@/lib/dal/reports";
import { REPORT_DEFINITIONS, isReportSlug } from "@/lib/reports/definitions";
import { REPORT_ROW_CAP, parseReportRange } from "@/lib/reports/params";
import { toCsv, type CsvColumn } from "@/lib/reports/csv";
import { first, jakartaToday } from "@/lib/reports/today";

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });

// UX layer only: the report RPCs enforce is_admin() themselves. Order is fixed:
// 401 -> 403 -> 404 -> 400, so nothing about slugs or params is revealed to a
// caller who is not an admin. Invalid dates are a 400, never a silent fallback
// to the default range, because that would export data for the wrong period.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/admin/reports/[report]/export">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return text("Unauthorized", 401);
  if (user.role !== "admin") return text("Forbidden", 403);

  const { report } = await ctx.params;
  if (!isReportSlug(report)) return text("Not found", 404);

  const sp = request.nextUrl.searchParams;
  const parsed = parseReportRange(
    { from: first(sp.get("from") ?? undefined), to: first(sp.get("to") ?? undefined) },
    jakartaToday(),
  );
  if (!parsed.ok) {
    return text(
      parsed.reason === "order"
        ? "Invalid range: from must not be after to"
        : "Invalid date: use YYYY-MM-DD for from and to",
      400,
    );
  }
  const { range } = parsed;

  try {
    // The definitions are a union of per-report row types; the pair is only
    // ever used together, so widen once here.
    const def = REPORT_DEFINITIONS[report] as {
      fetch: (r: typeof range) => Promise<{ rows: unknown[]; truncated: boolean }>;
      columns: CsvColumn<unknown>[];
    };
    const { rows, truncated } = await def.fetch(range);
    const body = toCsv(
      def.columns,
      rows,
      truncated ? { note: `Truncated at ${REPORT_ROW_CAP} rows` } : undefined,
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="twogether-${report}-${range.from}_${range.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReportForbiddenError) return text("Forbidden", 403);
    console.error("[reports] export failed", err);
    return text("Report failed", 500);
  }
}
