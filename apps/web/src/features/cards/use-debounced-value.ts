import { useEffect, useState } from "react";

/** Returns `value` after it has stopped changing for `delayMilliseconds`. */
export function useDebouncedValue<Value>(value: Value, delayMilliseconds = 250): Value {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMilliseconds);
    return () => clearTimeout(timer);
  }, [value, delayMilliseconds]);

  return debounced;
}
