/**
 * The token slice the templates and primitives read, gathered in one module so
 * they import it instead of the package's own `index.ts` (which re-exports
 * them and would make a cycle).
 */
export {
  BLOCK_SHADOW,
  ACCENT,
  CONTACT,
  MAUVE,
  THEME,
  WHITE,
  WORDMARK_METRICS,
} from "./brand.js";
export { loadFonts, type LoadedFont } from "./fonts.js";
export {
  type Asset,
  GDG_MARK,
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "./generated/assets.js";
