import { z } from 'zod';
import type { McpResponse } from './McpResponse.js';
import type { ExtensionBridge } from './ExtensionBridge.js';

export interface ToolRequest<T> {
  params: T;
}

export interface ToolContext {
  bridge: ExtensionBridge;
}

export interface ToolDef<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  schema: T;
  handler: (
    request: ToolRequest<z.infer<z.ZodObject<T>>>,
    response: McpResponse,
    context: ToolContext,
  ) => Promise<void>;
}

/**
 * Type-erased tool definition for collection in arrays.
 * The handler accepts `any` params — type safety is enforced at definition
 * site via defineTool(), and at runtime via Zod schema validation by the MCP SDK.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any>;

/**
 * Identity function providing TypeScript type inference for tool definitions.
 * Each tool is a plain object with name, description, Zod schema, and async handler.
 */
export function defineTool<T extends z.ZodRawShape>(definition: ToolDef<T>): ToolDef<T> {
  return definition;
}
