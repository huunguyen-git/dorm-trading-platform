import { expect, it } from 'vitest';

// Temporary P0-06 draft-PR exercise; remove after observing the failed gate.
it('P0-06 proves a failing client test blocks the required gate', () => {
  expect(true).toBe(false);
});
