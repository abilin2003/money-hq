// Small UI helpers. No alert() or confirm() anywhere in this app.

// First tap changes the button to a confirm label. A second tap within the timeout runs onConfirm.
// Returns a function that resets the button to its idle state.
export function armConfirm(button, idleLabel, confirmLabel, onConfirm, timeoutMs = 4000) {
  let timer = null;
  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = idleLabel;
    button.classList.remove('armed');
  };
  button.addEventListener('click', () => {
    if (timer === null) {
      button.textContent = confirmLabel;
      button.classList.add('armed');
      timer = setTimeout(reset, timeoutMs);
      return;
    }
    reset();
    onConfirm();
  });
  return reset;
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
