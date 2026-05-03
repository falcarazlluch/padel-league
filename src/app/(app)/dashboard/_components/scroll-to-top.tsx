'use client';

import { useEffect } from 'react';

/**
 * Forces scroll to (0,0) on mount. Mitigates a Safari quirk where after the
 * auth layout (with the looping background video) tears down on login, the
 * new layout occasionally renders mid-scroll instead of from the top.
 */
export function ScrollToTopOnMount() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);
  return null;
}
