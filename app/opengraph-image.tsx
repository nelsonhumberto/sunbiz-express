import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// Default share card. Child pages that set openGraph replace this file's
// automatic tag, so layout metadata also points at this route.
export const alt = 'LaunchForma';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/images/logo-full.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
        }}
      >
        <img src={src} height={220} />
      </div>
    ),
    { ...size },
  );
}
