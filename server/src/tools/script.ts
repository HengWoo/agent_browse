import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const evaluate = defineTool({
  name: 'evaluate',
  description: 'Execute JavaScript in the tab and return the result. The expression is evaluated via CDP Runtime.evaluate with returnByValue and awaitPromise.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    expression: z.string().describe('JavaScript expression to evaluate.'),
  },
  handler: async (request, response, context) => {
    const { tabId, expression } = request.params;
    const result = await context.bridge.send('evaluate', { tabId, expression });
    if (!result.success) {
      throw new Error(result.error ?? 'Evaluate failed');
    }
    const data = result.data;
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    response.appendText(text);
  },
});

export const cdpRaw = defineTool({
  name: 'cdp_raw',
  description: 'Send a raw CDP command to the attached tab. Escape hatch for any Chrome DevTools Protocol method not covered by other tools.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    method: z.string().describe('CDP method name (e.g., "DOM.getDocument", "Page.reload").'),
    params: z.record(z.unknown()).optional().describe('CDP method parameters as a JSON object.'),
  },
  handler: async (request, response, context) => {
    const { tabId, method, params } = request.params;
    const result = await context.bridge.send('cdp', { tabId, method, params: params ?? {} });
    if (!result.success) {
      throw new Error(result.error ?? `CDP ${method} failed`);
    }
    const text = JSON.stringify(result.data, null, 2);
    response.appendText(text);
  },
});
