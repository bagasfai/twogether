# Socials, Featured Posts and Partner Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-editable social links, a featured-posts carousel and a "Follow our socials" section to the landing page, and a `/partner` page whose inquiries are stored, emailed to one inbox and triaged on `/admin`.

**Architecture:** One migration adds three tables (`social_links`, `featured_posts`, `partner_inquiries`), their RLS and grants, `social_link_*` RPCs copied from the FAQ RPCs, and a public `featured-posts` storage bucket. Admin writes go through server actions on the user's client, so RLS enforces admin. Inquiry inserts go through a server action on the service-role client, with a honeypot, a per-IP-hash rate limit and a best-effort claim-then-send Resend email. Public pages read through the DAL and are refreshed with `revalidatePath` pattern paths.

**Tech Stack:** Next.js App Router, Supabase (Postgres, RLS, Storage), next-intl, react-hook-form + zod, shadcn/ui (`Carousel` = Embla), Resend + React Email, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-29-socials-partner-design.md`

## Global Constraints

- Wording: "Partner" / "Kemitraan" / "Jadi Partner Kami". Never "collab", "kolaborasi" or "kerja sama", in code identifiers, copy or routes.
- Every public string exists in both `messages/id.json` and `messages/en.json`. Admin UI is English-only, like the existing admin.
- Platforms: `instagram`, `tiktok`, `whatsapp`, `ayo`, `other`. Kinds: `schedule`, `match`, `video`, `other`. Inquiry types: `sponsorship`, `event`, `brand`, `media`, `other`. Status: `new`, `replied`, `closed`.
- URLs stored in `social_links.url` and `featured_posts.post_url` must start with `https://` and be at most 500 chars.
- Landing carousel: 6 newest visible posts by `posted_at desc, created_at desc`. No autoplay.
- Rate limit: max 3 inquiries per `ip_hash` per rolling hour. `ip_hash` = SHA-256 hex of `${INQUIRY_IP_SALT}:${ip}`. Never store the raw IP.
- WhatsApp is required on the inquiry form.
- Inquiry email goes to `PARTNER_INBOX_EMAIL` from `no-reply@${RESEND_EMAIL_DOMAIN}`, with `replyTo` = the inquirer's email. A failed or skipped email never fails the submit.
- Featured-post images: JPEG/PNG/WebP, max 5 MB, public bucket `featured-posts`, admin-only writes.
- Touch targets ≥ 44px. Keep the existing focus rings and reduced-motion support.
- After the migration: `npx supabase db reset && npx supabase test db`, then `npx supabase gen types typescript --local > types/supabase.ts`.

**Deviations from the spec, decided while planning (follow these):**
- Reordering uses `social_link_move(p_id uuid, p_direction text)`, copying `faq_move`, instead of `reorder_social_links(ids uuid[])`. Same codebase pattern as FAQ; the editor has up/down buttons anyway.
- Featured-post images are uploaded from the admin's browser straight to storage (resized with `resizeForUpload` from `lib/gallery/image.ts`), then the action records `image_path`. This is the gallery pattern, and it avoids the server-action body limit. The object path is `{uuid}.{webp|jpg}` (no folder). The action checks it with `/^[0-9a-f-]{36}\.(webp|jpg)$/`.

## Review Focus

1. **No `x-forwarded-for` header** (local dev, unusual proxy): the submit must still work. Hash the literal `"unknown"`, so all such requests share one rate-limit bucket. Test in Task 6.
2. **WhatsApp formats people actually type** (`0812-3456-7890`, `+62 812 3456 7890`, `628123456789`, `812 3456 7890`): normalise every one to `+628123456789`. Reject `12345` and letters. Test in Task 2.
3. **Editing a featured post without picking a new image** must keep the old `image_path`. Replacing it must delete the old object after the row update succeeds. Test in Task 5.
4. **Long Indonesian captions and labels** must not stretch carousel cards or social cards: `line-clamp-2` on captions, `truncate` on labels. Manual check in Task 10.
5. **One or zero visible posts or links:** zero hides the section. One post renders a single card with no prev/next buttons. Test in Task 8.

---

### Task 1: Migration, RLS, RPCs, storage bucket

**Files:**
- Create: `supabase/migrations/20261029000001_socials_partner.sql`
- Create: `supabase/tests/047_socials_partner_rls.test.sql`
- Create: `supabase/tests/048_socials_partner_grant_surface_negatives.test.sql`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Produces: enums `social_platform`, `featured_post_kind`, `partner_inquiry_type`, `partner_inquiry_status`. Tables `social_links`, `featured_posts`, `partner_inquiries`, with the columns exactly as in the spec's Database section. RPCs `social_link_create(p_platform social_platform, p_url text, p_label text, p_is_visible boolean) returns uuid`, `social_link_move(p_id uuid, p_direction text) returns void` (`'up'|'down'`), `social_link_delete(p_id uuid) returns void`, plus `social_links_lock_key()`. Bucket `featured-posts`.

- [ ] **Step 1: Write pgTAP tests.** `047` uses fixtures and role switching, in the style of the existing RLS tests (create an admin profile and a member profile, then `set local role` / `request.jwt.claims`). Assertions:
  - anon `select` on `social_links` returns only `is_visible` rows; same for `featured_posts`
  - anon and member `insert`/`update`/`delete` on `social_links` and `featured_posts` raise `42501` or affect 0 rows
  - anon and member `select count(*) from partner_inquiries` raises `42501`
  - admin `update partner_inquiries set status = 'replied'` succeeds; admin `update ... set message = 'x'` raises `42501`
  - admin `insert into partner_inquiries` raises `42501`
  - `insert` with `url = 'http://x.com'` raises `23514`; `whatsapp = '12ab'` raises `23514`
  - `social_link_create` as member raises; as admin it appends with `sort_order = max + 1`
  - `social_link_move(id, 'up')` swaps with the neighbour

  `048` covers the catalog privileges, copying `030`'s shape: anon and PUBLIC lack EXECUTE on the three `social_link_*` RPCs; authenticated has UPDATE on `partner_inquiries.status` only (`has_column_privilege` false for `message`, `email_sent_at`).
- [ ] **Step 2: Run** `npx supabase test db`. Expected: FAIL (relations do not exist).
- [ ] **Step 3: Write the migration.** Tables, indexes and `set_updated_at` triggers exactly as in the spec. RLS, grants and RPCs copy the patterns of `20261022000001_about_faq.sql` and `20261022000002_faq_rpcs.sql` (revoke all, grant select, policies with `public.is_admin()`, security definer with `set search_path = ''`, advisory lock, deferred unique swap, `revoke execute ... from public, anon`). Admin gets direct `update (platform, url, label, is_visible)` on `social_links`, full insert/update/delete on `featured_posts`, and `select` plus `update (status)` on `partner_inquiries`. The storage bucket and policies copy `20261021000003_gallery_storage.sql`: public read, `is_admin()` for insert/update/delete, `file_size_limit = 5242880`, `allowed_mime_types = '{image/jpeg,image/png,image/webp}'`.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`. Expected: all files PASS.
- [ ] **Step 5: Regenerate types:** `npx supabase gen types typescript --local > types/supabase.ts`. Then run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 6: Commit** `feat(db): socials, featured posts, partner inquiries schema`.

### Task 2: Validation schemas

**Files:**
- Create: `lib/validation/socials.ts`, `lib/validation/partner-inquiry.ts`
- Test: `tests/unit/socials-validation.test.ts`, `tests/unit/partner-inquiry-validation.test.ts`

**Interfaces:**
- Produces:
  - `SOCIAL_PLATFORMS`, `FEATURED_POST_KINDS`, `PARTNER_INQUIRY_TYPES`, `PARTNER_INQUIRY_STATUSES` (readonly tuples matching the DB enums)
  - `socialLinkSchema` → `{ platform, url, label, isVisible }`; `socialLinkIdSchema`; `socialLinkMoveSchema` → `{ id, direction: "up"|"down" }`
  - `featuredPostSchema` → `{ platform, postUrl, captionEn, captionId, kind, postedAt: "YYYY-MM-DD", isVisible }`
  - `featuredPostImagePathSchema` (the regex from Global Constraints)
  - `normaliseWhatsapp(raw: string): string | null`
  - `partnerInquirySchema` → `{ name, organisation, email, whatsapp (normalised), inquiryType, message, website }`
  - `partnerInquiryStatusSchema` → `{ id, status }`
  - Types `SocialLinkInput`, `FeaturedPostInput`, `PartnerInquiryInput`

- [ ] **Step 1: Write failing tests.**
  - `normaliseWhatsapp`: `"0812-3456-7890"`, `"+62 812 3456 7890"`, `"628123456789"` and `"812 3456 7890"` all return `"+628123456789"`; `"+44 7700 900123"` returns `"+447700900123"`; `"12345"` and `"08abc"` return `null`.
  - `partnerInquirySchema`:
    - rejects an empty `whatsapp` (error on path `whatsapp`)
    - rejects a 9-char `message` (min 10)
    - rejects `inquiryType: "collab"`
    - accepts `website: ""`
    - parses its own output again without error (idempotent, same reason as `optionalPhone` in `lib/validation/phone.ts`)
  - `socialLinkSchema` rejects `http://` and accepts `https://instagram.com/x`.
  - `featuredPostImagePathSchema` accepts `"3f2b...-36chars.webp"` and rejects `"../x.webp"` and `"a/b.webp"`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/socials-validation.test.ts tests/unit/partner-inquiry-validation.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement both files.** `normaliseWhatsapp`: strip spaces, `-`, `(`, `)`. Then `08…` becomes `+628…`, `8…` becomes `+628…`, `62…` becomes `+62…`. The result must match `/^\+[0-9]{8,15}$/`, else `null`. `partnerInquirySchema.whatsapp` uses a `transform` that calls this, plus a `refine` that rejects `null`. Field limits copy the spec's check constraints. Validation messages are i18n keys (e.g. `"partner.errors.whatsapp"`), and the form translates them.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: zod schemas for socials and partner inquiries`.

### Task 3: DAL, revalidation paths, error code

**Files:**
- Create: `lib/dal/socials.ts`, `lib/dal/partner-inquiries.ts`, `lib/socials/revalidate.ts`
- Modify: `lib/errors/rpc.ts` (add `rate_limited`)
- Test: `tests/unit/socials-revalidate.test.ts`

**Interfaces:**
- Produces:
  - `type SocialLink = { id; platform; url; label; sortOrder; isVisible }`
  - `type FeaturedPost = { id; platform; postUrl; imageUrl; imagePath; captionEn; captionId; kind; postedAt; isVisible }` (`imageUrl` = public storage URL)
  - `type PartnerInquiry = { id; name; organisation; email; whatsapp; inquiryType; message; status; emailSentAt: string | null; createdAt }`
  - `listVisibleSocialLinks(): Promise<SocialLink[]>`
  - `listLatestFeaturedPosts(limit = 6): Promise<FeaturedPost[]>`
  - `listSocialLinksForAdmin()`, `listFeaturedPostsForAdmin()`
  - `listPartnerInquiriesForAdmin(): Promise<PartnerInquiry[]>` (newest first; filtering happens in the client)
  - `countNewPartnerInquiries(): Promise<number>`
  - `socialRevalidationPaths(): RevalidationPath[]`
  - `AppErrorCode` gains `"rate_limited"` with the message `"Too many requests. Please try again later."`

- [ ] **Step 1: Write a failing test:** `socialRevalidationPaths()` equals `[{ path: "/[locale]/(marketing)", type: "page" }, { path: "/[locale]/(marketing)/partner", type: "page" }]`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/socials-revalidate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The public DAL functions use the anon/public client like `lib/dal/community-content.ts`. Admin functions use the server client like `lib/dal/community-content-admin.ts`. On error, public reads return `[]` and log, so a broken query hides the section instead of crashing the landing page. Add `rate_limited` to the `AppErrorCode` union and to `MESSAGES`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat: socials and partner inquiry DAL`.

### Task 4: Social links admin (actions and editor)

**Files:**
- Create: `lib/actions/socials.ts`, `components/admin/social-links-editor.tsx`, `components/marketing/social-icon.tsx`
- Modify: `app/(app)/admin/page.tsx`
- Test: `tests/unit/socials-actions-paths.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas, Task 3 `socialRevalidationPaths`, `listSocialLinksForAdmin`, Task 1 RPCs.
- Produces:
  - `createSocialLink(input: SocialLinkInput): Promise<ActionResult<{ id: string }>>` (RPC `social_link_create`)
  - `updateSocialLink(id: string, input: SocialLinkInput): Promise<ActionResult<null>>` (direct update; 0 rows means `not_authorized`)
  - `moveSocialLink(input: { id; direction }): Promise<ActionResult<null>>`
  - `deleteSocialLink(id: string): Promise<ActionResult<null>>`

  Each one revalidates every path in `socialRevalidationPaths()` and `/admin` on success.
  - `SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string })`: inline SVG, `aria-hidden`; generic link icon for `other`. Used by the admin editor and by Tasks 8 and 9.

- [ ] **Step 1: Write a failing test** in the style of `tests/unit/gallery-actions-paths.test.ts`. Mock `next/cache` and the Supabase client. Assert that `createSocialLink` with valid input calls `revalidatePath` with both social paths and `"/admin"`, and that invalid input returns `{ ok: false, code: "validation" }` without calling the client.
- [ ] **Step 2: Run** `npx vitest run tests/unit/socials-actions-paths.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the actions** following `lib/actions/community-content.ts` (`getCurrentUser` UX check, `failFromRpc`, `failFromZod`). **Implement the editor** following `components/admin/faq-editor.tsx`:
  - a row per link: `SocialIcon`, label, URL, visible badge, up/down buttons, edit button, delete button with confirm dialog
  - an "Add link" dialog using react-hook-form + `socialLinkSchema`
- [ ] **Step 4: Add the section** to `app/(app)/admin/page.tsx` after FAQ: title "Social links", description "Shown on the home page and footer. Hidden links stay saved." Fetch `listSocialLinksForAdmin()` in the existing `Promise.all`.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run lint`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(admin): manage social links`.

### Task 5: Featured posts admin (actions and editor)

**Files:**
- Create: `lib/actions/featured-posts.ts`, `components/admin/featured-posts-editor.tsx`
- Modify: `app/(app)/admin/page.tsx`
- Test: `tests/unit/featured-posts-actions.test.ts`

**Interfaces:**
- Consumes: `featuredPostSchema`, `featuredPostImagePathSchema`, `listFeaturedPostsForAdmin`, `resizeForUpload`/`validatePickedFile` from `lib/gallery/image.ts`.
- Produces:
  - `createFeaturedPost(input: FeaturedPostInput & { imagePath: string }): Promise<ActionResult<{ id: string }>>`
  - `updateFeaturedPost(id: string, input: FeaturedPostInput & { imagePath?: string }): Promise<ActionResult<null>>`
  - `deleteFeaturedPost(id: string): Promise<ActionResult<null>>`
  - `deleteOrphanFeaturedImage(imagePath: string): Promise<void>` (called by the editor when a create fails after the upload)

- [ ] **Step 1: Write failing tests** with an injected or mocked Supabase client:
  - `updateFeaturedPost` without `imagePath` does not include `image_path` in the update payload and does not call `storage.remove`
  - `updateFeaturedPost` with a new `imagePath` updates the row first, then calls `storage.from("featured-posts").remove([oldPath])`
  - if the row update fails, `remove` is not called
  - `deleteFeaturedPost` deletes the row, then removes the object; a `remove` error still returns `{ ok: true }` and logs
  - `createFeaturedPost` with `imagePath: "../x.webp"` returns `validation`
- [ ] **Step 2: Run** `npx vitest run tests/unit/featured-posts-actions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the actions.** Read the old `image_path` before updating. Revalidate the social paths and `/admin`.
- [ ] **Step 4: Implement the editor.**
  - a grid of thumbnails with visible/hidden badges, plus edit and delete
  - a create/edit dialog with these fields: file input (required on create), `postUrl`, platform `Select`, kind `Select`, `captionEn`, `captionId` (`Textarea`, 200 max with a counter), `postedAt` (shadcn calendar/popover, defaulting to today in Asia/Jakarta), visible checkbox
  - on submit with a file: `validatePickedFile` → `resizeForUpload` → upload to `featured-posts/{crypto.randomUUID()}.{ext}` with the browser client → call the action. If the action fails after the upload, call `deleteOrphanFeaturedImage`
- [ ] **Step 5: Add the section** "Featured posts" to the admin page, with the description "The 6 newest visible posts appear on the home page."
- [ ] **Step 6: Run** `npx vitest run && npx tsc --noEmit && npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(admin): manage featured posts`.

### Task 6: Partner inquiry submit and email

**Files:**
- Create: `lib/partner/submit-inquiry.ts`, `lib/partner/ip-hash.ts`, `lib/actions/partner-inquiry.ts`, `lib/email/partner-inquiry-email.tsx`, `lib/email/send-partner-inquiry.ts`
- Modify: `.env.example`
- Test: `tests/unit/partner-submit-inquiry.test.ts`, `tests/unit/send-partner-inquiry.test.ts`

**Interfaces:**
- Consumes: `partnerInquirySchema`, `fail`/`ok`/`failFromZod`.
- Produces:
  - `hashIp(ip: string | null, salt: string): string` (a null or empty IP hashes `"unknown"`)
  - `submitInquiryCore(input: unknown, deps: { supabase; ip: string | null; salt: string; now?: () => Date; sendEmail: (id: string) => Promise<unknown> }): Promise<ActionResult<null>>`
  - `submitPartnerInquiry(input: PartnerInquiryInput): Promise<ActionResult<null>>` (the `"use server"` wrapper: reads `(await headers()).get("x-forwarded-for")?.split(",")[0].trim()`, builds the service client, passes `sendPartnerInquiryEmail`)
  - `sendPartnerInquiryEmail(id: string, deps?: { resend?; supabase? }): Promise<{ sent: boolean }>` (never throws)
  - `PartnerInquiryEmail` React Email component

- [ ] **Step 1: Write failing tests for `submitInquiryCore`:**
  - a filled honeypot (`website: "x"`) returns `{ ok: true }` and the client's `insert` is never called
  - when the count query returns 3 rows in the last hour, it returns `{ ok: false, code: "rate_limited" }` with no insert
  - when the count returns 2, it inserts with `ip_hash = hashIp(ip, salt)` and calls `sendEmail(newId)`
  - when `sendEmail` rejects, it still returns `{ ok: true }`
  - with `ip: null`, the inserted `ip_hash` equals `hashIp("unknown", salt)`
  - the count query filters on `created_at >= now - 3600s`
- [ ] **Step 2: Write failing tests for `sendPartnerInquiryEmail`**, copying the `send-bump-notifications` test style:
  - claim (update where `email_sent_at is null`), then send with `to: PARTNER_INBOX_EMAIL`, `replyTo: <inquiry email>`, `subject: "New partner inquiry: Acme (sponsorship)"`
  - a Resend error releases the claim (sets `email_sent_at` back to null) and returns `{ sent: false }`
  - with `PARTNER_INBOX_EMAIL` unset, no claim and no send; `console.warn` is called
  - a second call after a successful claim sends nothing
- [ ] **Step 3: Run** `npx vitest run tests/unit/partner-submit-inquiry.test.ts tests/unit/send-partner-inquiry.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `hashIp` uses `node:crypto` `createHash("sha256")` on `${salt}:${ip ?? "unknown"}`, returning hex.
  - The email template follows `lib/email/bump-email.tsx`. It contains every field, then `mailto:` and `https://wa.me/<digits>` reply links, then `${getSiteUrl()}/admin`.
  - Add `PARTNER_INBOX_EMAIL=` and `INQUIRY_IP_SALT=` to `.env.example`, with one comment line each, in the existing style.
- [ ] **Step 5: Run** the same command, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: partner inquiry submission and email`.

### Task 7: Partner inquiries admin inbox

**Files:**
- Create: `lib/actions/partner-inquiry-admin.ts`, `components/admin/partner-inquiries-table.tsx`
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `listPartnerInquiriesForAdmin`, `countNewPartnerInquiries`, `partnerInquiryStatusSchema`.
- Produces: `setPartnerInquiryStatus(input: { id: string; status: PartnerInquiryStatus }): Promise<ActionResult<null>>`. It updates `status` only, treats 0 rows as `not_authorized`, and revalidates `/admin`.

- [ ] **Step 1: Implement the action** following `updateAbout` in `lib/actions/community-content.ts`.
- [ ] **Step 2: Implement the table** with shadcn `Table`.
  - Toolbar: status filter (All/New/Replied/Closed, client-side state, default "New").
  - Columns: date (Asia/Jakarta, via the existing datetime helper), name + organisation, type badge, message (the first 120 chars, with a "Show more" toggle), `mailto:` link, `wa.me` link, status `Select` (optimistic, reverts with a sonner toast on failure).
  - A muted "email not sent" marker when `emailSentAt === null`.
- [ ] **Step 3: Add the section** "Partner inquiries", with a `Badge` "N new" when the count is above 0. Description: "Sent from /partner. Reply by email or WhatsApp, then update the status."
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint`. Then manual check: insert a row with `psql` and change its status in the browser. Expected: no errors; the status survives a reload.
- [ ] **Step 5: Commit** `feat(admin): partner inquiries inbox`.

### Task 8: Landing page sections

**Files:**
- Create: `components/ui/carousel.tsx` (via CLI), `components/marketing/featured-posts-carousel.tsx`, `components/marketing/social-links-section.tsx`, `components/marketing/partner-cta.tsx`
- Modify: `app/[locale]/(marketing)/page.tsx`, `messages/id.json`, `messages/en.json`, `package.json`
- Test: `tests/unit/featured-posts-carousel.test.tsx`, `tests/unit/socials-messages.test.ts`

**Interfaces:**
- Consumes: `listLatestFeaturedPosts`, `listVisibleSocialLinks`, types `FeaturedPost`, `SocialLink`, `SocialIcon` (Task 4).
- Produces:
  - `socialVerbKey(platform): "follow" | "join" | "visit"`: instagram/tiktok → follow, whatsapp/ayo → join, other → visit
  - `FeaturedPostsCarousel({ posts, locale })`
  - `SocialLinksSection({ links })`
  - `PartnerCta()`

- [ ] **Step 1: Install the carousel:** `npx shadcn@latest add carousel`. Expected: `components/ui/carousel.tsx` exists and `embla-carousel-react` is in `package.json`.
- [ ] **Step 2: Write failing tests.**
  - The carousel with `posts=[]` renders nothing. With 1 post it renders one link with `href=post_url`, `target="_blank"` and `rel="noopener noreferrer"`, and no prev/next buttons. With 4 posts it renders the buttons. With `locale="id"` it shows `captionId`.
  - `socialVerbKey` maps the 5 platforms as above.
  - `socials-messages.test.ts`, following `home-stats-messages.test.ts`: every new key under `home.featured*`, `home.socials*`, `home.partnerCta*` and `socials.*` exists in both `id.json` and `en.json`, and no value matches `/collab|kolaborasi|kerja sama/i`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/featured-posts-carousel.test.tsx tests/unit/socials-messages.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement the components** using the existing section markup (`font-display ... uppercase italic` h2, `max-w-5xl px-6`).
  - **Carousel:** `CarouselItem` is `basis-[85%] sm:basis-1/2 lg:basis-1/3`. Square `next/image` with `sizes="(min-width:1024px) 33vw, 85vw"`, `Badge` for the kind (translated), `SocialIcon` for the platform, caption `line-clamp-2`. Buttons render only when `posts.length > 1`, and are hidden below `sm`.
  - **Social cards:** `min-h-11`, label `truncate`, translated verb.
  - **Partner CTA:** `bg-navy text-white`, so it's distinct from the cork sign-up band, with a `Link` to `/partner`.
  - **Copy:** add the i18n keys (Indonesian and English), including `home.partnerCtaTitle` = "Brand atau penyelenggara acara? Jadi Partner Kami" / "Brand or event organiser? Partner with us".
- [ ] **Step 5: Wire them into `page.tsx`** in the order from spec §UI/Landing. Fetch both lists in the page's existing data loading. Add `next.config` `images.remotePatterns` for the Supabase storage host, if it isn't already covered by the gallery.
- [ ] **Step 6: Run** `npx vitest run && npx tsc --noEmit && npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(marketing): featured posts carousel and socials sections`.

### Task 9: Nav, footer, `/partner` page, sitemap

**Files:**
- Create: `app/[locale]/(marketing)/partner/page.tsx`, `components/marketing/partner-inquiry-form.tsx`, `components/marketing/partner-offers.tsx`
- Modify: `app/[locale]/(marketing)/layout.tsx`, `lib/seo/sitemap.ts`, `messages/id.json`, `messages/en.json`
- Test: `tests/unit/sitemap.test.ts`, `tests/unit/partner-messages.test.ts`

**Interfaces:**
- Consumes: `submitPartnerInquiry`, `partnerInquirySchema`, `listVisibleSocialLinks`, `SocialIcon`, `CommunityStatsStrip`/`shouldShowStats`, `PARTNER_INQUIRY_TYPES`.
- Produces: route `/partner` (and `/en/partner`).

- [ ] **Step 1: Write failing tests.**
  - In `sitemap.test.ts`, add `"/partner"` to the static-routes loop.
  - `partner-messages.test.ts`: all keys under `partner.*`, `nav.partner` and `footer.partner` exist in both locales. `nav.partner` is `"Kemitraan"` (id) and `"Partner"` (en). `partner.heroTitle` is `"Jadi Partner Kami"` (id) and `"Partner with us"` (en). No value matches `/collab|kolaborasi|kerja sama/i`. Every `partner.errors.*` key referenced by `partnerInquirySchema` exists.
- [ ] **Step 2: Run** `npx vitest run tests/unit/sitemap.test.ts tests/unit/partner-messages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add `"/partner"` to `STATIC_PATHS`.
  - **Layout:** a nav entry after FAQ; in the footer, a social icon row (`aria-label={link.label}`, `target="_blank"`) and a `footer.partner` link.
  - **Page:** `revalidate = 60` and `generateMetadata` (localised title/description). Sections in order: hero (reuse `PageHero`), `PartnerOffers` (4 tiles: sponsorship, event, brand, media), the stats strip when `shouldShowStats`, `PartnerInquiryForm`, then "Or reach us directly" (social links).
  - **Form:** react-hook-form + `zodResolver(partnerInquirySchema)`.
    - Fields: name, organisation, email, WhatsApp (`inputMode="tel"`), type `Select`, message `Textarea`.
    - Honeypot: an `Input name="website"` in a `sr-only` wrapper, with `aria-hidden`, `tabIndex={-1}` and `autoComplete="off"`.
    - On `ok`, swap to a thank-you panel. On `rate_limited`, show the translated inline message. On `validation`, map field errors with the existing `apply-field-errors` helper. Anything else shows a generic error.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): partner page, nav and footer socials`.

### Task 10: End-to-end verification

**Files:** none (fix-ups only, committed with what they fix)

- [ ] **Step 1: Run** `npx supabase db reset && npx supabase test db && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`. Expected: all pass, and the build lists `/[locale]/partner`.
- [ ] **Step 2: Manual check with `npm run dev`**, at 375px and 1280px wide, in `id` and `/en`:
  - **As admin:** add 4 social links (one of them `other`), reorder them, hide one. Add 7 featured posts, one with a 200-char Indonesian caption. Edit one without a new image. Replace another's image.
  - **Landing page:** exactly 6 posts, newest first. Swiping works on mobile and the buttons work on desktop. The long caption is clamped. The hidden link is absent from both the socials section and the footer.
  - **`/partner`:** submit a valid inquiry and see the thank-you panel. The row appears in the admin inbox. With `PARTNER_INBOX_EMAIL` set to your address, the email arrives with a working reply-to. Submit 3 more and see the rate-limit message on the 4th. An empty WhatsApp field shows a field error.
  - Keyboard-tab through the footer icons and the form: focus rings are visible. With reduced motion on, nothing animates except the drag.
- [ ] **Step 3: Remind the user** to set `PARTNER_INBOX_EMAIL` and `INQUIRY_IP_SALT` in Vercel (production and preview) before deploying.
