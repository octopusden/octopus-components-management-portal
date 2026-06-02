import { useEffect, useState } from 'react'

/**
 * Returns `value` after it has stopped changing for `delayMs`. Used to debounce
 * the version input on the As Code tab so we don't fire a request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])
  return debounced
}
