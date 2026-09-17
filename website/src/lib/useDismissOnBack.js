import { useEffect, useRef } from 'react';
import { createLayerHistory } from './layerHistory.js';

let navigation;
function getNavigation() {
  if (!navigation) {
    navigation = createLayerHistory(window.history, (listener) => {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    });
  }
  return navigation;
}

export function useDismissOnBack(active, onDismiss) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  useEffect(() => {
    if (!active) return undefined;
    return getNavigation().add(() => onDismissRef.current());
  }, [active]);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => navigation?.dispose());
}
