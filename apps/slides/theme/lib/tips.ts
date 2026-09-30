// Where a code column's helper banner (components/CodeTips.vue) goes: a slot
// the layout puts under the code window, outside it, so the window holds
// only code. The layout names the slot's element id through <SnippetScope
// tips="…">, and CodeTips teleports itself there.
import { inject, provide, type InjectionKey } from "vue";

const TIPS: InjectionKey<string | undefined> = Symbol("dd-tips-target");

export function provideTipsTarget(id: string | undefined) {
  if (id) provide(TIPS, id);
}

export function useTipsTarget(): string | undefined {
  return inject(TIPS, undefined);
}
