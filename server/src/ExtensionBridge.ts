import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger.js';

export interface BridgeRequest {
  id: string;
  action: string;
  [key: string]: unknown;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: BridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type CdpEventHandler = (method: string, params: unknown) => void;

/**
 * WebSocket bridge to the Chrome extension.
 * Replaces relay_server.py — same protocol, same port.
 *
 * The extension connects to ws://127.0.0.1:{port}/ws and sends/receives
 * JSON messages with UUID-based request/response correlation.
 */
export class ExtensionBridge {
  #wss: WebSocketServer | null = null;
  #extensionWs: WebSocket | null = null;
  #pendingRequests = new Map<string, PendingRequest>();
  #cdpEventHandlers: CdpEventHandler[] = [];
  #defaultTimeout: number;
  #port: number;

  constructor(port: number = 18800, defaultTimeout: number = 30000) {
    this.#port = port;
    this.#defaultTimeout = defaultTimeout;
  }

  get port(): number {
    return this.#port;
  }

  get isConnected(): boolean {
    return this.#extensionWs?.readyState === WebSocket.OPEN;
  }

  /**
   * Start the WebSocket server. Called once at startup.
   * The path /ws matches the extension's connection URL.
   */
  start(server: import('http').Server): void {
    this.#wss = new WebSocketServer({ server, path: '/ws' });

    this.#wss.on('connection', (ws) => {
      logger('Extension connected');

      // Single-connection model: new connection replaces old
      if (this.#extensionWs && this.#extensionWs.readyState === WebSocket.OPEN) {
        logger('Replacing existing extension connection');
        this.#extensionWs.close();
      }
      this.#extensionWs = ws;

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.#handleMessage(msg);
        } catch (err) {
          logger('Failed to parse extension message: %O', err);
        }
      });

      ws.on('close', () => {
        logger('Extension disconnected');
        if (this.#extensionWs === ws) {
          this.#extensionWs = null;
        }
        // Reject all pending requests — extension gone
        for (const [, pending] of this.#pendingRequests) {
          pending.reject(new Error('Extension disconnected'));
          clearTimeout(pending.timer);
        }
        this.#pendingRequests.clear();
      });

      ws.on('error', (err) => {
        logger('Extension WebSocket error: %O', err);
      });
    });

    logger('WebSocket server listening on path /ws');
  }

  /**
   * Send a command to the extension and wait for the response.
   * Uses UUID-based request/response matching with configurable timeout.
   */
  async send(action: string, params: Record<string, unknown> = {}, timeout?: number): Promise<BridgeResponse> {
    if (!this.isConnected) {
      throw new Error('Extension not connected. Load the extension in Chrome and ensure it connects to ws://127.0.0.1:' + this.#port + '/ws');
    }

    const id = randomUUID().slice(0, 8);
    const message: BridgeRequest = { id, action, ...params };

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(new Error(`Request ${id} (${action}) timed out after ${timeout ?? this.#defaultTimeout}ms`));
      }, timeout ?? this.#defaultTimeout);

      this.#pendingRequests.set(id, { resolve, reject, timer });
      this.#extensionWs!.send(JSON.stringify(message));
      logger('Sent %s (id=%s)', action, id);
    });
  }

  /**
   * Register a handler for CDP events forwarded from the extension.
   */
  onCdpEvent(handler: CdpEventHandler): void {
    this.#cdpEventHandlers.push(handler);
  }

  #handleMessage(msg: Record<string, unknown>): void {
    // CDP event forwarding (new message type from enhanced extension)
    if (msg.type === 'cdpEvent') {
      const method = msg.method as string;
      const params = msg.params;
      for (const handler of this.#cdpEventHandlers) {
        handler(method, params);
      }
      return;
    }

    // Status/notification messages (no id — fire-and-forget from extension)
    if (msg.type === 'status' || msg.type === 'tabDetached' || msg.type === 'tabClosed' || msg.type === 'ping' || msg.type === 'pong') {
      logger('Extension event: %s %O', msg.type, msg);
      return;
    }

    // Response to a pending request
    const id = msg.id as string | undefined;
    if (id && this.#pendingRequests.has(id)) {
      const pending = this.#pendingRequests.get(id)!;
      this.#pendingRequests.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(msg as unknown as BridgeResponse);
      logger('Response for %s received', id);
    } else if (id) {
      logger('Received response for unknown request id: %s', id);
    }
  }

  async close(): Promise<void> {
    for (const [id, pending] of this.#pendingRequests) {
      pending.reject(new Error('Bridge shutting down'));
      clearTimeout(pending.timer);
    }
    this.#pendingRequests.clear();

    if (this.#extensionWs) {
      this.#extensionWs.close();
      this.#extensionWs = null;
    }

    if (this.#wss) {
      await new Promise<void>((resolve) => this.#wss!.close(() => resolve()));
      this.#wss = null;
    }
  }
}
