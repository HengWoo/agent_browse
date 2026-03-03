/**
 * FIFO async mutex for serializing tool calls.
 * Ensures only one tool handler runs at a time, preventing race conditions
 * on shared browser state (e.g., two tools trying to click simultaneously).
 */
export class Mutex {
  #locked = false;
  #queue: Array<() => void> = [];

  async acquire(): Promise<Guard> {
    if (!this.#locked) {
      this.#locked = true;
      return new Guard(this);
    }
    return new Promise<Guard>((resolve) => {
      this.#queue.push(() => resolve(new Guard(this)));
    });
  }

  release(): void {
    const next = this.#queue.shift();
    if (next) {
      next();
    } else {
      this.#locked = false;
    }
  }
}

export class Guard {
  #mutex: Mutex;
  #released = false;

  constructor(mutex: Mutex) {
    this.#mutex = mutex;
  }

  dispose(): void {
    if (this.#released) return;
    this.#released = true;
    this.#mutex.release();
  }
}
