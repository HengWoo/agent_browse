import { describe, it, expect, vi } from 'vitest';
import { McpResponse } from '../McpResponse.js';
import type { ExtensionBridge, BridgeResponse } from '../ExtensionBridge.js';
import type { ToolContext } from '../ToolDefinition.js';

import { networkEnable, networkRequests, networkRequestDetail } from '../tools/network.js';
import { cookiesGet, cookiesSet, storageGet, storageSet } from '../tools/cookies.js';

function mockBridge(sendFn: (action: string, params: Record<string, unknown>) => BridgeResponse): ToolContext {
  return {
    bridge: {
      send: vi.fn(async (action: string, params?: Record<string, unknown>) => {
        return sendFn(action, params ?? {});
      }),
      isConnected: true,
    } as unknown as ExtensionBridge,
  };
}

describe('network tools', () => {
  it('network_enable sends CDP Network.enable', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await networkEnable.handler({ params: { tabId: 1 } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('cdp', {
      tabId: 1,
      method: 'Network.enable',
      params: {},
    });
  });

  it('network_requests formats request list', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: [
        { id: 'req1', url: 'https://api.example.com/data', method: 'GET', status: 200, type: 'XHR', size: 1024 },
        { id: 'req2', url: 'https://api.example.com/auth', method: 'POST', status: 401, type: 'Fetch', size: 256 },
      ],
    }));
    const response = new McpResponse();
    await networkRequests.handler({ params: { tabId: 1 } }, response, ctx);
    const content = response.build('network_requests');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('2 requests');
    expect(text).toContain('api.example.com/data');
    expect(text).toContain('401');
  });

  it('network_request_detail formats full request/response', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        url: 'https://api.example.com/data',
        method: 'GET',
        requestHeaders: { 'Accept': 'application/json' },
        status: 200,
        responseHeaders: { 'Content-Type': 'application/json' },
        responseBody: '{"key": "value"}',
      },
    }));
    const response = new McpResponse();
    await networkRequestDetail.handler({ params: { tabId: 1, requestId: 'req1' } }, response, ctx);
    const content = response.build('network_request_detail');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('GET');
    expect(text).toContain('application/json');
    expect(text).toContain('"key": "value"');
  });
});

describe('cookie tools', () => {
  it('cookies_get formats cookie list', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        result: {
          cookies: [
            { name: 'session', value: 'abc123', domain: '.example.com', path: '/', httpOnly: true, secure: true },
          ],
        },
      },
    }));
    const response = new McpResponse();
    await cookiesGet.handler({ params: { tabId: 1 } }, response, ctx);
    const content = response.build('cookies_get');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('session=abc123');
    expect(text).toContain('.example.com');
    expect(text).toContain('httpOnly');
  });

  it('cookies_set sends CDP Network.setCookie', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await cookiesSet.handler({
      params: { tabId: 1, name: 'auth', value: 'token123', domain: '.example.com' },
    }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('cdp', {
      tabId: 1,
      method: 'Network.setCookie',
      params: {
        name: 'auth',
        value: 'token123',
        domain: '.example.com',
        path: '/',
        httpOnly: false,
        secure: false,
      },
    });
  });

  it('storage_get reads localStorage', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: '{"theme":"dark"}',
    }));
    const response = new McpResponse();
    await storageGet.handler({ params: { tabId: 1 } }, response, ctx);
    const content = response.build('storage_get');
    expect((content[0] as { text: string }).text).toContain('theme');
  });

  it('storage_set writes to localStorage', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await storageSet.handler(
      { params: { tabId: 1, key: 'theme', value: 'dark' } },
      response,
      ctx,
    );
    expect(ctx.bridge.send).toHaveBeenCalledWith('evaluate', expect.objectContaining({
      tabId: 1,
    }));
  });
});
