import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpResponse } from '../McpResponse.js';
import type { ToolContext } from '../ToolDefinition.js';
import type { ExtensionBridge } from '../ExtensionBridge.js';

import { jinaRead, jinaSearch } from '../tools/reader.js';

// Stub context — reader tools don't use the bridge
const stubContext: ToolContext = {
  bridge: {} as ExtensionBridge,
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

describe('jina_read', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('returns title and content from Jina response', async () => {
    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: {
        url: 'https://example.com/article',
        title: 'Test Article',
        content: 'Hello world in **markdown**.',
        description: 'A test article.',
      },
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaRead.handler(
      { params: { url: 'https://example.com/article' } },
      response,
      stubContext,
    );

    const content = response.build('jina_read');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('**Test Article**');
    expect(text).toContain('Hello world in **markdown**.');
    expect(text).toContain('https://example.com/article');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/article',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('throws on HTTP error with status code', async () => {
    globalThis.fetch = mockFetch('Rate limit exceeded', 429) as unknown as typeof fetch;

    const response = new McpResponse();
    await expect(
      jinaRead.handler(
        { params: { url: 'https://example.com/fail' } },
        response,
        stubContext,
      ),
    ).rejects.toThrow('HTTP 429');
  });

  it('truncates content over 200KB', async () => {
    const largeContent = 'x'.repeat(300 * 1024);
    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: {
        url: 'https://example.com/big',
        title: 'Big Page',
        content: largeContent,
      },
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaRead.handler(
      { params: { url: 'https://example.com/big' } },
      response,
      stubContext,
    );

    const content = response.build('jina_read');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('[Content truncated at 200KB]');
    expect(text.length).toBeLessThan(largeContent.length);
  });

  it('sends Authorization header when JINA_API_KEY is set', async () => {
    vi.stubEnv('JINA_API_KEY', 'test-key-123');

    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: { url: 'https://example.com', title: 'Test', content: 'OK' },
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaRead.handler(
      { params: { url: 'https://example.com' } },
      response,
      stubContext,
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-123',
        }),
      }),
    );
  });

  it('sends X-No-Cache header when noCache is true', async () => {
    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: { url: 'https://example.com', title: 'Test', content: 'OK' },
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaRead.handler(
      { params: { url: 'https://example.com', noCache: true } },
      response,
      stubContext,
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-No-Cache': 'true' }),
      }),
    );
  });
});

describe('jina_search', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('formats search results as numbered list', async () => {
    vi.stubEnv('JINA_API_KEY', 'test-key');

    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: [
        { title: 'Result One', url: 'https://one.com', content: 'First result content', description: 'First desc' },
        { title: 'Result Two', url: 'https://two.com', content: 'Second result content', description: 'Second desc' },
      ],
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaSearch.handler(
      { params: { query: 'test query' } },
      response,
      stubContext,
    );

    const content = response.build('jina_search');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('1. **Result One**');
    expect(text).toContain('2. **Result Two**');
    expect(text).toContain('https://one.com');
    expect(text).toContain('https://two.com');
    expect(text).toContain('First desc');
  });

  it('throws when no API key configured', async () => {
    vi.stubEnv('JINA_API_KEY', '');

    const response = new McpResponse();
    await expect(
      jinaSearch.handler(
        { params: { query: 'test' } },
        response,
        stubContext,
      ),
    ).rejects.toThrow('JINA_API_KEY');
  });

  it('handles empty results', async () => {
    vi.stubEnv('JINA_API_KEY', 'test-key');

    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: [],
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaSearch.handler(
      { params: { query: 'obscure query' } },
      response,
      stubContext,
    );

    const content = response.build('jina_search');
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('No search results found');
  });

  it('encodes query in URL', async () => {
    vi.stubEnv('JINA_API_KEY', 'test-key');

    globalThis.fetch = mockFetch({
      code: 200,
      status: 200,
      data: [],
    }) as unknown as typeof fetch;

    const response = new McpResponse();
    await jinaSearch.handler(
      { params: { query: 'hello world & more' } },
      response,
      stubContext,
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://s.jina.ai/hello%20world%20%26%20more',
      expect.any(Object),
    );
  });
});
