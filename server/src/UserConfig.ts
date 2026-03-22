import { logger } from './logger.js';

interface UserEntry {
  token: string;
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
          if (!token) {
            throw new Error(`User "${userId}" has no token defined`);
          }
          if (this.#tokenToUser.has(token)) {
            throw new Error(`Duplicate token for users: "${this.#tokenToUser.get(token)}" and "${userId}"`);
          }
          this.#tokenToUser.set(token, userId);
          this.#userToToken.set(userId, token);
        }
        if (this.#tokenToUser.size === 0) {
          throw new Error('AGENT_BROWSE_USERS parsed but contains no user entries');
        }
        this.#isMultiUser = true;
        logger('Multi-user mode: %d users configured', this.#tokenToUser.size);
      } catch (err) {
        // Fail hard — do not silently fall back to no-auth
        throw new Error(
          `Fatal: AGENT_BROWSE_USERS is set but invalid: ${(err as Error).message}. ` +
          `Fix the JSON or remove the variable to run without auth.`
        );
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
