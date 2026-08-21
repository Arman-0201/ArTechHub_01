'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { MediaDto } from '@academy/types';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Avatar picker.
 *
 * The size and type checks here are for immediate feedback only — the server
 * re-derives the real type from the file's magic bytes and enforces its own
 * limit, so a bypassed client check gains nothing.
 */
export function AvatarUploader({ onUploaded }: { onUploaded: (media: MediaDto) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Images must be 2MB or smaller.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const media = await apiFetch<MediaDto>('/account/avatar', {
        method: 'POST',
        body: formData,
      });
      onUploaded(media);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset so re-selecting the same file fires a change event again.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={handleChange}
        className="sr-only"
        id="avatar-upload"
      />
      <label
        htmlFor="avatar-upload"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {isUploading ? 'Uploading…' : 'Change photo'}
      </label>

      {error ? (
        <p role="alert" className="max-w-40 text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
