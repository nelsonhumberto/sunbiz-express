'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, FileStack, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { uploadSunbizCoverPage } from '@/actions/admin-file-company';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT =
  '.html,.htm,.mhtml,.mht,application/pdf,text/html,multipart/related,message/rfc822';

export function FileCompanyPanel({
  filingId,
  hasCoverPage,
  coverTitle,
  previewEmail,
  useOurRa,
}: {
  filingId: string;
  hasCoverPage: boolean;
  coverTitle?: string | null;
  /** Email that will be written into HTML/MHTML covers. */
  previewEmail: string;
  useOurRa: boolean;
}) {
  const t = useTranslations('admin');
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [filename, setFilename] = useState<string | null>(null);
  const [coverReady, setCoverReady] = useState(hasCoverPage);

  const onUpload = async (file: File | null) => {
    if (!file) {
      setFilename(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('uploadFailedTooLarge', { mb: MAX_BYTES / 1024 / 1024 }));
      return;
    }
    const lower = file.name.toLowerCase();
    const ok =
      lower.endsWith('.pdf') ||
      lower.endsWith('.html') ||
      lower.endsWith('.htm') ||
      lower.endsWith('.mhtml') ||
      lower.endsWith('.mht') ||
      file.type.includes('pdf') ||
      file.type.includes('html');
    if (!ok) {
      toast.error(t('fileCompanyCoverMustBeFile'));
      return;
    }
    setFilename(file.name);

    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    start(async () => {
      try {
        const result = await uploadSunbizCoverPage({
          filingId,
          fileBase64: base64,
          mimeType: file.type || undefined,
          title: file.name,
          filename: file.name,
        });
        setCoverReady(true);
        toast.success(
          t('fileCompanyCoverUploadedWithEmail', { email: result.emailUsed }),
        );
        if (ref.current) ref.current.value = '';
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">{t('fileCompanyDesc')}</p>
          <p className="text-xs text-ink-subtle mt-2">
            {t('fileCompanyEmailHint', {
              email: previewEmail,
              source: useOurRa
                ? t('fileCompanyEmailSourceCustomer')
                : t('fileCompanyEmailSourceNotice'),
            })}
          </p>
        </div>
        {coverReady ? (
          <Badge variant="success" size="sm">
            {t('fileCompanyCoverReady')}
          </Badge>
        ) : (
          <Badge variant="outline" size="sm" className="border-amber-300 text-amber-700">
            {t('fileCompanyCoverNeeded')}
          </Badge>
        )}
      </div>

      <ol className="text-sm space-y-3 list-decimal list-inside text-ink-muted">
        <li>
          <span className="text-ink">{t('fileCompanyStep1')}</span>
          <div className="mt-2 ml-5 flex items-center gap-3 flex-wrap">
            <input
              ref={ref}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => ref.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {pending ? t('uploading') : t('fileCompanyUploadCover')}
            </Button>
            {(filename || coverTitle) && (
              <span className="text-xs text-ink-muted truncate max-w-[240px]">
                {filename || coverTitle}
              </span>
            )}
          </div>
        </li>
        <li>
          <span className="text-ink">{t('fileCompanyStep2')}</span>
          <div className="mt-2 ml-5">
            <Button
              type="button"
              size="sm"
              disabled={!coverReady || pending}
              onClick={() => {
                window.location.href = `/api/admin/filings/${filingId}/file-package`;
              }}
            >
              <FileStack className="h-4 w-4" />
              {t('fileCompanyButton')}
            </Button>
            <p className="text-xs text-ink-subtle mt-2 flex items-center gap-1">
              <Download className="h-3 w-3" />
              {t('fileCompanyDownloadHint')}
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
