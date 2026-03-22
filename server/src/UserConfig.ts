import { logger } from './logger.js';

interface UserEntry {
  token: string;
  name?: string;
}

/**
 * Maps Bearer tokens to userIds for multi-user auth.
 *
 * Config sources (checked in order):
 * 1. AGENT_BROWSE_USERS env var: JSON object mapping userId → token (or UserEntry)
 * 2. AGENT_BROWSE_AUTH_TOKEN env var: single-user fallback with "__local__" userId
 * 3. No auth: all connections accepted as "__local__"
 */
export class UserConfig {
  #tokenToUser = new Map<string, string>();
  #userToToken = new Map<string, string>();
  #isMultiUser: boolean;

  constructor() {
    const usersJson = process.env.AGENT_BROWSE_USERS;
    const singleToken = process.env.AGENT_BROWSE_AUTH_TOKEN;

    if (usersJson) {
      try {
        const parsed = JSON.parse(usersJson) as Record<string, string | UserEntry>;
        for (const [userId, value] of Object.entries(parsed)) {
          const token = typeof value === 'string' ? value : value.token;
          this.#tokenToUser.set(token, userId);
          this.#userToToken.set(userId, token);
        }
        this.#isMultiUser = true;
        logger('Multi-user mode: %d users configured', this.#tokenToUser.size);
      } catch {
        logger('ERROR: Failed to parse AGENT_BROWSE_USERS — falling back to single-user');
        this.#isMultiUser = false;
      }
    } else {
      this.#isMultiUser = false;
    }

    if (!this.#isMultiUser && singleToken) {
      this.#tokenToUser.set(singleToken, '__local__');
      this.#userToToken.set('__local__', singleToken);
      logger('Single-user mode with auth token');
    } else if (!this.#isMultiUser) {
      logger('No auth configured — all connections accepted as __local__');
    }
  }

  get isMultiUser(): boolean {
    return this.#isMultiUser;
  }

  get hasAuth(): boolean {
    return this.#tokenToUser.size > 0;
  }

  getUserIdByToken(token: string): string | null {
    return this.#tokenToUser.get(token) ?? null;
  }

  getTokenByUserId(userId: string): string | null {
    return this.#userToToken.get(userId) ?? null;
  }

  isValidExtensionAuth(userId: string, token: string): boolean {
    if (!this.hasAuth) return true;
    const expected = this.#userToToken.get(userId);
    return expected === token;
  }

  getAllUserIds(): string[] {
    return Array.from(this.#userToToken.keys());
  }
}
