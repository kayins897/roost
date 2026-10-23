/** Keep a 60 Hz cadence without dropping alternating frames at fractional rAF times. */
export function createFrameClock(fps = 60) {
  const interval = 1000 / fps;
  let previous: number | undefined, deadline = 0;
  return {
    step(now: number) {
      if (previous !== undefined && now + .5 < deadline) return null;
      const delta = previous === undefined ? 0 : Math.min(Math.max(0, now - previous) / 1000, .1);
      previous = now;
      if (!deadline || now - deadline > interval) deadline = now + interval;
      else deadline += interval;
      return delta;
    },
    reset() { previous = undefined; deadline = 0; },
  };
}
