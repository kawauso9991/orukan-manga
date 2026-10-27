import { clampPage, parsePageHash } from './state.mjs';

// A transition holds passive updates until its caller has settled the layout.
// Generation numbers keep an older completion from unlocking a newer jump.
export function createNavigation({ totalPages, readPosition, moveTo, push, replace, save, onChange }) {
  let current = { page: 1, offset: 0 };
  let locked = false;
  let generation = 0;
  const copy = value => ({ page: value.page, offset: value.offset });
  function record(position) {
    current = copy(position);
    replace(copy(current));
    save(copy(current));
    onChange(copy(current));
  }
  function move(position) {
    current = copy(position);
    locked = true;
    const transition = ++generation;
    save(copy(current));
    onChange(copy(current));
    moveTo(copy(current), () => { if (transition === generation) locked = false; });
  }
  return {
    start(position) { replace(copy(position)); move(position); },
    go(page, offset = 0) {
      const previous = locked ? copy(current) : readPosition();
      replace(copy(previous));
      save(copy(previous));
      const next = { page: clampPage(page, totalPages), offset: Number.isFinite(offset) && offset >= 0 && offset <= 1 ? offset : 0 };
      push(copy(next));
      move(next);
    },
    restore(hash, saved) {
      const page = parsePageHash(hash, totalPages) ?? 1;
      const offset = saved?.page === page && Number.isFinite(saved.offset) && saved.offset >= 0 && saved.offset <= 1 ? saved.offset : 0;
      const next = { page, offset };
      replace(copy(next));
      move(next);
    },
    reflow() {
      // Keep the last logical position: reading the already resized layout here
      // would interpret the old absolute scroll Y as a different page.
      const next = { page: clampPage(current.page, totalPages),
        offset: Number.isFinite(current.offset) ? Math.max(0, Math.min(1, current.offset)) : 0 };
      replace(copy(next));
      move(next);
    },
    observe() { if (!locked) current = copy(readPosition()); },
    passive() { if (!locked) record(readPosition()); },
    persist() { record(locked ? current : readPosition()); }
  };
}
