// Serializes history updates after React has finished effect setup/cleanup.
// In particular, StrictMode and role replacement must not issue overlapping
// history.back() calls that consume a newly opened screen's entry.
export function createLayerHistory(history, subscribe, defer = queueMicrotask) {
  const key = '__metriqWebsiteDepth';
  const layers = [];
  let depth = 0;
  let scheduled = false;
  let navigating = false;
  history.replaceState({ ...history.state, [key]: 0 }, '');

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    defer(() => {
      scheduled = false;
      if (navigating) return;
      while (depth < layers.length) {
        depth++;
        history.pushState({ ...history.state, [key]: depth }, '');
      }
      if (depth > layers.length) {
        navigating = true;
        history.go(layers.length - depth);
      }
    });
  }

  const unsubscribe = subscribe((event) => {
    const nextDepth = Math.max(0, Number(event.state?.[key]) || 0);
    if (navigating) {
      navigating = false;
      depth = nextDepth;
      schedule();
      return;
    }
    depth = nextDepth;
    // A user back press dismisses only layers crossed by that navigation.
    const removed = layers.splice(Math.min(nextDepth, layers.length));
    removed.reverse().forEach((layer) => layer.dismiss());
    schedule();
  });

  return {
    add(dismiss) {
      const layer = { dismiss };
      layers.push(layer);
      schedule();
      return () => {
        const index = layers.indexOf(layer);
        if (index === -1) return;
        layers.splice(index, 1);
        schedule();
      };
    },
    dispose: unsubscribe,
  };
}
