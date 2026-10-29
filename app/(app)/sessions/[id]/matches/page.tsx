import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTitle, SectionTitle } from "@/components/app/page-title";
import { MatchHistoryList } from "@/components/sessions/match-history-list";
import { getMatchHistory } from "@/lib/dal/match-history";
import { requireUser } from "@/lib/dal/user";

export const metadata: Metadata = { title: "Matches" };

export default async function SessionMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/sessions/${id}/matches`);

  const history = await getMatchHistory(id);
  if (!history) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle>{history.sessionTitle}: matches</PageTitle>
      <MatchHistoryList matches={history.matches} />
    </div>
  );
}
