import { requireAdmin } from "@/lib/dal/user";
import { listAllMembers } from "@/lib/dal/admin";
import { MemberRoleTable } from "@/components/admin/member-role-table";
import { listCommunityAnnouncementsForAdmin } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";

export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const [members, announcements] = await Promise.all([
    listAllMembers(),
    listCommunityAnnouncementsForAdmin(),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Change a member&apos;s role. Hosts can manage sessions; admins can do everything a host
            can, plus this page.
          </p>
        </header>
        <MemberRoleTable members={members} currentUserId={user.id} />
      </section>

      <section>
        <AnnouncementList sessionId={null} announcements={announcements} />
      </section>
    </div>
  );
}
