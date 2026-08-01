'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, FileStack, Send, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { uploadSunbizCoverPage } from '@/actions/admin-file-company';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'application/pdf,.pdf';

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
  previewEmail: string;
  useOurRa: boolean;
}) {
  const t = useTranslations('admin');
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [faxPending, startFax] = useTransition();
  const [filename, setFilename] = useState<string | null>(null);
  const [coverReady, setCoverReady] = useState(hasCoverPage);

  const fileToBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const onUpload = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) {
      setFilename(null);
      return;
    }

    const cover = files[0];
    if (cover.size > MAX_BYTES) {
      toast.error(t('uploadFailedTooLarge', { mb: MAX_BYTES / 1024 / 1024 }));
      return;
    }
    if (!cover.name.toLowerCase().endsWith('.pdf') && !cover.type.includes('pdf')) {
      toast.error('Only PDF files are supported. Print the Sunbiz cover to PDF before uploading.');
      return;
    }
    setFilename(cover.name);

    start(async () => {
      try {
        const result = await uploadSunbizCoverPage({
          filingId,
          fileBase64: await fileToBase64(cover),
          mimeType: cover.type || 'application/pdf',
          title: cover.name,
          filename: cover.name,
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

  const onFax = () => {
    startFax(async () => {
      try {
        const res = await fetch(`/api/admin/filings/${filingId}/file-package`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.message || data.error || 'Fax failed.');
          return;
        }
        toast.success('Fax sent to Sunbiz! Check the fax log for status.');
      } catch (e) {
        toast.error((e as Error).message || 'Fax failed.');
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
          <p className="text-xs text-ink-subtle ml-5 mt-1">
            Print the Sunbiz cover page to PDF before uploading.
          </p>
          <div className="mt-2 ml-5 flex items-center gap-3 flex-wrap">
            <input
              ref={ref}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => onUpload(e.target.files)}
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
          <div className="mt-2 ml-5 flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              size="sm"
              disabled={!coverReady || pending || faxPending}
              onClick={onFax}
            >
              <Send className="h-4 w-4" />
              {faxPending ? 'Sending…' : t('fileCompanyButton')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!coverReady || pending}
              onClick={() => {
                window.location.href = `/api/admin/filings/${filingId}/file-package`;
              }}
            >
              <Download className="h-4 w-4" />
              Download Preview
            </Button>
          </div>
          <p className="text-xs text-ink-subtle mt-2 ml-5 flex items-center gap-1">
            <FileStack className="h-3 w-3" />
            {t('fileCompanyDownloadHint')}
          </p>
        </li>
      </ol>
    </div>
  );
}
