import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

const MAX_CONTENT_BYTES = 200 * 1024; // 200KB

interface JinaReadResponse {
  code: number;
  status: number;
  data: {
    url: string;
    title: string;
    content: string;
    description?: string;
  };
}

interface JinaSearchResult {
  title: string;
  url: string;
  content: string;
  description?: string;
}

interface JinaSearchResponse {
  code: number;
  status: number;
  data: JinaSearchResult[];
}

function getJinaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  const key = process.env.JINA_API_KEY;
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

export const jinaRead = defineTool({
  name: 'jina_read',
  description:
    'Convert a URL to clean markdown using Jina Reader. Best for articles, docs, and public pages that don\'t need interactive browsing. Returns title and content as markdown.',
  schema: {
    url: z.string().url().describe('The URL to read and convert to markdown.'),
    noCache: z.boolean().optional().describe('Bypass Jina cache for fresh content. Default false.'),
  },
  handler: async (request, response, _context) => {
    const { url, noCache } = request.params;

    const headers = getJinaHeaders();
    if (noCache) {
      headers['X-No-Cache'] = 'true';
    }

    const res = await fetch(`https://r.jina.ai/${url}`, { headers });

    if (!res.ok) {
      throw new Error(`Jina Reader returned HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as JinaReadResponse;
    let content = json.data.content;

    if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
      const truncated = Buffer.from(content, 'utf-8').subarray(0, MAX_CONTENT_BYTES).toString('utf-8');
      content = truncated + '\n\n[Content truncated at 200KB]';
    }

    const title = json.data.title || '(no title)';
    response.appendText(`**${title}**\n\nSource: ${json.data.url}\n\n${content}`);
  },
});

export const jinaSearch = defineTool({
  name: 'jina_search',
  description:
    'Web search via Jina. Returns top results with title, URL, and content snippet. Requires JINA_API_KEY env var.',
  schema: {
    query: z.string().describe('The search query.'),
  },
  handler: async (request, response, _context) => {
    const { query } = request.params;

    if (!process.env.JINA_API_KEY) {
      throw new Error('JINA_API_KEY environment variable is required for jina_search.');
    }

    const headers = getJinaHeaders();
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });

    if (!res.ok) {
      throw new Error(`Jina Search returned HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as JinaSearchResponse;
    const results = json.data;

    if (!results || results.length === 0) {
      response.appendText('No search results found.');
      return;
    }

    const lines = results.map((r, i) => {
      const snippet = r.description || r.content.slice(0, 200);
      return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`;
    });

    response.appendText(`Search results for "${query}":\n\n${lines.join('\n\n')}`);
  },
});
