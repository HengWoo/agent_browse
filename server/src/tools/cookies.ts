import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const cookiesGet = defineTool({
  name: 'cookies_get',
  description: 'Get cookies for the current page or a specific URL. Uses CDP Network.getCookies.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    urls: z.array(z.string()).optional().describe('Optional list of URLs to get cookies for. If omitted, gets cookies for the current page.'),
  },
  handler: async (request, response, context) => {
    const { tabId, urls } = request.params;
    const params: Record<string, unknown> = {};
    if (urls && urls.length > 0) {
      params.urls = urls;
    }
    const result = await context.bridge.send('cdp', {
      tabId,
      method: 'Network.getCookies',
      params,
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get cookies');
    }

    const data = result.data as { result?: { cookies: Array<Record<string, unknown>> } };
    const cookies = data?.result?.cookies ?? [];

    if (cookies.length === 0) {
      response.appendText('No cookies found.');
      return;
    }

    const lines = cookies.map((c) =>
      `${c.name}=${String(c.value).slice(0, 80)}${String(c.value).length > 80 ? '...' : ''} (domain: ${c.domain}, path: ${c.path}${c.httpOnly ? ', httpOnly' : ''}${c.secure ? ', secure' : ''})`
    );
    response.appendText(`${cookies.length} cookies:\n\n${lines.join('\n')}`);
  },
});

export const cookiesSet = defineTool({
  name: 'cookies_set',
  description: 'Set cookies in the browser session. Uses CDP Network.setCookie.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    name: z.string().describe('Cookie name.'),
    value: z.string().describe('Cookie value.'),
    domain: z.string().describe('Cookie domain.'),
    path: z.string().optional().describe('Cookie path. Default "/".'),
    httpOnly: z.boolean().optional().describe('Whether the cookie is httpOnly.'),
    secure: z.boolean().optional().describe('Whether the cookie is secure.'),
  },
  handler: async (request, response, context) => {
    const { tabId, name, value, domain, path, httpOnly, secure } = request.params;
    const result = await context.bridge.send('cdp', {
      tabId,
      method: 'Network.setCookie',
      params: {
        name,
        value,
        domain,
        path: path ?? '/',
        httpOnly: httpOnly ?? false,
        secure: secure ?? false,
      },
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to set cookie');
    }
    response.appendText(`Cookie "${name}" set on domain ${domain}.`);
  },
});

export const storageGet = defineTool({
  name: 'storage_get',
  description: 'Read localStorage values from the current page.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    key: z.string().optional().describe('Specific key to read. If omitted, returns all localStorage entries.'),
  },
  handler: async (request, response, context) => {
    const { tabId, key } = request.params;

    const expression = key
      ? `localStorage.getItem(${JSON.stringify(key)})`
      : `JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`;

    const result = await context.bridge.send('evaluate', { tabId, expression });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to read localStorage');
    }
    // Unwrap the CDP Runtime.evaluate response: { result: { value: "..." } }
    const data = result.data as { result?: { value?: string } } | string | undefined;
    const rawValue = typeof data === 'string' ? data : (data as { result?: { value?: string } })?.result?.value;
    const text = rawValue ?? JSON.stringify(result.data, null, 2);
    response.appendText(text);
  },
});

export const storageSet = defineTool({
  name: 'storage_set',
  description: 'Write a value to localStorage on the current page.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    key: z.string().describe('The localStorage key.'),
    value: z.string().describe('The value to store.'),
  },
  handler: async (request, response, context) => {
    const { tabId, key, value } = request.params;
    const expression = `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`;
    const result = await context.bridge.send('evaluate', { tabId, expression });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to write localStorage');
    }
    response.appendText(`localStorage["${key}"] set.`);
  },
});
