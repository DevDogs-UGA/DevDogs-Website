/**
 * The row class every line of the profile popover uses (kit `.menu a`, with the
 * stepped hover). `tn-row` is in topnav.css.
 *
 * Shared rather than kept in either component: ProfilePopover renders the plain
 * rows, NavSubMenu renders the sub-menu triggers, and the two have to look
 * identical apart from the glyph they lead with.
 */
export const POPOVER_ROW = "tn-row";

/**
 * The caret a sub-menu row leads with, in place of a plain row's icon. It sets
 * no size of its own, so it renders at 1em, the same box a bare Phosphor icon
 * takes. That is what lines the two kinds of row up.
 */
export const POPOVER_ROW_CARET = "tn-caret";

/** The hairline between the popover's bands (kit `.menu hr`). */
export const POPOVER_DIVIDER = "tn-rule";
