import { describe, it, expect, vi } from 'vitest';
import { McpResponse } from '../McpResponse.js';
import type { ExtensionBridge, BridgeResponse } from '../ExtensionBridge.js';
import type { ToolContext } from '../ToolDefinition.js';

import { waitFor, extractTable, extractLinks } from '../tools/extraction.js';

// downloadMonitor removed — was dead code (waitForDownload never resolved in extension)

function mockBridge(sendFn: (action: string, params: Record<string, unknown>) => BridgeResponse): ToolContext {
  return {
    bridge: {
      send: vi.fn(async (action: string, params?: Record<string, unknown>, _timeout?: number) => {
        return sendFn(action, params ?? {});
      }),
      isConnected: true,
    } as unknown as ExtensionBridge,
  };
}

describe('wait_for tool', () => {
  it('sends wait params to extension', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: { condition: 'selector', elapsed: 500 },
    }));
    const response = new McpResponse();
    await waitFor.handler(
      { params: { tabId: 1, selector: '#content' } },
      response,
      ctx,
    );
    expect(ctx.bridge.send).toHaveBeenCalledWith(
      'waitFor',
      expect.objectContaining({ tabId: 1, selector: '#content' }),
      expect.any(Number),
    );
    const content = response.build('wait_for');
    expect((content[0] as { text: string }).text).toContain('selector');
  });

  it('throws when no condition specified', async () => {
    const ctx = mockBridge(() => ({ id: '1', success: true }));
    const response = new McpResponse();
    await expect(
      waitFor.handler({ params: { tabId: 1 } }, response, ctx),
    ).rejects.toThrow('at least one of');
  });
});

describe('extract_table tool', () => {
  it('extracts table data as JSON', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        result: {
          value: JSON.stringify({
            rows: [['Name', 'Age'], ['Alice', '30'], ['Bob', '25']],
            rowCount: 3,
          }),
        },
      },
    }));
    const response = new McpResponse();
    await extractTable.handler(
      { params: { tabId: 1 } },
      response,
      ctx,
    );
    const content = response.build('extract_table');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('3 rows');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('throws descriptive error on malformed JSON response', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        result: {
          value: 'not valid json {{{',
        },
      },
    }));
    const response = new McpResponse();
    await expect(
      extractTable.handler({ params: { tabId: 1 } }, response, ctx),
    ).rejects.toThrow('Failed to parse table data');
  });
});

describe('extract_links tool', () => {
  it('extracts links as markdown list', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        result: {
          value: JSON.stringify([
            { text: 'Home', href: 'https://example.com/' },
            { text: 'About', href: 'https://example.com/about' },
          ]),
        },
      },
    }));
    const response = new McpResponse();
    await extractLinks.handler(
      { params: { tabId: 1 } },
      response,
      ctx,
    );
    const content = response.build('extract_links');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('2 links');
    expect(text).toContain('[Home]');
    expect(text).toContain('example.com/about');
  });

  it('throws descriptive error on malformed JSON response', async () => {
    const ctx = mockBridge(() => ({
      id: '1',
      success: true,
      data: {
        result: {
          value: '<html>not json</html>',
        },
      },
    }));
    const response = new McpResponse();
    await expect(
      extractLinks.handler({ params: { tabId: 1 } }, response, ctx),
    ).rejects.toThrow('Failed to parse links data');
  });
});
