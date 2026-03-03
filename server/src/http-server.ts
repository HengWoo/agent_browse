import express, { type Request, type Response } from 'express';
import http from 'node:http';
import { logger } from './logger.js';
import type { ExtensionBridge } from './ExtensionBridge.js';

/**
 * HTTP endpoints for backward compatibility with browse-cli.sh and external scripts.
 * These replicate the original relay_server.py HTTP API.
 */
export function createHttpServer(bridge: ExtensionBridge): http.Server {
  const app = express();
  app.use(express.json());

  // CORS — same as relay_server.py
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Health/info
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      server: 'agent-browse-mcp',
      version: '0.1.0',
      extensionConnected: bridge.isConnected,
    });
  });

  // List tabs
  app.get('/tabs', async (_req: Request, res: Response) => {
    try {
      const result = await bridge.send('listTabs');
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Generic action endpoint — maps HTTP POST to extension action
  const actionRoutes: Array<{ path: string; action: string; bodyKeys: string[] }> = [
    { path: '/attach', action: 'attach', bodyKeys: ['tabId'] },
    { path: '/detach', action: 'detach', bodyKeys: ['tabId'] },
    { path: '/navigate', action: 'navigate', bodyKeys: ['tabId', 'url'] },
    { path: '/click', action: 'click', bodyKeys: ['tabId', 'x', 'y'] },
    { path: '/type', action: 'type', bodyKeys: ['tabId', 'text'] },
    { path: '/evaluate', action: 'evaluate', bodyKeys: ['tabId', 'expression'] },
    { path: '/screenshot', action: 'screenshot', bodyKeys: ['tabId'] },
    { path: '/pageInfo', action: 'getPageInfo', bodyKeys: ['tabId'] },
    { path: '/cdp', action: 'cdp', bodyKeys: ['tabId', 'method', 'params'] },
    { path: '/snapshot', action: 'snapshot', bodyKeys: ['tabId'] },
  ];

  for (const route of actionRoutes) {
    app.post(route.path, async (req: Request, res: Response) => {
      try {
        const params: Record<string, unknown> = {};
        for (const key of route.bodyKeys) {
          if (req.body[key] !== undefined) {
            params[key] = req.body[key];
          }
        }
        const result = await bridge.send(route.action, params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    });
  }

  const server = http.createServer(app);
  logger('HTTP endpoints registered');
  return server;
}
