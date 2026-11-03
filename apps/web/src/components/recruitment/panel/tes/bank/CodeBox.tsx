/**
 * CodeField behind lazy(): the editor library loads when a code box first shows, and the
 * box keeps its size meanwhile so nothing jumps.
 */
import { lazy, Suspense } from "react";
import type { CodeFieldProps } from "./CodeField";

const CodeField = lazy(() => import("./CodeField"));

export default function CodeBox(props: CodeFieldProps) {
  return (
    <Suspense
      fallback={
        <div
          className="bkcode bkcode--wait"
          aria-busy="true"
          style={{ ["--bk-rows" as string]: props.rows ?? 6 }}
        />
      }
    >
      <CodeField {...props} />
    </Suspense>
  );
}
