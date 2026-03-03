import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const navigate = defineTool({
  name: 'navigate',
  description: 'Navigate a tab to a URL. The tab must be attached first.',
  schema: {
    tabId: z.number().int().describe('The tab ID to navigate.'),
    url: z.string().url().describe('The URL to navigate to.'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('navigate', {
      tabId: request.params.tabId,
      url: request.params.url,
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to navigate');
    }
    response.appendText(`Navigated tab ${request.params.tabId} to ${request.params.url}`);
  },
});
