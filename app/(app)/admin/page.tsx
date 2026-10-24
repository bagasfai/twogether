import { requireAdmin } from "@/lib/dal/user";
import { listAllMembers } from "@/lib/dal/admin";
import { MemberRoleTable } from "@/components/admin/member-role-table";
import { listCommunityAnnouncementsForAdmin } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { listAdminAlbums, listAllPendingForAdmin } from "@/lib/dal/galleries";
import { AlbumAdminSection } from "@/components/gallery/album-admin-section";
import { getAboutForAdmin, listFaqItemsForAdmin } from "@/lib/dal/community-content-admin";
import { AboutEditor } from "@/components/admin/about-editor";
import { FaqEditor } from "@/components/admin/faq-editor";
import { listMembershipsForAdmin, listPlans } from "@/lib/dal/memberships";
import { MembershipPlansPanel } from "@/components/admin/membership-plans-panel";
import { GrantMembershipDialog } from "@/components/admin/grant-membership-dialog";
import { MembershipsTable } from "@/components/admin/memberships-table";

export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const [members, announcements, albums, pending, about, faqItems, plans, memberships, messages] = await Promise.all([
    listAllMembers(),
    listCommunityAnnouncementsForAdmin(),
    listAdminAlbums(),
    listAllPendingForAdmin(),
    getAboutForAdmin(),
    listFaqItemsForAdmin(),
    listPlans(),
    listMembershipsForAdmin(),
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

      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Memberships</h2>
          <p className="text-sm text-muted-foreground">
            Premium plans and the memberships granted to members. Payment is tracked manually.
          </p>
        </header>
        <MembershipPlansPanel plans={plans} />
        <div className="flex justify-end">
          <GrantMembershipDialog members={members} plans={plans} />
        </div>
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <MembershipsTable memberships={memberships} />
        </NextIntlClientProvider>
      </section>

      <section>
        <AnnouncementList sessionId={null} announcements={announcements} />
      </section>

      <section>
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <AlbumAdminSection albums={albums} pending={pending} />
        </NextIntlClientProvider>
      </section>

      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">About page</h2>
          <p className="text-sm text-muted-foreground">
            Shown publicly at /about in both languages.
          </p>
        </header>
        <AboutEditor about={about} />
      </section>

      <section>
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <FaqEditor items={faqItems} />
        </NextIntlClientProvider>
      </section>
    </div>
  );
}
