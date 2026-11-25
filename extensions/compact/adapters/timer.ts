export interface Clock {
  now(): number;
}

// Pi's timer is epoch-based; timeOrigin keeps this clock compatible.
export const systemClock: Clock = {
  now: () => performance.timeOrigin + performance.now(),
};

interface TimerContextLike {
  executionStarted: boolean;
  state: unknown;
}

export interface TimerState {
  startedAt?: number;
  endedAt?: number;
  interval?: ReturnType<typeof setInterval>;
}

export function noteStart(context: TimerContextLike, clock: Clock = systemClock): void {
  const state = context.state as TimerState | undefined;
  if (state && context.executionStarted && state.startedAt === undefined) {
    state.startedAt = clock.now();
    state.endedAt = undefined;
  }
}

export function stopTimer(
  context: Pick<TimerContextLike, "state">,
  finished: boolean,
  clock: Clock = systemClock,
): void {
  const state = context.state as TimerState | undefined;
  if (!state) return;
  if (state.interval !== undefined) {
    clearInterval(state.interval);
    state.interval = undefined;
  }
  if (finished) state.endedAt ??= clock.now();
}
