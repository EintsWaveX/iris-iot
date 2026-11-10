/**
 * Turns a burst of calls into few (10 Nov 2026). The first call after a quiet
 * spell runs at once, so a lone message is as quick as before; calls that come
 * while the window is open are folded into ONE run when it closes (so the
 * latest message is never lost), and that run opens the next window. A steady
 * stream therefore runs at most once per `ms`. Pure apart from the timers.
 */
export function coalesce(run: () => void, ms: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  const close = () => {
    if (pending) {
      pending = false;
      timer = setTimeout(close, ms);
      run();
    } else {
      timer = null;
    }
  };
  return {
    call() {
      if (timer) {
        pending = true;
        return;
      }
      timer = setTimeout(close, ms);
      run();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}
