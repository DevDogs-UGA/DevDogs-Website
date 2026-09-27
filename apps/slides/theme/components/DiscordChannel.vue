<script setup lang="ts">
// A Discord channel, drawn the way Discord draws a channel mention in a
// message: a blurple-tinted pill with the channel's icon and name. `forum`
// swaps the "#" for Discord's forum-channel speech bubbles.
//   <DiscordChannel name="tech-support" forum />
defineProps<{
  name: string
  forum?: boolean
}>()
</script>

<template>
  <span class="dd-discord-channel">
    <ph-chats-teardrop-bold v-if="forum" class="dd-discord-channel-icon" />
    <ph-hash-bold v-else class="dd-discord-channel-icon" />{{ name }}
  </span>
</template>

<style scoped>
/* Discord's own mention colours: blurple (#5865F2) at 30% behind a pale
   blurple label. */
.dd-discord-channel {
  display: inline-flex;
  align-items: center;
  gap: 0.2em;
  padding: 0.05em 0.35em 0.05em 0.25em;
  border-radius: 0.25em;
  background: rgb(88 101 242 / 30%);
  color: #c9cdfb;
  font-weight: 600;
  white-space: nowrap;
}

.dd-discord-channel-icon {
  font-size: 0.95em;
}
</style>
