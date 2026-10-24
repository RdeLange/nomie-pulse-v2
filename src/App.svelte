<script lang="ts">
  import { onMount } from 'svelte';
  import { dayKey, addDays, checkinOn, averageEnergy, checkinStreak, energySeries, parseEnergy, type Checkin } from './logic';
  import { paletteFrom, type Palette } from './palette';
  import { offerTracker } from './tracker-offer';
  import { onPrefsChange } from './prefs-live';

  // Pulse uses several plugin functions. Each one is declared in `uses`, which the app checks.
  const USES = [
    'onLaunch', 'onNote', 'createNote', 'openNoteEditor', 'searchNotes', 'selectTrackables', 'getTrackable',
    'getTrackableUsage', 'getTrackableInput', 'openTrackableEditor', 'getLocation', 'prompt', 'alert', 'confirm',
    'getStorageItem', 'setStorageItem',
  ];

  type Tracked = { tag: string; name: string; emoji: string; values: number[] };

  let plugin: any;
  let view = $state<'modal' | 'widget'>('modal');
  let palette = $state<Palette>(paletteFrom(undefined));
  let scale = $state(1);
  let ready = $state(false);
  let today = $state(new Date());
  let checkins = $state<Checkin[]>([]);
  let trackers = $state<Tracked[]>([]);
  let gratitudeCount = $state(0);
  let shareLocation = $state(false);
  let lastAlertDay = $state<string | null>(null);
  let busy = $state(false);
  let message = $state('');

  const todayCheckin = $derived(checkinOn(checkins, today));
  const average = $derived(averageEnergy(checkins, today, 7));
  const streak = $derived(checkinStreak(checkins, today));
  const series = $derived(energySeries(checkins, today, 7));

  const applyNomieValues = () => {
    if (!plugin?.prefs) return;
    palette = paletteFrom(plugin.prefs);
    scale = plugin.prefs.fontScale || 1;
  };

  const saveAll = () =>
    plugin.storage.setItem('pulse', {
      checkins: $state.snapshot(checkins).slice(-400),
      trackerTags: trackers.map((t) => t.tag),
      shareLocation,
      lastAlertDay,
    });

  // Loads the chosen trackers from Nomie: their names, their last seven days.
  // The replies wrap the data: { trackable } and { usage }.
  const refreshTrackers = async () => {
    const loaded: Tracked[] = [];
    for (const t of trackers) {
      const info = ((await plugin.getTrackable(t.tag)) || {}).trackable || {};
      const usage = ((await plugin.getTrackableUsage({ tag: t.tag, daysBack: 6, groupByDay: true })) || {}).usage || {};
      loaded.push({
        tag: t.tag,
        name: info.tracker?.label || t.tag,
        emoji: info.tracker?.emoji || '•',
        values: usage.values || [],
      });
    }
    trackers = loaded;
  };

  const refreshGratitude = async () => {
    const found = await plugin.searchNotes('#gratitude', new Date(), 7).catch(() => []);
    gratitudeCount = Array.isArray(found) ? found.length : 0;
  };

  const refresh = async () => {
    if (!plugin || !ready) return;
    today = new Date();
    await Promise.all([refreshTrackers(), refreshGratitude()]);
  };

  const load = async () => {
    await plugin.storage.init();
    const saved = plugin.storage.getItem('pulse') || {};
    checkins = saved.checkins || [];
    shareLocation = !!saved.shareLocation;
    lastAlertDay = saved.lastAlertDay || null;
    trackers = (saved.trackerTags || []).map((tag: string) => ({ tag, name: tag, emoji: '•', values: [] }));
    ready = true;
    today = new Date();
  };

  // Writes the check-in into the timeline, with the energy as the score
  const checkIn = async () => {
    if (busy) return;
    busy = true;
    try {
      const answer = await plugin.prompt('Energy today', 'How is your energy, from 1 (empty) to 10 (full)?', 'number');
      const energy = parseEnergy(answer && typeof answer === 'object' ? answer.value : answer);
      if (!energy) {
        message = 'Enter a number from 1 to 10.';
        return;
      }
      const note: any = { note: `Energy ${energy}/10 #pulse`, score: energy, end: new Date() };
      if (shareLocation) {
        const where = await plugin.getLocation().catch(() => null);
        if (where) {
          note.lat = where.lat ?? where.latitude;
          note.lng = where.lng ?? where.longitude;
        }
      }
      plugin.createNote(note);
      checkins = [...checkins, { day: dayKey(new Date()), energy, at: Date.now() }];
      await saveAll();
      message = 'Checked in. It is in your timeline.';
      await refresh();
    } finally {
      busy = false;
    }
  };

  const pickTrackers = async () => {
    const picked = await plugin.selectTrackables('tracker', true);
    trackers = (picked || []).map((t: any) => ({ tag: t.tag || t.id || t.name, name: t.name || t.tag, emoji: t.emoji || '•', values: [] }));
    await saveAll();
    await refresh();
  };

  const openTracker = async (tag: string) => {
    const reply = await plugin.getTrackable(tag);
    if (reply?.trackable) plugin.openTrackableEditor(reply.trackable);
  };

  const reflect = () => plugin.openNoteEditor(`Pulse reflection (${dayKey(new Date())}): What gave me energy today?\n`);

  const toggleLocation = async () => {
    shareLocation = !shareLocation;
    await saveAll();
  };

  const resetAll = async () => {
    const sure = await plugin.confirm('Reset Pulse?', 'This removes the check-ins that Pulse keeps. Notes in the timeline stay.');
    if (!sure) return;
    checkins = [];
    trackers = [];
    lastAlertDay = null;
    await saveAll();
    message = 'Pulse was reset.';
  };

  // On launch, once a day, Pulse asks for the check-in if none was made yet
  const launchCheck = async () => {
    if (!ready) await load();
    const todayKey = dayKey(new Date());
    if (!checkinOn(checkins, new Date()) && lastAlertDay !== todayKey) {
      lastAlertDay = todayKey;
      await saveAll();
      plugin.alert('Good morning', 'Log your energy in Nomie Pulse today.');
    }
  };

  onMount(() => {
    plugin = new NomiePlugin({
      name: 'Nomie Pulse',
      emoji: '💗',
      description: 'Your daily pulse: a 1 to 10 energy check-in written into your timeline, your chosen trackers over the week, your gratitude notes, and a streak.',
      uses: USES,
      version: '2.0',
      addToCaptureMenu: true,
      addToMoreMenu: true,
      addToWidgets: true,
    });
    onPrefsChange(plugin, () => applyNomieValues());
  plugin.onRegistered(async () => {
      applyNomieValues();
      await load();
      await refresh();
    });
    plugin.onLaunch(() => launchCheck());
    plugin.onNote(async (payload: any) => {
      const text: string = payload?.note || '';
      if (text.includes('#pulse') || text.includes('#gratitude')) await refresh();
    });
    plugin.onWidget(async () => {
      view = 'widget';
      applyNomieValues();
      if (!ready) await load();
      await refresh();
    });
    plugin.onUIOpened(async () => {
      view = 'modal';
      applyNomieValues();
      offerTracker(plugin, { tag: 'pulse', label: 'Pulse', emoji: '💓', color: '#D6336C' });
      if (!ready) await load();
      await refresh();
    });
  });
</script>

<div class="card" class:widget={view === 'widget'} style="--page: {palette.page}; --card: {palette.card}; --text: {palette.text}; --muted: {palette.textSecondary}; --line: {palette.separator}; --fill: {palette.fill}; --tint: {palette.tint}; --on-tint: {palette.onTint}; --tint-soft: {palette.tintSoft}; --scale: {scale};">
  {#if view === 'widget'}
    <div class="head">
      <span aria-hidden="true">💗</span>
      <span>Energy {average ?? '–'}</span>
      <span class="meta">🔥 {streak}</span>
    </div>
    <button class="primary wide" onclick={checkIn} disabled={busy || !!todayCheckin}>{todayCheckin ? `Checked in: ${todayCheckin.energy}/10` : 'Check in'}</button>
  {:else}
    <h1>Pulse</h1>
    <p class="muted">{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

    <section class="panel">
      {#if todayCheckin}
        <div class="big">{todayCheckin.energy}<span class="of"> / 10</span></div>
        <p class="muted">You checked in today.</p>
      {:else}
        <p>How is your energy today?</p>
        <button class="primary" onclick={checkIn} disabled={busy}>Check in</button>
      {/if}
      {#if message}<p class="muted">{message}</p>{/if}
    </section>

    <h2>The last seven days</h2>
    <section class="panel">
      <p>Average energy <strong>{average ?? '–'}</strong> · streak 🔥 {streak} {streak === 1 ? 'day' : 'days'}</p>
      <div class="week">
        {#each series as d (d.date.toDateString())}
          <div class="col">
            <div class="column"><div style="height: {(d.energy / 10) * 100}%"></div></div>
            <span class="label">{d.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
          </div>
        {/each}
      </div>
    </section>

    <h2>Gratitude</h2>
    <section class="panel">
      <p>{gratitudeCount} {gratitudeCount === 1 ? 'note' : 'notes'} with #gratitude this week.</p>
      <button class="link" onclick={reflect}>Write a reflection</button>
    </section>

    <h2>Trackers</h2>
    <section class="panel list">
      {#each trackers as t (t.tag)}
        <button class="row" onclick={() => openTracker(t.tag)}>
          <span>{t.emoji} {t.name}</span>
          <span class="muted">{t.values.reduce((a, b) => a + b, 0)} this week</span>
        </button>
      {:else}
        <p class="muted">No trackers chosen yet.</p>
      {/each}
      <button class="link" onclick={pickTrackers}>Choose trackers</button>
    </section>

    <h2>Settings</h2>
    <section class="panel">
      <label class="switch-row"><span>Add my location to check-ins</span><input type="checkbox" checked={shareLocation} onchange={toggleLocation} /></label>
      <button class="ghost" onclick={resetAll}>Reset Pulse</button>
    </section>
  {/if}
</div>

<style>
  .card { box-sizing: border-box; min-height: 100vh; padding: 16px; background: var(--page); color: var(--text); font-size: calc(16px * var(--scale)); line-height: 1.4; }
  .card.widget { min-height: 0; padding: 12px; font-size: calc(14px * var(--scale)); }
  h1 { margin: 0; font-size: calc(26px * var(--scale)); font-weight: 700; }
  h2 { margin: 20px 0 6px; font-size: calc(13px * var(--scale)); font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { margin: 4px 0; color: var(--muted); }
  .panel { padding: 16px; border-radius: 16px; background: var(--card); }
  .list { padding: 4px 16px; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .meta { margin-left: auto; }
  .big { font-size: calc(44px * var(--scale)); font-weight: 700; line-height: 1; color: var(--tint); }
  .of { font-size: calc(20px * var(--scale)); font-weight: 400; color: var(--muted); }
  .primary, .ghost { padding: 12px 16px; border-radius: 12px; font: inherit; font-weight: 600; cursor: pointer; border: 0; }
  .primary { background: var(--tint); color: var(--on-tint); }
  .primary:disabled { opacity: 0.45; cursor: default; }
  .ghost { background: var(--fill); color: var(--text); margin-top: 8px; }
  .wide { width: 100%; margin-top: 6px; }
  .link { border: 0; background: transparent; color: var(--tint); font: inherit; padding: 8px 0; cursor: pointer; }
  .row { display: flex; justify-content: space-between; width: 100%; padding: 10px 0; border: 0; border-top: 1px solid var(--line); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .row:first-of-type { border-top: 0; }
  .week { display: flex; gap: 6px; height: 120px; align-items: flex-end; margin-top: 10px; }
  .col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
  .column { flex: 1; width: 100%; display: flex; align-items: flex-end; }
  .column > div { width: 100%; min-height: 2px; background: var(--tint); border-radius: 4px 4px 0 0; }
  .label { font-size: calc(12px * var(--scale)); color: var(--muted); }
  .switch-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
</style>
