import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

export const click = defineTool({
  name: 'click',
  description: 'Click at x,y coordinates on the page. The tab must be attached.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    x: z.number().describe('X coordinate in CSS pixels.'),
    y: z.number().describe('Y coordinate in CSS pixels.'),
  },
  handler: async (request, response, context) => {
    const { tabId, x, y } = request.params;
    const result = await context.bridge.send('click', { tabId, x, y });
    if (!result.success) {
      throw new Error(result.error ?? 'Click failed');
    }
    response.appendText(`Clicked at (${x}, ${y}) on tab ${tabId}.`);
  },
});

export const clickSelector = defineTool({
  name: 'click_selector',
  description: 'Click an element by CSS selector. The extension resolves the selector, computes coordinates, and clicks — all atomically (no round-trips).',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    selector: z.string().describe('CSS selector for the element to click.'),
  },
  handler: async (request, response, context) => {
    const { tabId, selector } = request.params;
    const result = await context.bridge.send('clickSelector', { tabId, selector });
    if (!result.success) {
      throw new Error(result.error ?? `Failed to click selector: ${selector}`);
    }
    response.appendText(`Clicked element matching "${selector}" on tab ${tabId}.`);
  },
});

export const clickText = defineTool({
  name: 'click_text',
  description: 'Click an element by its visible text content. Finds the first element containing the text and clicks it.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    text: z.string().describe('The visible text to search for and click.'),
    exact: z.boolean().optional().describe('If true, match exact text. Default false (contains match).'),
  },
  handler: async (request, response, context) => {
    const { tabId, text, exact } = request.params;
    const result = await context.bridge.send('clickText', { tabId, text, exact: exact ?? false });
    if (!result.success) {
      throw new Error(result.error ?? `Failed to click text: "${text}"`);
    }
    response.appendText(`Clicked element with text "${text}" on tab ${tabId}.`);
  },
});

export const type = defineTool({
  name: 'type',
  description: 'Type text into the currently focused element. Characters are dispatched one at a time as keyboard events.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    text: z.string().describe('The text to type.'),
  },
  handler: async (request, response, context) => {
    const { tabId, text } = request.params;
    const result = await context.bridge.send('type', { tabId, text });
    if (!result.success) {
      throw new Error(result.error ?? 'Type failed');
    }
    response.appendText(`Typed ${text.length} characters on tab ${tabId}.`);
  },
});

export const pressKey = defineTool({
  name: 'press_key',
  description: 'Press a key or key combination (e.g., "Enter", "Tab", "Control+A", "Control+Shift+R").',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
    key: z.string().describe('Key name or combo. Modifiers: Control, Shift, Alt, Meta. Examples: "Enter", "Tab", "Control+A".'),
  },
  handler: async (request, response, context) => {
    const { tabId, key } = request.params;
    const result = await context.bridge.send('pressKey', { tabId, key });
    if (!result.success) {
      throw new Error(result.error ?? `Failed to press key: ${key}`);
    }
    response.appendText(`Pressed "${key}" on tab ${tabId}.`);
  },
});
