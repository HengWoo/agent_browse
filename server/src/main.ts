import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

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

  // Collect all tool definitions (shared across all MCP server instances)
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

  // Factory: creates a new McpServer with all tools registered
  function createMcpServer(): McpServer {
    const s = new McpServer({ name: 'agent-browse', version: SERVER_VERSION });
    for (const tool of allTools) {
      registerTool(s, tool, bridge);
    }
    return s;
  }

  logger('Tool definitions loaded: %d tools', allTools.length);

  // Connect MCP transport
  let mcpHttpServer: http.Server | undefined;
  const useRemoteMcp = MCP_PORT > 0 || process.env.AGENT_BROWSE_MCP_SAME_PORT === '1';

  if (useRemoteMcp) {
    // Remote mode: Streamable HTTP with per-session server+transport pairs.
    // The MCP SDK requires a fresh transport per session (stateless transports
    // are single-use; session transports track state per session ID).
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    const mountOnSamePort = MCP_PORT === 0 || MCP_PORT === PORT;
    if (mountOnSamePort && !httpListening) {
      throw new Error(
        `Cannot mount MCP on port ${PORT} — HTTP server failed to start. ` +
        `Set AGENT_BROWSE_MCP_PORT to a different port, or fix the port conflict.`
      );
    }
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
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          // Existing session — reuse transport
          const transport = sessions.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New session — create server + transport
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              sessions.set(sid, transport);
              logger('MCP session created: %s (active: %d)', sid, sessions.size);
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && sessions.has(sid)) {
              sessions.delete(sid);
              logger('MCP session closed: %s (active: %d)', sid, sessions.size);
            }
          };
          const server = createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null,
          });
        }
      } catch (err) {
        logger('MCP transport error: %O', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal MCP transport error' });
        }
      }
    });

    if (mountOnSamePort) {
      logger('MCP mounted on same port %d at /mcp (session mode)', PORT);
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

    logger('MCP ready via Streamable HTTP (session mode)');
  } else {
    // Local mode: stdio transport — single server instance
    const server = createMcpServer();
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
      let userId = extra?.authInfo?.clientId ?? '__local__';
      // Fallback: if resolved userId has no connection, use first connected user
      if (!bridge.isConnected(userId)) {
        const connected = bridge.getConnectedUserIds();
        console.error(`[agent-browse] userId=${userId} not connected, connected users: ${JSON.stringify(connected)}`);
        if (connected.length > 0) {
          console.error(`[agent-browse] Falling back to ${connected[0]}`);
          userId = connected[0];
        }
      }
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
