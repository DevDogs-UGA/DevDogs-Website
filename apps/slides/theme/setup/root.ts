// Connects the deck to the live relay (lib/live.ts) and makes the relay one
// of Slidev's sync methods, so the presenter view's slide and clicks reach
// the demo laptops' local decks the same way they reach another tab.
// Slidev runs this before it sets up its own shared state, so the method is
// in place for it.
import { addSyncMethod, useNav } from "@slidev/client";
import { watch } from "vue";
import { connect, liveEnabled, onRelayState, sendState } from "../lib/live";

export default function setupRoot() {
  if (!liveEnabled) return;

  addSyncMethod({
    init(channelKey, onUpdate) {
      // Only the nav state (page, clicks, timer, cursor), not drawings.
      if (!channelKey.endsWith(" - shared")) return undefined;
      onRelayState((state) => onUpdate(state as never));
      return (state, updating) => {
        if (!updating) sendState(state as Record<string, unknown>);
      };
    },
  });

  // Only the hosted deck's presenter view drives; a local deck always
  // follows, even in its own presenter view.
  const { isPresenter } = useNav();
  watch(
    isPresenter,
    (presenter) =>
      connect(presenter && !import.meta.env.DEV ? "drive" : "follow"),
    { immediate: true },
  );
}
