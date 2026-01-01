import { useState, useEffect } from "react";

export default function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Set timer
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clear timer jika value berubah sebelum delay selesai (user masih mengetik)
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
