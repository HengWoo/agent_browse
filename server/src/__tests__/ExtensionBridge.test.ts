import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { ExtensionBridge } from '../ExtensionBridge.js';

const TEST_PORT = 18899;

describe('ExtensionBridge', () => {
  let bridge: ExtensionBridge;
  let server: http.Server;
  let clientWs: WebSocket | null = null;

  beforeEach(async () => {
    bridge = new ExtensionBridge(TEST_PORT);
    server = http.createServer();
    bridge.start(server);
    await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
      clientWs = null;
    }
    await bridge.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);
      ws.on('open', () => {
        clientWs = ws;
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('reports not connected before extension connects', () => {
    expect(bridge.isConnected).toBe(false);
  });

  it('reports connected after extension connects', async () => {
    await connectClient();
    expect(bridge.isConnected).toBe(true);
  });

  it('sends action and receives response via UUID matching', async () => {
    const ws = await connectClient();

    // Simulate extension: echo back with success
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      ws.send(JSON.stringify({
        id: msg.id,
        success: true,
        data: { tabs: [{ id: 1, url: 'https://example.com', title: 'Example' }] },
      }));
    });

    const result = await bridge.send('listTabs');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      tabs: [{ id: 1, url: 'https://example.com', title: 'Example' }],
    });
  });

  it('throws on send when extension not connected', async () => {
    await expect(bridge.send('listTabs')).rejects.toThrow('Extension not connected');
  });

  it('rejects pending requests on disconnect', async () => {
    const ws = await connectClient();

    // Don't respond — just disconnect
    const sendPromise = bridge.send('listTabs', {}, 5000);
    // Give it a moment to register the pending request
    await new Promise((r) => setTimeout(r, 50));
    ws.close();

    await expect(sendPromise).rejects.toThrow('Extension disconnected');
  });

  it('times out pending requests', async () => {
    await connectClient();
    // Extension connected but never responds
    await expect(bridge.send('listTabs', {}, 200)).rejects.toThrow('timed out');
  });

  it('rejects promise and cleans up when ws.send() throws', async () => {
    const ws = await connectClient();

    // Simulate extension responding normally first to prove connectivity
    ws.on('message', () => {
      // Close connection immediately after receiving the message
      // so the next send in the bridge will fail
      ws.close();
    });

    // First send triggers the close. After close, the pending request
    // should be rejected (either by the send try-catch or by the disconnect handler).
    await expect(bridge.send('listTabs', {}, 2000)).rejects.toThrow();

    // Bridge should be usable after the failure — no stuck state
    expect(bridge.isConnected).toBe(false);
  });

  it('isolates CDP event handler errors — one bad handler does not break others', async () => {
    const ws = await connectClient();
    const events: string[] = [];

    // Register a handler that throws
    bridge.onCdpEvent(() => {
      throw new Error('handler 1 exploded');
    });

    // Register a handler that should still execute
    bridge.onCdpEvent((method) => {
      events.push(method);
    });

    ws.send(JSON.stringify({
      type: 'cdpEvent',
      method: 'Network.responseReceived',
      params: { requestId: '456' },
    }));

    await new Promise((r) => setTimeout(r, 50));

    // Second handler should have received the event despite the first throwing
    expect(events).toEqual(['Network.responseReceived']);
  });

  it('handles CDP event forwarding', async () => {
    const ws = await connectClient();
    const events: Array<{ method: string; params: unknown }> = [];

    bridge.onCdpEvent((method, params) => {
      events.push({ method, params });
    });

    ws.send(JSON.stringify({
      type: 'cdpEvent',
      method: 'Network.responseReceived',
      params: { requestId: '123' },
    }));

    // Give event time to propagate
    await new Promise((r) => setTimeout(r, 50));

    expect(events).toHaveLength(1);
    expect(events[0].method).toBe('Network.responseReceived');
  });
});

describe('ExtensionBridge version handshake', () => {
  let server: http.Server;
  let clientWs: WebSocket | null = null;

  afterEach(async () => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
      clientWs = null;
    }
  });

  async function setup(serverVersion: string) {
    const bridge = new ExtensionBridge(TEST_PORT + 1, 30000, serverVersion);
    server = http.createServer();
    bridge.start(server);
    await new Promise<void>((resolve) => server.listen(TEST_PORT + 1, '127.0.0.1', resolve));
    return bridge;
  }

  async function teardown(bridge: ExtensionBridge) {
    await bridge.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}/ws`);
      ws.on('open', () => {
        clientWs = ws;
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  it('returns no warning when versions match', async () => {
    const bridge = await setup('0.2.0');
    const ws = await connectClient();

    ws.send(JSON.stringify({ type: 'hello', version: '0.2.0' }));
    await new Promise((r) => setTimeout(r, 50));

    expect(bridge.versionWarning).toBeNull();
    await teardown(bridge);
  });

  it('returns warning when versions mismatch', async () => {
    const bridge = await setup('0.2.0');
    const ws = await connectClient();

    ws.send(JSON.stringify({ type: 'hello', version: '0.1.0' }));
    await new Promise((r) => setTimeout(r, 50));

    expect(bridge.versionWarning).toContain('0.1.0');
    expect(bridge.versionWarning).toContain('0.2.0');
    expect(bridge.versionWarning).toContain('chrome://extensions');
    await teardown(bridge);
  });

  it('warns when connected but no hello received', async () => {
    const bridge = await setup('0.2.0');
    await connectClient();
    await new Promise((r) => setTimeout(r, 50));

    expect(bridge.versionWarning).toContain('did not report its version');
    await teardown(bridge);
  });

  it('returns no warning when not connected', async () => {
    const bridge = await setup('0.2.0');
    expect(bridge.versionWarning).toBeNull();
    await teardown(bridge);
  });

  it('resets version on reconnect', async () => {
    const bridge = await setup('0.2.0');

    // First connection sends matching hello
    const ws1 = await connectClient();
    ws1.send(JSON.stringify({ type: 'hello', version: '0.2.0' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.versionWarning).toBeNull();

    // Disconnect
    ws1.close();
    await new Promise((r) => setTimeout(r, 50));

    // Reconnect without sending hello — should warn, not carry stale version
    clientWs = null;
    const ws2 = await connectClient();
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.versionWarning).toContain('did not report its version');

    ws2.close();
    clientWs = null;
    await new Promise((r) => setTimeout(r, 50));
    await teardown(bridge);
  });

  it('treats non-string version in hello as missing', async () => {
    const bridge = await setup('0.2.0');
    const ws = await connectClient();

    ws.send(JSON.stringify({ type: 'hello', version: 123 }));
    await new Promise((r) => setTimeout(r, 50));

    expect(bridge.versionWarning).toContain('did not report its version');
    await teardown(bridge);
  });
});
