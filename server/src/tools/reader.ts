import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

const MAX_CONTENT_BYTES = 200 * 1024; // 200KB
const FETCH_TIMEOUT_MS = 30_000;

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
  const key = process.env.JINA_API_KEY?.trim();
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

/**
 * Fetch with timeout and contextual error messages.
 * Wraps network errors so callers get actionable messages instead of "fetch failed".
 */
async function jinaFetch(url: string, headers: Record<string, string>, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    const cause = (err as Error).cause ?? err;
    throw new Error(`Failed to reach ${label}: ${(cause as Error).message ?? String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(response body unreadable)');
    throw new Error(`${label} returned HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  return res;
}

/**
 * Parse JSON response with contextual error on malformed bodies.
 */
async function parseJsonResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON. Body preview: ${text.slice(0, 200)}`);
  }
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

    const res = await jinaFetch(`https://r.jina.ai/${url}`, headers, 'Jina Reader');
    const json = await parseJsonResponse<JinaReadResponse>(res, 'Jina Reader');

    if (!json.data || typeof json.data.content !== 'string') {
      throw new Error('Jina Reader returned an unexpected response (missing data.content).');
    }

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

    if (!process.env.JINA_API_KEY?.trim()) {
      throw new Error('JINA_API_KEY environment variable is required for jina_search.');
    }

    const headers = getJinaHeaders();
    const res = await jinaFetch(
      `https://s.jina.ai/${encodeURIComponent(query)}`,
      headers,
      'Jina Search',
    );
    const json = await parseJsonResponse<JinaSearchResponse>(res, 'Jina Search');
    const results = json.data;

    if (!Array.isArray(results) || results.length === 0) {
      response.appendText('No search results found.');
      return;
    }

    const lines = results.map((r, i) => {
      const snippet = r.description || (r.content?.slice(0, 200) ?? '');
      return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`;
    });

    response.appendText(`Search results for "${query}":\n\n${lines.join('\n\n')}`);
  },
});
