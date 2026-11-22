export function nextRandom(state: number): { state: number; value: number } {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { state: next, value: next / 2 ** 32 };
}
