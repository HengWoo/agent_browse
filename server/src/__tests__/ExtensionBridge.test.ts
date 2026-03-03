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
