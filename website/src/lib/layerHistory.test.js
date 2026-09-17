import { describe, it, expect, vi } from 'vitest';
import { createLayerHistory } from './layerHistory.js';

function harness() {
  const entries = [{}];
  let cursor = 0;
  let listener;
  const deferred = [];
  const events = [];
  const history = {
    get state() { return entries[cursor]; },
    replaceState(state) { entries[cursor] = state; },
    pushState(state) { entries.splice(cursor + 1); entries.push(state); cursor++; },
    go(delta) { events.push(() => { cursor += delta; expect(cursor).toBeGreaterThanOrEqual(0); listener({ state: entries[cursor] }); }); },
  };
  const manager = createLayerHistory(history, fn => { listener = fn; return () => {}; }, fn => deferred.push(fn));
  const flush = () => { while (deferred.length) deferred.shift()(); };
  const settle = () => { flush(); while (events.length) { events.shift()(); flush(); } };
  return { manager, flush, settle, history, depth: () => cursor };
}

describe('website back navigation', () => {
  it('coalesces StrictMode mount/cleanup/remount into one history entry', () => {
    const h = harness();
    const close = h.manager.add(vi.fn()); close(); h.manager.add(vi.fn());
    h.settle(); expect(h.depth()).toBe(1);
  });
  it('replaces sign-in with its role without consuming the new role entry', () => {
    const h = harness();
    h.manager.add(vi.fn()); h.settle();
    const signIn = h.manager.add(vi.fn()); h.settle();
    signIn(); const closeRole = h.manager.add(vi.fn()); h.settle();
    expect(h.depth()).toBe(2);
    closeRole(); h.settle(); expect(h.depth()).toBe(1);
  });
  it('dismisses only the top dialog on browser back', () => {
    const h = harness(); const screen = vi.fn(); const dialog = vi.fn();
    h.manager.add(screen); h.settle(); h.manager.add(dialog); h.settle();
    h.history.go(-1); h.settle();
    expect(dialog).toHaveBeenCalledOnce(); expect(screen).not.toHaveBeenCalled();
    expect(h.depth()).toBe(1);
  });
  it('serializes a new layer opened while a close navigation is pending', () => {
    const h = harness(); h.manager.add(vi.fn()); h.settle();
    const close = h.manager.add(vi.fn()); h.settle(); close(); h.flush();
    const newLayer = vi.fn(); h.manager.add(newLayer); h.settle();
    expect(h.depth()).toBe(2); expect(newLayer).not.toHaveBeenCalled();
  });
  it('coalesces multiple in-app closures without leaving the website', () => {
    const h = harness(); const a = h.manager.add(vi.fn()); h.settle();
    const b = h.manager.add(vi.fn()); h.settle(); b(); a(); h.settle();
    expect(h.depth()).toBe(0);
  });
});
