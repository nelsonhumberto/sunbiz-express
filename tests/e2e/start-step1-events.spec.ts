import { createServer, type Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

const FORBIDDEN = ['email', 'name', 'businessName', 'business_name', 'firstName', 'lastName', 'companyName'];
const EVENTS = ['wizard_entity_selected', 'start_name_submitted', 'wizard_step1_continue_clicked'] as const;

type TraceItem = { event: string; properties?: Record<string, unknown> };
type CapturedEvent = { event?: string; properties?: Record<string, unknown> };

function decodeBody(body: Buffer): unknown {
  const bytes = body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  let text = bytes.toString('utf8');
  if (text.startsWith('data=')) {
    const raw = decodeURIComponent(text.slice('data='.length));
    try {
      text = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      text = raw;
    }
  }
  return JSON.parse(text);
}

function eventsFrom(payload: unknown): CapturedEvent[] {
  if (Array.isArray(payload)) return payload as CapturedEvent[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as { event?: string; batch?: unknown; data?: unknown };
  if (typeof record.event === 'string') return [record as CapturedEvent];
  if (Array.isArray(record.batch)) return record.batch as CapturedEvent[];
  if (Array.isArray(record.data)) return record.data as CapturedEvent[];
  return [];
}

async function serveBundle(): Promise<{ server: Server; origin: string }> {
  const bundled = await build({
    entryPoints: ['tests/e2e/start-events-entry.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
  const js = bundled.outputFiles[0]?.text ?? '';
  // sendBeacon is removed so the SDK uses fetch, which this test can read.
  // A real browser still beacons. The page bundle calls the same captureThenNavigate
  // path GuestStartLaunch uses after openGuestDraft returns redirectTo.
  const html = `<!doctype html><html><body>
    <form id="start">
      <label for="businessName">Name your LLC</label>
      <input id="businessName" name="businessName" value="Sol Norte LLC" />
      <button type="submit">Continue</button>
    </form>
    <script>try { Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined }); } catch (e) {}</script>
    <script src="/app.js"></script>
  </body></html>`;
  const server = createServer((req, res) => {
    res.statusCode = 200;
    if (req.url?.startsWith('/app.js')) {
      res.setHeader('content-type', 'text/javascript');
      res.end(js);
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test('sends the three step 1 events before navigation, in English and Spanish', async ({ page }) => {
  const { server, origin } = await serveBundle();
  const traces: TraceItem[][] = [];
  const bodies: Buffer[] = [];
  try {
    await page.exposeFunction('__report', (trace: TraceItem[]) => {
      traces.push(trace);
    });
    await page.route('**://us.i.posthog.com/**', async (route) => {
      const raw = route.request().postDataBuffer();
      if (raw) bodies.push(Buffer.from(raw));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto(origin);

    const cases = [
      { redirectTo: '/wizard/filing_en/2', locale: 'en' as const, entity: 'LLC' as const },
      { redirectTo: '/es/wizard/filing_es/2', locale: 'es' as const, entity: 'CORP' as const },
    ];
    for (const item of cases) {
      const navigated = page.waitForURL((url) => url.pathname === item.redirectTo);
      await Promise.all([
        navigated,
        page
          .evaluate((input) => {
            const run = (
              window as unknown as {
                __runStart?: (
                  redirectTo: string,
                  locale: 'en' | 'es',
                  entity: 'LLC' | 'CORP',
                ) => Promise<void>;
              }
            ).__runStart;
            return run?.(input.redirectTo, input.locale, input.entity);
          }, item)
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            if (!/context was destroyed|navigation/i.test(message)) throw err;
          }),
      ]);
      await page.goto(origin);
    }

    expect(traces).toHaveLength(2);
    for (const [index, trace] of traces.entries()) {
      const names = trace.map((item) => item.event);
      const assignAt = names.indexOf('__assign');
      expect(assignAt).toBeGreaterThan(2);
      for (const eventName of EVENTS) {
        expect(names.indexOf(eventName)).toBeGreaterThan(-1);
        expect(names.indexOf(eventName)).toBeLessThan(assignAt);
      }
      const entityEvent = trace.find((item) => item.event === 'wizard_entity_selected');
      expect(entityEvent?.properties?.entity).toBe(cases[index]?.entity);
      expect(entityEvent?.properties?.locale).toBe(cases[index]?.locale);
      for (const item of trace) {
        if (item.event === '__assign') {
          expect(item.properties?.href).toBe(cases[index]?.redirectTo);
          continue;
        }
        const props = item.properties ?? {};
        for (const key of FORBIDDEN) expect(props).not.toHaveProperty(key);
        const blob = JSON.stringify(props).toLowerCase();
        expect(blob).not.toContain('sol norte');
        expect(blob).not.toContain('@');
      }
    }

    const networkEvents = bodies.flatMap((body) => eventsFrom(decodeBody(body)));
    for (const eventName of EVENTS) {
      expect(networkEvents.some((item) => item.event === eventName)).toBe(true);
    }
    const entityEvents = networkEvents.filter((item) => item.event === 'wizard_entity_selected');
    expect(entityEvents.map((item) => item.properties?.entity).sort()).toEqual(['CORP', 'LLC']);
    for (const item of networkEvents) {
      if (!item.event || !EVENTS.includes(item.event as (typeof EVENTS)[number])) continue;
      const props = item.properties ?? {};
      expect(props.entity === undefined || props.entity === 'LLC' || props.entity === 'CORP').toBe(true);
      for (const key of FORBIDDEN) expect(props).not.toHaveProperty(key);
      const blob = JSON.stringify(props).toLowerCase();
      expect(blob).not.toContain('sol norte');
      expect(blob).not.toContain('@');
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
