import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const tabsList = defineTool({
  name: 'tabs_list',
  description: 'List all open browser tabs with their id, url, title, and debugger attachment status.',
  schema: {},
  handler: async (_request, response, context) => {
    const result = await context.bridge.send('listTabs');
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to list tabs');
    }
    const tabs = result.data as Array<{ id: number; url: string; title: string }>;
    if (!tabs || tabs.length === 0) {
      response.appendText('No tabs found.');
      return;
    }
    const lines = tabs.map(
      (t) => `- [${t.id}] ${t.title}\n  ${t.url}`,
    );
    response.appendText(lines.join('\n'));
  },
});

export const tabAttach = defineTool({
  name: 'tab_attach',
  description: 'Attach the Chrome debugger to a tab by its ID. Required before most other actions.',
  schema: {
    tabId: z.number().int().describe('The tab ID to attach to (from tabs_list).'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('attach', { tabId: request.params.tabId });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to attach to tab');
    }
    response.appendText(`Attached to tab ${request.params.tabId}.`);
  },
});

export const tabDetach = defineTool({
  name: 'tab_detach',
  description: 'Detach the Chrome debugger from a tab.',
  schema: {
    tabId: z.number().int().describe('The tab ID to detach from.'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('detach', { tabId: request.params.tabId });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to detach from tab');
    }
    response.appendText(`Detached from tab ${request.params.tabId}.`);
  },
});
