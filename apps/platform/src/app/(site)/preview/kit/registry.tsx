import type { ComponentType } from "react";
import Actions from "./_sections/actions";
import Command from "./_sections/command";
import Fields from "./_sections/fields";
import Foundation from "./_sections/foundation";
import Labels from "./_sections/labels";
import Navigation from "./_sections/navigation";
import Overlays from "./_sections/overlays";
import Surfaces from "./_sections/surfaces";

/**
 * The gallery's sections in page order. The page renders this list and nothing
 * else about the primitives, so a unit edits only its own `_sections/<id>.tsx`.
 * Foundation-owned: units request changes here.
 */
export const KIT_SECTIONS: readonly {
  id: string;
  Section: ComponentType;
}[] = [
  { id: "foundation", Section: Foundation },
  { id: "actions", Section: Actions },
  { id: "surfaces", Section: Surfaces },
  { id: "labels", Section: Labels },
  { id: "fields", Section: Fields },
  { id: "navigation", Section: Navigation },
  { id: "overlays", Section: Overlays },
  { id: "command", Section: Command },
];
