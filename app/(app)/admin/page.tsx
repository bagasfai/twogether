import { requireAdmin } from "@/lib/dal/user";
import { listAllMembers } from "@/lib/dal/admin";
import { MemberRoleTable } from "@/components/admin/member-role-table";
import { listCommunityAnnouncementsForAdmin } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { listAdminAlbums, listAllPendingForAdmin } from "@/lib/dal/galleries";
import { AlbumAdminSection } from "@/components/gallery/album-admin-section";

export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const [members, announcements, albums, pending, messages] = await Promise.all([
    listAllMembers(),
    listCommunityAnnouncementsForAdmin(),
    listAdminAlbums(),
    listAllPendingForAdmin(),
    // (app) has no NextIntlClientProvider; the gallery components read the
    // "gallery" namespace, so provide just that, in English.
    getMessages({ locale: "en" }),
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

      <section>
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <AlbumAdminSection albums={albums} pending={pending} />
        </NextIntlClientProvider>
      </section>
    </div>
  );
}
