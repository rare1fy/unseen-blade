export type BuildSteps<T> = Generator<void | Promise<void>, T>;
export function finishBuild<T>(steps: BuildSteps<T>): T {
  let step = steps.next();
  while (!step.done) {
    if (step.value) throw new Error('asynchronous resource in a synchronous scene build');
    step = steps.next();
  }
  return step.value;
}
/** the last frame-split build: busy = ms spent in steps, wall = ms from start to end, frames = how many frames it spanned,
 *  steps = how many, maxStep = the longest single step (ms) — read by the transition's timings */
export const BUILD_STATS = { busy: 0, wall: 0, frames: 0, steps: 0, maxStep: 0 };
// Yield to rendering on a wall-clock budget. Small rooms finish in one slice.
export async function loadInFrames<T>(steps: BuildSteps<T>, budget = 9): Promise<T> {
  const S = BUILD_STATS, t0 = performance.now(); S.busy = 0; S.frames = 0; S.steps = 0; S.maxStep = 0;
  for (;;) {
    const deadline = performance.now() + budget;
    do {
      const a = performance.now(), step = steps.next(), b = performance.now();
      S.steps++; S.busy += b - a; S.maxStep = Math.max(S.maxStep, b - a);
      if (step.done) { S.wall = performance.now() - t0; return step.value; }
      if (step.value) await step.value;
    } while (performance.now() < deadline);
    S.frames++;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
