import { describe, it, expect } from 'vitest';
import { McpResponse } from '../McpResponse.js';

describe('McpResponse', () => {
  it('builds text content with tool name header', () => {
    const res = new McpResponse();
    res.appendText('Hello world');
    const content = res.build('test_tool');

    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: '# test_tool\n\nHello world',
    });
  });

  it('builds multiple text lines', () => {
    const res = new McpResponse();
    res.appendText('Line 1');
    res.appendText('Line 2');
    const content = res.build('multi');

    expect(content[0]).toEqual({
      type: 'text',
      text: '# multi\n\nLine 1\nLine 2',
    });
  });

  it('includes image content', () => {
    const res = new McpResponse();
    res.appendText('Screenshot taken');
    res.attachImage('base64data', 'image/png');
    const content = res.build('screenshot');

    expect(content).toHaveLength(2);
    expect(content[0].type).toBe('text');
    expect(content[1]).toEqual({
      type: 'image',
      data: 'base64data',
      mimeType: 'image/png',
    });
  });

  it('returns default "Done." when no content added', () => {
    const res = new McpResponse();
    const content = res.build('empty');

    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: '# empty\n\nDone.',
    });
  });
});
