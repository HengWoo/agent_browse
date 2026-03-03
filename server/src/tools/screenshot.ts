import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const screenshot = defineTool({
  name: 'screenshot',
  description: 'Capture a screenshot of the attached tab. Returns the image inline if under 2MB, otherwise saves to a temp file.',
  schema: {
    tabId: z.number().int().describe('The tab ID to screenshot.'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('screenshot', { tabId: request.params.tabId });
    if (!result.success) {
      throw new Error(result.error ?? 'Screenshot failed');
    }

    const data = result.data as { data: string } | string;
    const base64 = typeof data === 'string' ? data : data.data;

    // Check size — MCP has practical limits on inline images
    const sizeBytes = Math.ceil(base64.length * 0.75);
    const MAX_INLINE = 2 * 1024 * 1024; // 2MB

    if (sizeBytes > MAX_INLINE) {
      const tmpFile = join(tmpdir(), `agent-browse-screenshot-${Date.now()}.png`);
      await writeFile(tmpFile, Buffer.from(base64, 'base64'));
      response.appendText(`Screenshot saved to ${tmpFile} (${(sizeBytes / 1024 / 1024).toFixed(1)}MB — too large for inline).`);
    } else {
      response.attachImage(base64, 'image/png');
      response.appendText(`Screenshot captured (${(sizeBytes / 1024).toFixed(0)}KB).`);
    }
  },
});
