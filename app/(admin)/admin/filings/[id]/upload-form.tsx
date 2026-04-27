'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { uploadIssuedDocument } from '@/actions/admin';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard cap to avoid request bloat

export function AdminUploadForm({
  filingId,
  documentType,
}: {
  filingId: string;
  documentType: 'CERT_STATUS' | 'CERT_COPY' | 'EIN_LETTER';
}) {
  const t = useTranslations('admin');
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [filename, setFilename] = useState<string | null>(null);

  const onChange = async (file: File | null) => {
    if (!file) {
      setFilename(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('uploadFailedTooLarge', { mb: MAX_BYTES / 1024 / 1024 }));
      return;
    }
    setFilename(file.name);

    // Read as base64 — small documents only, keeps the demo storage in DB.
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    start(async () => {
      try {
        await uploadIssuedDocument({
          filingId,
          documentType,
          fileBase64: base64,
          mimeType: file.type || 'application/pdf',
          title: file.name,
        });
        toast.success(t('uploaded'));
        if (ref.current) ref.current.value = '';
        setFilename(null);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => ref.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {pending ? t('uploading') : t('uploadPdf')}
      </Button>
      {filename && <span className="text-xs text-ink-muted truncate">{filename}</span>}
    </div>
  );
}
