import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';

/**
 * Test the listen-then-catch pattern used in main.ts
 * without involving ExtensionBridge/WSS (which complicates error routing).
 */
describe('HTTP server port conflict', () => {
  let blocker: http.Server | null = null;
  let testServer: http.Server | null = null;

  afterEach(async () => {
    for (const s of [blocker, testServer]) {
      if (s?.listening) {
        await new Promise<void>((resolve) => s.close(() => resolve()));
      }
    }
    blocker = null;
    testServer = null;
  });

  it('should recover gracefully when port is occupied', async () => {
    const PORT = 18899;

    // Occupy the port
    blocker = http.createServer();
    await new Promise<void>((resolve) => {
      blocker!.listen(PORT, '127.0.0.1', resolve);
    });

    // Replicate the exact pattern from main.ts
    testServer = http.createServer();
    let httpListening = false;
    let caughtCode: string | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        testServer!.once('error', reject);
        testServer!.listen(PORT, '127.0.0.1', () => {
          testServer!.removeListener('error', reject);
          httpListening = true;
          resolve();
        });
      });
    } catch (err: unknown) {
      caughtCode = (err as NodeJS.ErrnoException).code;
      if (caughtCode !== 'EADDRINUSE') throw err;
    }

    expect(httpListening).toBe(false);
    expect(caughtCode).toBe('EADDRINUSE');
  });

  it('should listen successfully when port is free', async () => {
    const PORT = 18898;

    testServer = http.createServer();
    let httpListening = false;

    await new Promise<void>((resolve, reject) => {
      testServer!.once('error', reject);
      testServer!.listen(PORT, '127.0.0.1', () => {
        testServer!.removeListener('error', reject);
        httpListening = true;
        resolve();
      });
    });

    expect(httpListening).toBe(true);
  });
});
