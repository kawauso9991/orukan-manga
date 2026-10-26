import { parsePageHash } from './state.mjs';

export function installPageControl({ form, input, totalPages, onNavigate }) {
  let dirty = false;
  input.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.reportValidity()) return;
    const page = parsePageHash(`#p=${input.value}`, totalPages);
    if (page !== null) { dirty = false; onNavigate(page); }
  });
  return {
    update(page) { if (!dirty) input.value = String(page); },
    clearDraft() { dirty = false; }
  };
}
