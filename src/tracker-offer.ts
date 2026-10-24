// Offers, once, to add the plugin's tracker when Nomie does not have it yet. Needs getTrackable, openTrackableEditor and confirm.
export type TrackerDefinition = { tag: string; label: string; emoji: string; color: string };

const ASKED_KEY = 'tracker-asked';

export const offerTracker = async (plugin: any, tracker: TrackerDefinition) => {
  await plugin.storage.init();
  const reply = await plugin.getTrackable(`#${tracker.tag}`);
  // Nomie says known: false when it does not have the tracker; older versions do not say, so they get no offer
  if (!reply || reply.known !== false || plugin.storage.getItem(ASKED_KEY)) return;
  await plugin.storage.setItem(ASKED_KEY, true);
  const answer = await plugin.confirm(`Add the ${tracker.label} tracker?`, `This plugin writes #${tracker.tag} into your timeline. Add the tracker now, so it has its own name, emoji and colour?`);
  if (answer?.value === true) {
    plugin.openTrackableEditor({ type: 'tracker', tracker: { ...tracker, type: 'tick', math: 'sum' } });
  }
};
