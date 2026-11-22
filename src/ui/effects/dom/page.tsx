// Shared by the DOM components. Inside a native web view the page itself must be transparent
// and fixed, so the effect sits on the native screen; on web the component renders inline and
// the page is left alone.

import { IS_DOM } from 'expo/dom';
import type { ReactNode } from 'react';

const PAGE_CSS = 'html,body,#root{margin:0;padding:0;background:transparent;overflow:hidden}';

export function DomPage({ children }: { children: ReactNode }) {
  return (
    <>
      {IS_DOM ? <style>{PAGE_CSS}</style> : null}
      {children}
    </>
  );
}

// `expo/dom` declares DOMProps only in its native typings, and tsc resolves the `.web` file
// here (moduleSuffixes), so the type is taken from where expo defines it.
export type { DOMProps } from 'expo/build/dom/dom.types';
