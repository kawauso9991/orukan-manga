export function createScrollThrottle(callback, milliseconds = 180) {
  let timer = null;
  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(() => { timer = null; callback(); }, milliseconds);
    },
    cancel() { clearTimeout(timer); timer = null; }
  };
}
