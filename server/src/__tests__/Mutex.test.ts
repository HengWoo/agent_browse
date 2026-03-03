import { describe, it, expect } from 'vitest';
import { Mutex } from '../Mutex.js';

describe('Mutex', () => {
  it('allows immediate acquisition when unlocked', async () => {
    const mutex = new Mutex();
    const guard = await mutex.acquire();
    expect(guard).toBeDefined();
    guard.dispose();
  });

  it('serializes concurrent acquisitions in FIFO order', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const guard1 = await mutex.acquire();

    // These will queue up behind guard1
    const p2 = mutex.acquire().then((g) => {
      order.push(2);
      g.dispose();
    });
    const p3 = mutex.acquire().then((g) => {
      order.push(3);
      g.dispose();
    });

    order.push(1);
    guard1.dispose(); // releases → p2 gets it, then p3

    await Promise.all([p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('allows re-acquisition after release', async () => {
    const mutex = new Mutex();
    const g1 = await mutex.acquire();
    g1.dispose();
    const g2 = await mutex.acquire();
    g2.dispose();
  });
});
