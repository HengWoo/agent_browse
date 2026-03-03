import type { TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';

type ContentItem = TextContent | ImageContent;

/**
 * Builder for MCP tool responses.
 * Tool handlers accumulate content via appendText/attachImage,
 * then build() produces the final content array.
 */
export class McpResponse {
  #lines: string[] = [];
  #images: Array<{ data: string; mimeType: string }> = [];

  appendText(text: string): void {
    this.#lines.push(text);
  }

  attachImage(data: string, mimeType: string = 'image/png'): void {
    this.#images.push({ data, mimeType });
  }

  build(toolName: string): ContentItem[] {
    const content: ContentItem[] = [];

    if (this.#lines.length > 0) {
      content.push({
        type: 'text' as const,
        text: `# ${toolName}\n\n${this.#lines.join('\n')}`,
      });
    }

    for (const img of this.#images) {
      content.push({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      });
    }

    if (content.length === 0) {
      content.push({
        type: 'text' as const,
        text: `# ${toolName}\n\nDone.`,
      });
    }

    return content;
  }
}
