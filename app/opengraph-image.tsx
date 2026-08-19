import { ImageResponse } from 'next/og';

// Default social card for every route that doesn't define its own. Next.js
// auto-wires this as og:image + twitter:image, fixing the "no preview" gap on
// shares across Slack/iMessage/LinkedIn/X.
export const runtime = 'edge';
export const alt = 'LaunchForma - Form your LLC or Corporation online';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0F1F1C',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: '#0B7A6B',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            LF
          </div>
          <div style={{ color: '#ffffff', fontSize: 34, fontWeight: 700 }}>LaunchForma</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ color: '#ffffff', fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
            Form your LLC or Corporation
          </div>
          <div style={{ color: '#9FD9CF', fontSize: 34, fontWeight: 500 }}>
            All-in pricing · Free Year-1 Registered Agent · Same-day filing
          </div>
        </div>

        <div style={{ color: '#6E8B85', fontSize: 26 }}>
          Florida · Wyoming · Delaware · launchforma.com
        </div>
      </div>
    ),
    { ...size },
  );
}
