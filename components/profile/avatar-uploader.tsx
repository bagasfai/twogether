"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { removeAvatar, setAvatar } from "@/lib/actions/profile";
import { avatarObjectPath, resizeAvatar } from "@/lib/avatar/image";
import { AVATAR_MESSAGES, blobTooLarge, pickError, resizeErrorMessage } from "@/lib/avatar/pick";
import { ACCEPTED_TYPES } from "@/lib/gallery/image";
import { createClient } from "@/lib/supabase/client";

type AvatarUploaderProps = {
  userId: string;
  name: string | null;
  initialUrl: string | null;
};

export function AvatarUploader({ userId, name, initialUrl }: AvatarUploaderProps) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [url, setUrl] = useState(initialUrl);
  const [working, setWorking] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = working || pending;

  async function handleFile(file: File) {
    const invalid = pickError(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setWorking(true);
    try {
      let encoded;
      try {
        encoded = await resizeAvatar(file);
      } catch (error) {
        toast.error(resizeErrorMessage(error));
        return;
      }

      if (blobTooLarge(encoded.blob)) {
        toast.error(AVATAR_MESSAGES.resizedTooLarge);
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(avatarObjectPath(userId, encoded.ext), encoded.blob, {
          upsert: true,
          contentType: encoded.blob.type,
        });
      if (uploadError) {
        toast.error(AVATAR_MESSAGES.upload);
        return;
      }

      const result = await setAvatar({ ext: encoded.ext, version: Date.now() });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setUrl(result.data.avatarUrl);
      toast.success("Photo updated");
      router.refresh();
    } catch {
      toast.error(AVATAR_MESSAGES.upload);
    } finally {
      setWorking(false);
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) void handleFile(file);
  }

  function onRemove() {
    startTransition(async () => {
      try {
        const result = await removeAvatar();
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setUrl(null);
        toast.success("Photo removed");
        router.refresh();
      } catch {
        toast.error("Couldn't remove the photo. Try again.");
      }
    });
  }

  return (
    <div className="mb-6 flex items-center gap-4">
      <UserAvatar name={name} id={userId} src={url} size="lg" decorative={false} />
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPick}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {working ? "Uploading…" : url ? "Replace photo" : "Upload photo"}
        </Button>
        {url ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onRemove}>
            Remove photo
          </Button>
        ) : null}
      </div>
    </div>
  );
}
