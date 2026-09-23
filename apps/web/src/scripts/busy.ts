/**
 * Runs `fn` with `btn` busy: spinner on, disabled, and a second call while
 * the first is still in flight returns at once instead of running again.
 *
 * Setting data-loading="yes" alone (what these pages used to do) only
 * swaps the label for a spinner; it never disables the button. A second
 * click, or Enter pressed again in a form, while Neon was still waking up
 * sent the same request twice, which for "Mulai sesi" meant the second
 * create always failed with "sudah ada" right after the first succeeded.
 */
export async function denganSibuk(
  btn: HTMLButtonElement | null,
  fn: () => Promise<void>,
): Promise<void> {
  if (!btn) return fn();
  if (btn.dataset.loading === "yes") return;
  const wasDisabled = btn.disabled;
  btn.dataset.loading = "yes";
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.dataset.loading = "no";
    btn.disabled = wasDisabled;
  }
}
