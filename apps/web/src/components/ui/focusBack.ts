/**
 * Give focus back when a full-screen layer closes: to whatever opened it, or, when that button is gone
 * (a celebration or an envelope hides its own opener), to the page's main region so a keyboard or
 * screen-reader user does not land on <body> at the top of the page.
 */
export function focusBack(opener: HTMLElement | null): void {
  if (opener?.isConnected) {
    opener.focus();
    return;
  }
  const main = document.querySelector<HTMLElement>("main, [role=main]");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}
