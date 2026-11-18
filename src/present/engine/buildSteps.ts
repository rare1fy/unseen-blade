export type BuildSteps<T> = Generator<void | Promise<void>, T>;
export function finishBuild<T>(steps: BuildSteps<T>): T {
  let step = steps.next();
  while (!step.done) {
    if (step.value) throw new Error('asynchronous resource in a synchronous scene build');
    step = steps.next();
  }
  return step.value;
}
// Yield to rendering on a wall-clock budget. Small rooms finish in one slice.
export async function loadInFrames<T>(steps: BuildSteps<T>): Promise<T> {
  for (;;) {
    const deadline = performance.now() + 9;
    do {
      const step = steps.next();
      if (step.done) return step.value;
      if (step.value) await step.value;
    } while (performance.now() < deadline);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
