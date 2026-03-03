import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpResponse } from '../McpResponse.js';
import type { ExtensionBridge, BridgeResponse } from '../ExtensionBridge.js';
import type { ToolContext } from '../ToolDefinition.js';

import { tabsList, tabAttach, tabDetach } from '../tools/tabs.js';
import { navigate } from '../tools/navigation.js';
import { click, clickSelector, clickText, type as typeText, pressKey } from '../tools/input.js';
import { screenshot } from '../tools/screenshot.js';
import { evaluate, cdpRaw } from '../tools/script.js';
import { snapshot } from '../tools/snapshot.js';

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

describe('tabs tools', () => {
  it('tabs_list formats tab list', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: [
        { id: 1, url: 'https://example.com', title: 'Example' },
        { id: 2, url: 'https://test.com', title: 'Test' },
      ],
    }));

    const response = new McpResponse();
    await tabsList.handler({ params: {} }, response, ctx);
    const content = response.build('tabs_list');
    expect(content[0].type).toBe('text');
    expect((content[0] as { text: string }).text).toContain('Example');
    expect((content[0] as { text: string }).text).toContain('test.com');
  });

  it('tab_attach calls extension and reports success', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await tabAttach.handler({ params: { tabId: 42 } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('attach', { tabId: 42 });
  });

  it('tab_detach calls extension', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await tabDetach.handler({ params: { tabId: 42 } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('detach', { tabId: 42 });
  });
});

describe('navigation tools', () => {
  it('navigate sends URL to extension', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await navigate.handler(
      { params: { tabId: 1, url: 'https://example.com' } },
      response,
      ctx,
    );
    expect(ctx.bridge.send).toHaveBeenCalledWith('navigate', {
      tabId: 1,
      url: 'https://example.com',
    });
  });
});

describe('input tools', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = mockBridge(() => ({ id: '1', success: true }));
  });

  it('click sends coordinates', async () => {
    const response = new McpResponse();
    await click.handler({ params: { tabId: 1, x: 100, y: 200 } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('click', { tabId: 1, x: 100, y: 200 });
  });

  it('click_selector sends selector', async () => {
    const response = new McpResponse();
    await clickSelector.handler({ params: { tabId: 1, selector: '#btn' } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('clickSelector', { tabId: 1, selector: '#btn' });
  });

  it('click_text sends text with exact flag', async () => {
    const response = new McpResponse();
    await clickText.handler({ params: { tabId: 1, text: 'Submit', exact: true } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('clickText', { tabId: 1, text: 'Submit', exact: true });
  });

  it('type sends text', async () => {
    const response = new McpResponse();
    await typeText.handler({ params: { tabId: 1, text: 'hello' } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('type', { tabId: 1, text: 'hello' });
  });

  it('press_key sends key combo', async () => {
    const response = new McpResponse();
    await pressKey.handler({ params: { tabId: 1, key: 'Control+A' } }, response, ctx);
    expect(ctx.bridge.send).toHaveBeenCalledWith('pressKey', { tabId: 1, key: 'Control+A' });
  });
});

describe('script tools', () => {
  it('evaluate returns expression result', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: { result: 42 },
    }));
    const response = new McpResponse();
    await evaluate.handler(
      { params: { tabId: 1, expression: '1 + 1' } },
      response,
      ctx,
    );
    const content = response.build('evaluate');
    expect((content[0] as { text: string }).text).toContain('42');
  });

  it('cdp_raw forwards method and params', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: { nodeId: 1 },
    }));
    const response = new McpResponse();
    await cdpRaw.handler(
      { params: { tabId: 1, method: 'DOM.getDocument', params: {} } },
      response,
      ctx,
    );
    expect(ctx.bridge.send).toHaveBeenCalledWith('cdp', {
      tabId: 1,
      method: 'DOM.getDocument',
      params: {},
    });
  });
});

describe('screenshot tool', () => {
  it('attaches image for small screenshots', async () => {
    const smallBase64 = 'iVBOR'; // tiny placeholder
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: { data: smallBase64 },
    }));
    const response = new McpResponse();
    await screenshot.handler({ params: { tabId: 1 } }, response, ctx);
    const content = response.build('screenshot');
    // Should have text + image
    expect(content.some((c) => c.type === 'image')).toBe(true);
  });

  it('throws on failure', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: false,
      error: 'Tab not attached',
    }));
    const response = new McpResponse();
    await expect(
      screenshot.handler({ params: { tabId: 1 } }, response, ctx),
    ).rejects.toThrow('Tab not attached');
  });
});

describe('snapshot tool', () => {
  it('formats a11y tree with UIDs', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        nodes: [
          { nodeId: '1', role: { value: 'WebArea' }, name: { value: 'Page' }, childIds: ['2', '3'] },
          { nodeId: '2', role: { value: 'button' }, name: { value: 'Submit' } },
          { nodeId: '3', role: { value: 'textbox' }, name: { value: 'Email' }, value: { value: 'test@test.com' } },
        ],
      },
    }));
    const response = new McpResponse();
    await snapshot.handler({ params: { tabId: 1 } }, response, ctx);
    const content = response.build('snapshot');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('WebArea');
    expect(text).toContain('button');
    expect(text).toContain('Submit');
    expect(text).toContain('textbox');
    expect(text).toContain('Email');
    expect(text).toContain('test@test.com');
  });
});
