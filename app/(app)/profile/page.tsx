import { notFound } from "next/navigation";
import { getMyProfile } from "@/lib/dal/profile";
import { requireUser } from "@/lib/dal/user";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  await requireUser("/profile");
  const profile = await getMyProfile();
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-md">
      <ProfileForm
        defaultValues={{
          fullName: profile.fullName ?? "",
          phone: profile.phone ?? "",
          avatarUrl: profile.avatarUrl ?? "",
        }}
      />
    </div>
  );
}
