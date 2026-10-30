import type { Metadata } from "next";
import { PageTitle } from "@/components/app/page-title";
import { AdminSection } from "@/components/admin/admin-section";
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
import { listFeaturedPostsForAdmin, listSocialLinksForAdmin } from "@/lib/dal/socials";
import { SocialLinksEditor } from "@/components/admin/social-links-editor";
import { FeaturedPostsEditor } from "@/components/admin/featured-posts-editor";
import { listPartnerInquiriesForAdmin, countNewPartnerInquiries } from "@/lib/dal/partner-inquiries";
import { PartnerInquiriesTable } from "@/components/admin/partner-inquiries-table";
import { Badge } from "@/components/ui/badge";
import { listMembershipsForAdmin, listPlans } from "@/lib/dal/memberships";
import { MembershipPlansPanel } from "@/components/admin/membership-plans-panel";
import { GrantMembershipDialog } from "@/components/admin/grant-membership-dialog";
import { MembershipsTable } from "@/components/admin/memberships-table";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  const [members, announcements, albums, pending, about, faqItems, socialLinks, featuredPosts, inquiries, newInquiryCount, plans, memberships, messages] = await Promise.all([
    listAllMembers(),
    listCommunityAnnouncementsForAdmin(),
    listAdminAlbums(),
    listAllPendingForAdmin(),
    getAboutForAdmin(),
    listFaqItemsForAdmin(),
    listSocialLinksForAdmin(),
    listFeaturedPostsForAdmin(),
    listPartnerInquiriesForAdmin(),
    countNewPartnerInquiries(),
    listPlans(),
    listMembershipsForAdmin(),
    // (app) has no NextIntlClientProvider; the gallery components read the
    // "gallery" namespace, so provide just that, in English.
    getMessages({ locale: "en" }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle className="mb-2">Admin</PageTitle>

      <AdminSection
        title="Members"
        description="Change a member's role. Hosts can manage sessions; admins can do everything a host can, plus this page."
        defaultOpen
      >
        <MemberRoleTable members={members} currentUserId={user.id} />
      </AdminSection>

      <AdminSection
        title="Memberships"
        description="Premium plans and the memberships granted to members. Payment is tracked manually."
      >
        <MembershipPlansPanel plans={plans} />
        <div className="flex justify-end">
          <GrantMembershipDialog members={members} plans={plans} />
        </div>
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <MembershipsTable memberships={memberships} />
        </NextIntlClientProvider>
      </AdminSection>

      <AdminSection title="Announcements" description="Community-wide posts shown on every member's dashboard.">
        <AnnouncementList sessionId={null} announcements={announcements} hideHeading />
      </AdminSection>

      <AdminSection
        title="Albums"
        description="Session albums appear when a session starts. Create other albums here for events outside a session."
        badge={pending.length > 0 ? <Badge>{pending.length} to review</Badge> : null}
      >
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <AlbumAdminSection albums={albums} pending={pending} hideHeading />
        </NextIntlClientProvider>
      </AdminSection>

      <AdminSection title="About page" description="Shown publicly at /about in both languages.">
        <AboutEditor about={about} />
      </AdminSection>

      <AdminSection title="FAQ" description="Shown publicly at /faq in both languages.">
        <NextIntlClientProvider locale="en" messages={{ gallery: messages.gallery }}>
          <FaqEditor items={faqItems} hideHeading />
        </NextIntlClientProvider>
      </AdminSection>

      <AdminSection title="Social links" description="Shown on the home page and footer. Hidden links stay saved.">
        <SocialLinksEditor links={socialLinks} />
      </AdminSection>

      <AdminSection title="Featured posts" description="The 6 newest visible posts appear on the home page.">
        <FeaturedPostsEditor posts={featuredPosts} />
      </AdminSection>

      <AdminSection
        title="Partner inquiries"
        description="Sent from /partner. Reply by email or WhatsApp, then update the status."
        badge={newInquiryCount > 0 ? <Badge>{newInquiryCount} new</Badge> : null}
      >
        <PartnerInquiriesTable inquiries={inquiries} />
      </AdminSection>
    </div>
  );
}
