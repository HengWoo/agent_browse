import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const waitFor = defineTool({
  name: 'wait_for',
  description: 'Wait for a condition on the page: a CSS selector to appear, text to become visible, or network to go idle. Returns when the condition is met or timeout expires.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    selector: z.string().optional().describe('CSS selector to wait for.'),
    text: z.string().optional().describe('Text to wait for on the page.'),
    networkIdle: z.boolean().optional().describe('Wait for no network requests for 2 seconds.'),
    timeout: z.number().int().optional().describe('Timeout in ms. Default 30000.'),
  },
  handler: async (request, response, context) => {
    const { tabId, selector, text, networkIdle, timeout } = request.params;
    const ms = timeout ?? 30000;

    if (!selector && !text && !networkIdle) {
      throw new Error('Provide at least one of: selector, text, or networkIdle.');
    }

    const result = await context.bridge.send('waitFor', {
      tabId,
      selector,
      text,
      networkIdle: networkIdle ?? false,
      timeout: ms,
    }, ms + 5000); // Bridge timeout slightly longer than wait timeout

    if (!result.success) {
      throw new Error(result.error ?? 'Wait timed out');
    }
    response.appendText(`Wait condition met${selector ? ` (selector: ${selector})` : ''}${text ? ` (text: "${text}")` : ''}${networkIdle ? ' (network idle)' : ''}.`);
  },
});

export const extractTable = defineTool({
  name: 'extract_table',
  description: 'Extract data from HTML <table> elements as structured JSON arrays. Each row becomes an array of cell values. Handles thead/tbody.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    selector: z.string().optional().describe('CSS selector for the table element. Default "table".'),
    includeHeaders: z.boolean().optional().describe('Include header row. Default true.'),
  },
  handler: async (request, response, context) => {
    const { tabId, selector, includeHeaders } = request.params;
    const tableSelector = selector ?? 'table';
    const withHeaders = includeHeaders ?? true;

    const result = await context.bridge.send('evaluate', {
      tabId,
      expression: `
        (function() {
          const table = document.querySelector(${JSON.stringify(tableSelector)});
          if (!table) return JSON.stringify({ error: "No table found matching: ${tableSelector}" });

          const rows = [];
          const headerRow = table.querySelector('thead tr');
          if (headerRow && ${JSON.stringify(withHeaders)}) {
            const cells = Array.from(headerRow.querySelectorAll('th, td'));
            rows.push(cells.map(c => c.innerText.trim()));
          }

          const bodyRows = table.querySelectorAll('tbody tr, tr');
          for (const row of bodyRows) {
            if (row.parentElement.tagName === 'THEAD') continue;
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length > 0) {
              rows.push(cells.map(c => c.innerText.trim()));
            }
          }

          return JSON.stringify({ rows, rowCount: rows.length });
        })()
      `,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to extract table');
    }

    const resultData = result.data as { result?: { value?: string } } | string;
    const rawValue = typeof resultData === 'string' ? resultData : (resultData as { result?: { value?: string } })?.result?.value;
    if (!rawValue) {
      throw new Error('No evaluation result');
    }

    const parsed = JSON.parse(rawValue);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    response.appendText(`Extracted ${parsed.rowCount} rows:\n\n${JSON.stringify(parsed.rows, null, 2)}`);
  },
});

export const extractLinks = defineTool({
  name: 'extract_links',
  description: 'Get all links on the page with their text and href. Useful for navigation and content discovery.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    selector: z.string().optional().describe('CSS selector to scope link extraction. Default "body".'),
  },
  handler: async (request, response, context) => {
    const { tabId, selector } = request.params;
    const scope = selector ?? 'body';

    const result = await context.bridge.send('evaluate', {
      tabId,
      expression: `
        (function() {
          const container = document.querySelector(${JSON.stringify(scope)});
          if (!container) return JSON.stringify([]);
          const links = Array.from(container.querySelectorAll('a[href]'));
          return JSON.stringify(links.map(a => ({
            text: a.innerText.trim().slice(0, 200),
            href: a.href,
          })).filter(l => l.text || l.href));
        })()
      `,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to extract links');
    }

    const resultData = result.data as { result?: { value?: string } } | string;
    const rawValue = typeof resultData === 'string' ? resultData : (resultData as { result?: { value?: string } })?.result?.value;
    if (!rawValue) {
      response.appendText('No links found.');
      return;
    }

    const links = JSON.parse(rawValue) as Array<{ text: string; href: string }>;
    if (links.length === 0) {
      response.appendText('No links found.');
      return;
    }

    const lines = links.map((l) => `- [${l.text || '(no text)'}](${l.href})`);
    response.appendText(`${links.length} links:\n\n${lines.join('\n')}`);
  },
});

export const downloadMonitor = defineTool({
  name: 'download_monitor',
  description: 'Set up download behavior and monitor for file downloads. Uses CDP Browser.setDownloadBehavior. Returns when a download completes or timeout expires.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    downloadPath: z.string().optional().describe('Directory to save downloads. Default /tmp/agent-browse-downloads.'),
    timeout: z.number().int().optional().describe('Timeout in ms. Default 60000.'),
  },
  handler: async (request, response, context) => {
    const { tabId, downloadPath, timeout } = request.params;
    const dir = downloadPath ?? '/tmp/agent-browse-downloads';
    const ms = timeout ?? 60000;

    // Set download behavior
    const setResult = await context.bridge.send('cdp', {
      tabId,
      method: 'Browser.setDownloadBehavior',
      params: {
        behavior: 'allowAndName',
        downloadPath: dir,
        eventsEnabled: true,
      },
    });

    if (!setResult.success) {
      throw new Error(setResult.error ?? 'Failed to set download behavior');
    }

    // Wait for download complete event
    const waitResult = await context.bridge.send('waitForDownload', {
      tabId,
      timeout: ms,
    }, ms + 5000);

    if (!waitResult.success) {
      response.appendText(`Download monitoring enabled (saving to ${dir}). No download completed within ${ms / 1000}s timeout.`);
      return;
    }

    const dl = waitResult.data as { guid: string; suggestedFilename: string };
    response.appendText(`Download completed: ${dl.suggestedFilename} (saved to ${dir})`);
  },
});
