import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { ExtensionBridge, type BridgeLike } from './ExtensionBridge.js';
import { McpResponse } from './McpResponse.js';
import { createHttpServer } from './http-server.js';
import { logger } from './logger.js';
import { readFileSync } from 'node:fs';
import { UserConfig } from './UserConfig.js';

import type { AnyToolDef } from './ToolDefinition.js';

const SERVER_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version as string;

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
const MCP_PORT = parseInt(process.env.AGENT_BROWSE_MCP_PORT ?? '0', 10);
const MCP_HOST = process.env.AGENT_BROWSE_MCP_HOST ?? '127.0.0.1';

export async function main(): Promise<void> {
  const userConfig = new UserConfig();
  const bridge = new ExtensionBridge(PORT, 30000, SERVER_VERSION, userConfig);

  // Start HTTP server + WebSocket (attach WSS only after successful listen)
  const { server: httpServer, app: httpApp } = createHttpServer(bridge, SERVER_VERSION);

  let httpListening = false;
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      const HTTP_HOST = process.env.AGENT_BROWSE_HOST ?? '127.0.0.1';
      httpServer.listen(PORT, HTTP_HOST, () => {
        httpServer.removeListener('error', reject);
        httpListening = true;
        bridge.start(httpServer);
        logger('HTTP + WebSocket server listening on http://%s:%d', HTTP_HOST, PORT);
        resolve();
      });
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      logger('Port %d already in use — continuing with MCP stdio only', PORT);
    } else {
      throw err;
    }
  }

  // MCP server
  const server = new McpServer({
    name: 'agent-browse',
    version: SERVER_VERSION,
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
    registerTool(server, tool, bridge);
  }

  logger('Registered %d tools', allTools.length);

  // Connect MCP transport
  let mcpHttpServer: http.Server | undefined;
  const useRemoteMcp = MCP_PORT > 0 || process.env.AGENT_BROWSE_MCP_SAME_PORT === '1';

  if (useRemoteMcp) {
    // Remote mode: Streamable HTTP transport (stateless — auth is external)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Choose which Express app to mount on
    const mountOnSamePort = MCP_PORT === 0 || MCP_PORT === PORT;
    const mcpApp = mountOnSamePort ? httpApp : express();
    if (!mountOnSamePort) mcpApp.use(express.json());

    // Per-user auth middleware
    if (userConfig.hasAuth) {
      mcpApp.use('/mcp', (req, res, next) => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const token = auth.slice(7);
        const userId = userConfig.getUserIdByToken(token);
        if (!userId) {
          res.status(401).json({ error: 'Invalid token' });
          return;
        }
        (req as unknown as Record<string, unknown>).auth = {
          token,
          clientId: userId,
          scopes: [],
        };
        next();
      });
      logger('MCP auth enabled (%s)', userConfig.isMultiUser ? 'multi-user' : 'single-user');
    }

    mcpApp.all('/mcp', async (req, res) => {
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logger('MCP transport error: %O', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal MCP transport error' });
        }
      }
    });

    if (mountOnSamePort) {
      logger('MCP mounted on same port %d at /mcp', PORT);
    } else {
      mcpHttpServer = http.createServer(mcpApp);
      await new Promise<void>((resolve, reject) => {
        mcpHttpServer!.once('error', reject);
        mcpHttpServer!.listen(MCP_PORT, MCP_HOST, () => {
          mcpHttpServer!.removeListener('error', reject);
          logger('MCP Streamable HTTP listening on http://%s:%d/mcp', MCP_HOST, MCP_PORT);
          resolve();
        });
      });
    }

    await server.connect(transport);
    logger('MCP server connected via Streamable HTTP');
  } else {
    // Local mode: stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger('MCP server connected via stdio');
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger('Shutting down...');
    try {
      await bridge.close();
    } catch (err) {
      logger('Error closing bridge: %O', err);
    }
    if (httpListening) httpServer.close();
    if (mcpHttpServer) mcpHttpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Register a tool with per-user routing.
 *
 * The MCP SDK passes extra.authInfo.clientId (set by our auth middleware).
 * We use it to resolve the user's extension connection and per-user mutex.
 * Tools see a BridgeLike proxy — their code is unchanged.
 */
function registerTool(
  server: McpServer,
  tool: AnyToolDef,
  bridge: ExtensionBridge,
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
    },
    async (params: Record<string, unknown>, extra: { authInfo?: { clientId?: string } }) => {
      const userId = extra?.authInfo?.clientId ?? '__local__';
      const userMutex = bridge.getMutex(userId);
      const guard = await userMutex.acquire();

      try {
        logger('[%s] %s request: %O', userId, tool.name, params);

        const response = new McpResponse();
        const userBridge: BridgeLike = bridge.forUser(userId);

        await tool.handler(
          { params },
          response,
          { bridge: userBridge },
        );

        const content = response.build(tool.name);
        const warning = userBridge.versionWarning;
        if (warning) {
          content.unshift({ type: 'text' as const, text: `⚠️ ${warning}` });
        }
        return { content };
      } catch (err) {
        logger('[%s] %s error: %O', userId, tool.name, err);
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
