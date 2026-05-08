/* Returns the value AFTER it has been stable for `delay` ms.

   Standard pattern for typed search inputs — keep the latest user input
   in component state, feed THIS value to the network query, so the
   server only fires once the user has paused typing. */

import { useEffect, useState } from 'react';

export function useDebounced(value, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}