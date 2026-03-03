import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ExtensionBridge } from './ExtensionBridge.js';
import { McpResponse } from './McpResponse.js';
import { Mutex } from './Mutex.js';
import { createHttpServer } from './http-server.js';
import { logger } from './logger.js';

import type { AnyToolDef } from './ToolDefinition.js';

// Tool modules
import * as tabTools from './tools/tabs.js';
import * as navigationTools from './tools/navigation.js';
import * as inputTools from './tools/input.js';
import * as screenshotTools from './tools/screenshot.js';
import * as snapshotTools from './tools/snapshot.js';
import * as scriptTools from './tools/script.js';
import * as networkTools from './tools/network.js';
import * as cookieTools from './tools/cookies.js';
import * as extractionTools from './tools/extraction.js';

const PORT = parseInt(process.env.AGENT_BROWSE_PORT ?? '18800', 10);

export async function main(): Promise<void> {
  const bridge = new ExtensionBridge(PORT);
  const toolMutex = new Mutex();

  // Start HTTP server + WebSocket
  const httpServer = createHttpServer(bridge);
  bridge.start(httpServer);

  httpServer.listen(PORT, '127.0.0.1', () => {
    logger('HTTP + WebSocket server listening on http://127.0.0.1:%d', PORT);
  });

  // MCP server
  const server = new McpServer({
    name: 'agent-browse',
    version: '0.1.0',
  });

  // Collect and register all tools
  const allTools: AnyToolDef[] = [
    ...Object.values(tabTools),
    ...Object.values(navigationTools),
    ...Object.values(inputTools),
    ...Object.values(screenshotTools),
    ...Object.values(snapshotTools),
    ...Object.values(scriptTools),
    ...Object.values(networkTools),
    ...Object.values(cookieTools),
    ...Object.values(extractionTools),
  ];

  allTools.sort((a, b) => a.name.localeCompare(b.name));

  for (const tool of allTools) {
    registerTool(server, tool, toolMutex, bridge);
  }

  logger('Registered %d tools', allTools.length);

  // Connect MCP via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger('MCP server connected via stdio');

  // Graceful shutdown
  const shutdown = async () => {
    logger('Shutting down...');
    try {
      await bridge.close();
    } catch (err) {
      logger('Error closing bridge: %O', err);
    }
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Register a single tool on the MCP server with mutex serialization.
 * The mutex ensures only one tool handler runs at a time — critical
 * because the extension processes commands sequentially.
 */
function registerTool(
  server: McpServer,
  tool: AnyToolDef,
  mutex: Mutex,
  bridge: ExtensionBridge,
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
    },
    async (params: Record<string, unknown>) => {
      const guard = await mutex.acquire();
      try {
        logger('%s request: %O', tool.name, params);

        const response = new McpResponse();
        await tool.handler(
          { params },
          response,
          { bridge },
        );

        const content = response.build(tool.name);
        return { content };
      } catch (err) {
        logger('%s error: %s', tool.name, (err as Error).message);
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        };
      } finally {
        guard.dispose();
      }
    },
  );
}
