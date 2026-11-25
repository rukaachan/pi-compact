import assert from "node:assert/strict";
import test from "node:test";
import {
  noteStart,
  stopTimer,
  systemClock,
  type Clock,
  type TimerState,
} from "../extensions/compact/adapters/timer.ts";

function clock(now: number): Clock {
  return { now: () => now };
}

test("noteStart sets the clock once", () => {
  const state: TimerState = {};
  noteStart({ executionStarted: true, state }, clock(1_000));
  const first = state.startedAt;
  assert.equal(first, 1_000);

  noteStart({ executionStarted: true, state }, clock(2_000));
  assert.equal(state.startedAt, first);
});

test("noteStart waits for execution to start", () => {
  const state: TimerState = {};
  noteStart({ executionStarted: false, state }, clock(1_000));
  assert.equal(state.startedAt, undefined);
});

test("noteStart clears a stale end time", () => {
  const state: TimerState = { endedAt: 123 };
  noteStart({ executionStarted: true, state }, clock(1_000));

  assert.equal(state.startedAt, 1_000);
  assert.equal(state.endedAt, undefined);
});

test("stopTimer ignores a missing state", () => {
  assert.doesNotThrow(() => stopTimer({ state: undefined }, true, clock(1_000)));
});

test("stopTimer clears the interval and records the end", () => {
  const interval = setInterval(() => {}, 60_000);
  interval.unref();
  const state: TimerState = { interval };

  stopTimer({ state }, true, clock(1_000));

  assert.equal(state.interval, undefined);
  assert.equal(state.endedAt, 1_000);
});

test("stopTimer keeps a partial result open", () => {
  const state: TimerState = { startedAt: 500 };
  stopTimer({ state }, false, clock(1_000));

  assert.equal(state.endedAt, undefined);
});

test("stopTimer keeps the first end time", () => {
  const state: TimerState = { startedAt: 500 };
  stopTimer({ state }, true, clock(1_000));
  stopTimer({ state }, true, clock(2_000));

  assert.equal(state.endedAt, 1_000);
});

test("a retry starts a new clock and clears the old end", () => {
  const state: TimerState = { endedAt: 500 };
  noteStart({ executionStarted: true, state }, clock(1_000));

  assert.equal(state.startedAt, 1_000);
  assert.equal(state.endedAt, undefined);
});

test("systemClock stays epoch-compatible", () => {
  assert.ok(systemClock.now() > 1_000_000_000_000);
});
