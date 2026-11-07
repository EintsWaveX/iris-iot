/**
 * Tampilan on the test page (7 Nov 2026). The test has no navbar, so the panel that holds the theme,
 * the background detail, the language and the sound had no way in. This is the same panel (DisplayPanel)
 * behind one round button pinned to the top right corner of every test screen: check-in, the lobby,
 * the written parts, Live Coding and the end.
 *
 * Two things are different from the navbar's version, both because the page is in full screen:
 * - the popover is portalled into the full screen element (the kit's useFullscreenEl), or the browser
 *   would not draw it;
 * - the language changes in place. The navbar reloads the page into the other language's address,
 *   and a reload drops full screen (a strike) and the Live Coding editor. Here the page keeps its
 *   state, swaps the strings, and only rewrites the address bar and the saved choice.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import DisplayPanel from "../../shell/DisplayPanel";
import IconButton from "../../ui/IconButton";
import { useFullscreenEl } from "../../ui/fullscreen";

import "../../ui/Popover.css";
import "../../shell/AppNav.css";

type Ctx = { lang: Lang; setLang: (to: Lang) => void };
const LangCtx = createContext<Ctx | null>(null);

export function TestLangProvider({
  lang,
  setLang,
  children,
}: Ctx & {
  children: ReactNode;
}) {
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

const LABEL: Record<Lang, string> = { id: "Tampilan", en: "Display", zh: "显示" };

/** The round Tampilan button and its panel; nothing when the page has no language owner */
export default function TestDisplay() {
  const c = useContext(LangCtx);
  const [open, setOpen] = useState(false);
  const fs = useFullscreenEl();
  if (!c) return null;
  const label = LABEL[c.lang];
  return (
    <div className="r3tamp">
      <RadixPopover.Root open={open} onOpenChange={setOpen}>
        <RadixPopover.Trigger asChild>
          <IconButton icon={SlidersHorizontalIcon} label={label} tipSide="bottom" />
        </RadixPopover.Trigger>
        <RadixPopover.Portal container={fs ?? undefined}>
          <RadixPopover.Content
            className="popover__panel appnav__disp"
            aria-label={label}
            tabIndex={-1}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)?.focus();
            }}
            align="end"
            sideOffset={10}
            collisionPadding={12}
          >
            <DisplayPanel lang={c.lang} onLang={c.setLang} />
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
    </div>
  );
}
