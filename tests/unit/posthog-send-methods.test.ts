import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(path.join(process.cwd(), 'package.json'));

type SendPrototype = {
  _send_request?: unknown;
  _send_retriable_request?: unknown;
};

/**
 * listenForCaptureSend wraps these private methods. posthog-js is pinned
 * because a rename would make that wait a no-op. This fails if either
 * method is gone from the pinned package.
 */
describe('pinned posthog-js send methods', () => {
  it('keeps _send_request and _send_retriable_request on 1.373.2', () => {
    const app = require(path.join(process.cwd(), 'package.json')) as {
      dependencies: { 'posthog-js': string };
    };
    expect(app.dependencies['posthog-js']).toBe('1.373.2');

    const installed = require('posthog-js/package.json') as { version: string };
    expect(installed.version).toBe('1.373.2');

    const { PostHog } = require('posthog-js/lib/src/posthog-core.js') as {
      PostHog: { prototype: SendPrototype };
    };
    expect(typeof PostHog.prototype._send_request).toBe('function');
    expect(typeof PostHog.prototype._send_retriable_request).toBe('function');

    const bundled = require('posthog-js') as { posthog: SendPrototype };
    const browser = bundled.posthog;
    expect(typeof browser._send_request).toBe('function');
    const retriable = browser._send_retriable_request;
    if (retriable !== undefined) expect(typeof retriable).toBe('function');
  });
});
