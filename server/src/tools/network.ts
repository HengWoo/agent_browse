import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const networkEnable = defineTool({
  name: 'network_enable',
  description: 'Start capturing network requests on an attached tab. Enables the CDP Network domain. Call this before navigating to capture XHR/fetch traffic.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('cdp', {
      tabId: request.params.tabId,
      method: 'Network.enable',
      params: {},
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to enable network capture');
    }
    response.appendText(`Network capture enabled on tab ${request.params.tabId}. Navigate and then use network_requests to see captured traffic.`);
  },
});

export const networkRequests = defineTool({
  name: 'network_requests',
  description: 'List captured network requests (XHR/fetch only by default). Requires network_enable first. Returns URL, method, status, content type.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    filter: z.string().optional().describe('Optional URL substring filter.'),
    allTypes: z.boolean().optional().describe('If true, include all resource types (not just XHR/fetch). Default false.'),
  },
  handler: async (request, response, context) => {
    const { tabId, filter, allTypes } = request.params;
    const result = await context.bridge.send('networkRequests', { tabId, filter, allTypes: allTypes ?? false });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get network requests');
    }

    const requests = result.data as Array<{
      id: string;
      url: string;
      method: string;
      status: number;
      type: string;
      size: number;
    }>;

    if (!requests || requests.length === 0) {
      response.appendText('No network requests captured. Make sure network_enable was called before navigation.');
      return;
    }

    const lines = requests.map((r) =>
      `[${r.id}] ${r.method} ${r.status ?? '...'} ${r.url.slice(0, 120)} (${r.type}, ${r.size ? (r.size / 1024).toFixed(1) + 'KB' : 'pending'})`
    );
    response.appendText(`${requests.length} requests:\n\n${lines.join('\n')}`);
  },
});

export const networkRequestDetail = defineTool({
  name: 'network_request_detail',
  description: 'Get full request and response body for a specific captured network request. Use the request ID from network_requests.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    requestId: z.string().describe('The network request ID from network_requests.'),
  },
  handler: async (request, response, context) => {
    const { tabId, requestId } = request.params;
    const result = await context.bridge.send('networkRequestDetail', { tabId, requestId });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get request detail');
    }

    const detail = result.data as {
      url: string;
      method: string;
      requestHeaders: Record<string, string>;
      requestBody?: string;
      status: number;
      responseHeaders: Record<string, string>;
      responseBody?: string;
    };

    const lines: string[] = [];
    lines.push(`## ${detail.method} ${detail.url}`);
    lines.push(`Status: ${detail.status}`);
    lines.push('');

    if (detail.requestHeaders && Object.keys(detail.requestHeaders).length > 0) {
      lines.push('### Request Headers');
      for (const [k, v] of Object.entries(detail.requestHeaders)) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push('');
    }

    if (detail.requestBody) {
      lines.push('### Request Body');
      lines.push(detail.requestBody);
      lines.push('');
    }

    if (detail.responseHeaders && Object.keys(detail.responseHeaders).length > 0) {
      lines.push('### Response Headers');
      for (const [k, v] of Object.entries(detail.responseHeaders)) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push('');
    }

    if (detail.responseBody) {
      lines.push('### Response Body');
      // Truncate very large bodies
      const MAX_BODY = 100 * 1024;
      if (detail.responseBody.length > MAX_BODY) {
        lines.push(detail.responseBody.slice(0, MAX_BODY));
        lines.push(`\n... (truncated, ${(detail.responseBody.length / 1024).toFixed(0)}KB total)`);
      } else {
        lines.push(detail.responseBody);
      }
    }

    response.appendText(lines.join('\n'));
  },
});
