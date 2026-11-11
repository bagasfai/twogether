import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMyProfile } from "@/lib/dal/profile";
import { requireUser } from "@/lib/dal/user";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const profile = await getMyProfile();
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-md">
      <AvatarUploader userId={user.id} name={profile.fullName} initialUrl={profile.avatarUrl} />
      <ProfileForm
        defaultValues={{
          fullName: profile.fullName ?? "",
          phone: profile.phone ?? "",
          gender: profile.gender ?? undefined,
        }}
      />
    </div>
  );
}
