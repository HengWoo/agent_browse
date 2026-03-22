import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger.js';
import { Mutex } from './Mutex.js';
import type { UserConfig } from './UserConfig.js';

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
 * Per-user connection state. Each user's Chrome extension gets one of these.
 */
class UserConnection {
  userId: string;
  ws: WebSocket | null = null;
  version: string | null = null;
  pendingRequests = new Map<string, PendingRequest>();
  cdpEventHandlers: CdpEventHandler[] = [];
  mutex = new Mutex();

  constructor(userId: string) {
    this.userId = userId;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(action: string, params: Record<string, unknown> = {}, timeout: number = 30000): Promise<BridgeResponse> {
    if (!this.isConnected) {
      throw new Error(`Extension not connected for user ${this.userId}`);
    }

    const id = randomUUID().slice(0, 8);
    const message: BridgeRequest = { id, action, ...params };

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} (${action}) timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.ws!.send(JSON.stringify(message));
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(new Error(`Failed to send ${action}: ${(err as Error).message}`));
        return;
      }

      logger('[%s] Sent %s (id=%s)', this.userId, action, id);
    });
  }

  handleMessage(msg: Record<string, unknown>, serverVersion: string): void {
    // CDP event forwarding
    if (msg.type === 'cdpEvent') {
      for (const handler of this.cdpEventHandlers) {
        try {
          handler(msg.method as string, msg.params);
        } catch (err) {
          logger('[%s] CDP event handler error: %O', this.userId, err);
        }
      }
      return;
    }

    // Version handshake
    if (msg.type === 'hello') {
      this.version = typeof msg.version === 'string' ? msg.version : null;
      if (this.version && this.version !== serverVersion) {
        logger('[%s] WARNING: Extension v%s != server v%s', this.userId, this.version, serverVersion);
      } else if (this.version) {
        logger('[%s] Extension version %s matches server', this.userId, this.version);
      }
      return;
    }

    // Status/notification messages
    if (msg.type === 'status' || msg.type === 'tabDetached' || msg.type === 'tabClosed' || msg.type === 'ping' || msg.type === 'pong') {
      return;
    }

    // Response to a pending request
    const id = msg.id as string | undefined;
    if (id && this.pendingRequests.has(id)) {
      const pending = this.pendingRequests.get(id)!;
      this.pendingRequests.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(msg as unknown as BridgeResponse);
      logger('[%s] Response for %s received', this.userId, id);
    } else if (id) {
      logger('[%s] Response for %s arrived but no pending request (timed out?)', this.userId, id);
    }
  }

  handleDisconnect(): void {
    logger('[%s] Extension disconnected', this.userId);
    this.ws = null;
    this.version = null;
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Extension disconnected'));
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Bridge shutting down'));
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
  }
}

/**
 * Lightweight proxy that presents the same interface as the old single-user
 * ExtensionBridge. Tools call context.bridge.send(action, params) — unchanged.
 */
export interface BridgeLike {
  send(action: string, params?: Record<string, unknown>, timeout?: number): Promise<BridgeResponse>;
  readonly isConnected: boolean;
  readonly versionWarning: string | null;
  onCdpEvent(handler: CdpEventHandler): void;
}

/**
 * Multi-user WebSocket bridge to Chrome extensions.
 *
 * Each user's extension connects via ws://.../ws?userId=X&token=Y.
 * Tool calls are routed to the correct user's extension via forUser(userId).
 */
export class ExtensionBridge {
  #wss: WebSocketServer | null = null;
  #connections = new Map<string, UserConnection>();
  #defaultTimeout: number;
  #port: number;
  #serverVersion: string;
  #userConfig: UserConfig | null;

  constructor(port: number = 18800, defaultTimeout: number = 30000, serverVersion: string = '0.0.0', userConfig?: UserConfig) {
    this.#port = port;
    this.#defaultTimeout = defaultTimeout;
    this.#serverVersion = serverVersion;
    this.#userConfig = userConfig ?? null;
  }

  get port(): number {
    return this.#port;
  }

  start(server: import('http').Server): void {
    this.#wss = new WebSocketServer({ server, path: '/ws' });

    this.#wss.on('connection', (ws, req) => {
      // Parse userId from query params (token moved to hello handshake for security)
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      let userId = url.searchParams.get('userId') ?? '__local__';
      let authenticated = !this.#userConfig?.hasAuth; // no auth = auto-accept

      // Hold the WebSocket in a pending state until hello authenticates
      const pendingConn = { ws, userId, authenticated };

      ws.on('message', (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch (err) {
          logger('[%s] Failed to parse extension message: %O', pendingConn.userId, err);
          return;
        }

        // Handle hello message for auth (before full registration)
        if (msg.type === 'hello' && !pendingConn.authenticated) {
          const helloUserId = (msg.userId as string) || pendingConn.userId;
          const helloToken = (msg.token as string) || '';
          pendingConn.userId = helloUserId;

          if (this.#userConfig?.hasAuth && !this.#userConfig.isValidExtensionAuth(helloUserId, helloToken)) {
            logger('Rejected extension: invalid auth for userId=%s', helloUserId);
            ws.close(4001, 'Authentication failed');
            return;
          }

          pendingConn.authenticated = true;
          userId = helloUserId;

          // Now register the connection
          let conn = this.#connections.get(userId);
          if (!conn) {
            conn = new UserConnection(userId);
            this.#connections.set(userId, conn);
          }
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            logger('[%s] Replacing existing extension connection', userId);
            conn.ws.close();
          }
          conn.ws = ws;
          conn.version = null;
          conn.handleMessage(msg, this.#serverVersion);
          logger('[%s] Extension connected and authenticated', userId);
          return;
        }

        // For no-auth mode, register on first message if not yet done
        if (!pendingConn.authenticated) return;

        const conn = this.#connections.get(pendingConn.userId);
        if (!conn) return;

        try {
          conn.handleMessage(msg, this.#serverVersion);
        } catch (err) {
          logger('[%s] UNEXPECTED error in handleMessage: %O', pendingConn.userId, err);
          const id = msg.id as string | undefined;
          if (id && conn.pendingRequests.has(id)) {
            const pending = conn.pendingRequests.get(id)!;
            conn.pendingRequests.delete(id);
            clearTimeout(pending.timer);
            pending.reject(new Error(`Internal error handling response: ${(err as Error).message}`));
          }
        }
      });

      ws.on('close', () => {
        const conn = this.#connections.get(pendingConn.userId);
        if (conn?.ws === ws) {
          conn.handleDisconnect();
        }
      });

      ws.on('error', (err) => {
        logger('[%s] Extension WebSocket error: %O', pendingConn.userId, err);
      });

      // For no-auth mode, register immediately
      if (authenticated) {
        let conn = this.#connections.get(userId);
        if (!conn) {
          conn = new UserConnection(userId);
          this.#connections.set(userId, conn);
        }
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          logger('[%s] Replacing existing extension connection', userId);
          conn.ws.close();
        }
        conn.ws = ws;
        conn.version = null;
        logger('[%s] Extension connected (no auth)', userId);
      }
    });

    logger('WebSocket server listening on path /ws');
  }

  /**
   * Returns a BridgeLike proxy scoped to a specific user.
   * Tool code calls proxy.send(action, params) — routed to the user's extension.
   */
  forUser(userId: string): BridgeLike {
    const bridge = this;
    const defaultTimeout = this.#defaultTimeout;
    const serverVersion = this.#serverVersion;

    return {
      send(action: string, params: Record<string, unknown> = {}, timeout?: number): Promise<BridgeResponse> {
        const conn = bridge.#connections.get(userId);
        if (!conn?.isConnected) {
          throw new Error(`Extension not connected for user ${userId}. Install the extension and configure it to connect to this server.`);
        }
        return conn.send(action, params, timeout ?? defaultTimeout);
      },
      get isConnected(): boolean {
        return bridge.#connections.get(userId)?.isConnected ?? false;
      },
      get versionWarning(): string | null {
        const conn = bridge.#connections.get(userId);
        if (!conn) return null;
        if (!conn.version) {
          if (conn.isConnected) {
            return 'Extension connected but did not report its version — it may be outdated.';
          }
          return null;
        }
        if (conn.version === serverVersion) return null;
        return `Extension version ${conn.version} does not match server ${serverVersion} — reload extension from chrome://extensions`;
      },
      onCdpEvent(handler: CdpEventHandler): void {
        let conn = bridge.#connections.get(userId);
        if (!conn) {
          conn = new UserConnection(userId);
          bridge.#connections.set(userId, conn);
        }
        conn.cdpEventHandlers.push(handler);
      },
    };
  }

  getMutex(userId: string): Mutex {
    let conn = this.#connections.get(userId);
    if (!conn) {
      conn = new UserConnection(userId);
      this.#connections.set(userId, conn);
    }
    return conn.mutex;
  }

  // --- Status methods ---

  isConnected(userId?: string): boolean {
    if (userId) return this.#connections.get(userId)?.isConnected ?? false;
    // Any connection active
    for (const conn of this.#connections.values()) {
      if (conn.isConnected) return true;
    }
    return false;
  }

  getConnectedUserIds(): string[] {
    return Array.from(this.#connections.entries())
      .filter(([, conn]) => conn.isConnected)
      .map(([id]) => id);
  }

  // --- Backward compat for single-user HTTP API ---

  get versionWarning(): string | null {
    // Return warning for the first connected user (backward compat)
    for (const conn of this.#connections.values()) {
      if (conn.isConnected) {
        if (!conn.version) return 'Extension connected but did not report its version.';
        if (conn.version !== this.#serverVersion) {
          return `Extension version ${conn.version} does not match server ${this.#serverVersion}`;
        }
        return null;
      }
    }
    return null;
  }

  /**
   * Send to the first connected extension (backward compat for HTTP API).
   */
  async send(action: string, params: Record<string, unknown> = {}, timeout?: number): Promise<BridgeResponse> {
    for (const conn of this.#connections.values()) {
      if (conn.isConnected) {
        return conn.send(action, params, timeout ?? this.#defaultTimeout);
      }
    }
    throw new Error('No extension connected');
  }

  async close(): Promise<void> {
    for (const conn of this.#connections.values()) {
      conn.close();
    }
    this.#connections.clear();

    if (this.#wss) {
      await new Promise<void>((resolve) => this.#wss!.close(() => resolve()));
      this.#wss = null;
    }
  }
}
