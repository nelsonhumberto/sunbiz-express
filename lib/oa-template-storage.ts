import 'server-only';

import { logger } from '@/lib/logger';
import {
  OA_BUCKET,
  OA_SIGNED_URL_TTL_SECONDS,
  absoluteStorageSignedUrl,
  oaTemplateAssets,
  type OaTemplateAsset,
  type OaTemplateLocale,
} from '@/lib/oa-template';

export interface OaSignedLink {
  filename: string;
  label: string;
  url: string;
  format: OaTemplateAsset['format'];
  variant: OaTemplateAsset['variant'];
}

function storageConfig(): { base: string; key: string } {
  const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(
    /\/$/,
    '',
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!base || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to sign template URLs');
  }
  return { base, key };
}

/**
 * Short-lived signed URLs for the four samples in the visitor's locale.
 * The bucket stays private. Callers must already have confirmed the lead.
 */
export async function signOaTemplateLinks(
  locale: OaTemplateLocale,
  expiresIn = OA_SIGNED_URL_TTL_SECONDS,
): Promise<OaSignedLink[]> {
  const assets = oaTemplateAssets(locale);
  const { base, key } = storageConfig();
  const response = await fetch(`${base}/storage/v1/object/sign/${OA_BUCKET}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expiresIn,
      paths: assets.map((asset) => asset.filename),
    }),
  });
  if (!response.ok) {
    logger.error('oa template sign failed', {
      area: 'marketing',
      tag: 'oa-template-sign',
      status: response.status,
    });
    throw new Error(`Storage sign failed (${response.status})`);
  }
  const rows = (await response.json()) as Array<{
    path?: string;
    signedURL?: string;
    signedUrl?: string;
    error?: string | null;
  }>;
  if (!Array.isArray(rows)) throw new Error('Storage sign returned an unexpected body');

  return assets.map((asset) => {
    const row = rows.find((item) => item.path === asset.filename);
    const signed = row?.signedURL || row?.signedUrl;
    if (!row || row.error || !signed) {
      throw new Error(`Storage sign missing ${asset.filename}`);
    }
    return {
      filename: asset.filename,
      label: asset.label,
      format: asset.format,
      variant: asset.variant,
      url: absoluteStorageSignedUrl(base, signed),
    };
  });
}
