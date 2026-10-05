import { describe, expect, it } from "vitest";
import { bukanGalat } from "../galat";

describe("bukanGalat", () => {
  it("skips Node's own process warnings", () => {
    expect(
      bukanGalat(
        "(node:4) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized",
      ),
    ).toBe(true);
    expect(bukanGalat("(node:4) ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER")).toBe(
      true,
    );
  });

  it("keeps the site's own errors", () => {
    expect(bukanGalat("[api/session] unexpected error: Error: boom")).toBe(false);
    expect(bukanGalat("[api/agent] uncaught error: TypeError: x is undefined")).toBe(false);
  });
});
