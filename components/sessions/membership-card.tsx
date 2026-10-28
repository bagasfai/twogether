import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyMembershipRow } from "@/lib/dal/memberships";
import { formatDate } from "@/lib/format/datetime";

// Shows the active membership (quota left, expiry) and any queued ones.
// Renders nothing when the member has neither; expired, exhausted and
// cancelled memberships are history, not shown here.
export function MembershipCard({ memberships }: { memberships: MyMembershipRow[] }) {
  const active = memberships.find((m) => m.status === "active");
  const queued = memberships.filter((m) => m.status === "queued");
  if (!active && queued.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your membership
          {active ? <Badge variant="success">Premium</Badge> : <Badge variant="outline">Queued</Badge>}
        </CardTitle>
        {active ? (
          <CardDescription>
            {active.planName ?? "Membership"}
            {active.expiresAt ? ` · expires ${formatDate(active.expiresAt)}` : ""}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {active ? (
          <p>
            <span className="font-mono text-2xl font-semibold tabular-nums">{active.quotaLeft}</span>
            <span className="text-muted-foreground"> of {active.quotaTotal} sessions left</span>
          </p>
        ) : null}
        {queued.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium">Up next</p>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {queued.map((m) => (
                <li key={m.id}>
                  {m.planName ?? "Membership"} · <span className="font-mono tabular-nums">{m.quotaTotal}</span> sessions,
                  starts when the current one ends
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
