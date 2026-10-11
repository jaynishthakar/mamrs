import { mountPreferencesReact } from './PreferencesReact.js';

const $ = selector => document.querySelector(selector);
const state = { user: null, csrf: '', options: null, mood: null, activity: null, result: null, view: 'discover', generation: 0, ratingSong: null, started: false };
let authMode = 'register', toastTimer;
const symbols = { Happy: '☀', Sad: '☂', Relaxed: '≈', Energetic: 'ϟ', Romantic: '♡', Stressed: '〰', Study: '▤', Workout: '↗', Driving: '⌁', Party: '✳', Sleep: '☾', Meditation: '◉' };
function el(tag, className, content) { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function signedOut() {
  state.generation++; state.started = false; state.user = null; state.csrf = ''; state.result = null; state.mood = null; state.activity = null;
  $('#app-view').hidden = true; $('#auth-view').hidden = false;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
}
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-MAMRS-Request': '1', 'X-CSRF-Token': state.csrf }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !['/login', '/register'].includes(path)) signedOut();
    throw new Error(data.error || 'Request failed. Please try again.');
  }
  return data;
}
function setAuthMode(mode) {
  authMode = mode; const register = mode === 'register';
  $('#register-tab').classList.toggle('selected', register); $('#login-tab').classList.toggle('selected', !register);
  $('#name-label').hidden = !register; $('#auth-form').elements.name.required = register;
  $('#auth-heading').textContent = register ? 'Make yourself at home.' : 'Welcome back.';
  $('#auth-description').textContent = register ? 'Create an account to make the music yours.' : 'Your next good listen is waiting.';
  $('#auth-submit').textContent = register ? 'Create account ↗' : 'Sign in ↗';
  $('#auth-form').elements.password.autocomplete = register ? 'new-password' : 'current-password'; $('#auth-error').textContent = '';
}
$('#register-tab').onclick = () => setAuthMode('register'); $('#login-tab').onclick = () => setAuthMode('login');
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); $('#auth-error').textContent = ''; $('#auth-submit').disabled = true;
  try { const result = await api(`/${authMode}`, { method: 'POST', body: Object.fromEntries(new FormData(event.target)) }); await enter(result); event.target.reset(); }
  catch (err) { $('#auth-error').textContent = err.message; }
  finally { $('#auth-submit').disabled = false; }
};
async function enter({ user, csrf }) {
  state.user = user; state.csrf = csrf;
  state.options = await api('/options');
  $('#user-name').textContent = user.name; $('#avatar').textContent = user.name.slice(0, 1).toUpperCase();
  $('#auth-view').hidden = true; $('#app-view').hidden = false;
  renderChoices('moods', 'mood'); renderChoices('activities', 'activity');
  state.started = false; $('#generate').disabled = false; $('#generate').textContent = 'Find my music ↗';
  $('#context-note').textContent = 'Choose a mood and activity, or explore with neutral defaults.';
  state.result = null; $('#save-mix').disabled = true; $('#results-title').textContent = 'Your next good listen'; $('#notices').replaceChildren();
  empty($('#results'), 'Every moment has a soundtrack.', 'Set the scene above and discover yours.');
  $('#artist-results').replaceChildren(); $('#catalog-search').reset();
  await navigate('discover');
}
$('#logout').onclick = async () => { try { await api('/logout', { method: 'POST', body: {} }); signedOut(); setAuthMode('login'); } catch (err) { toast(err.message); } };
function renderChoices(group, key) {
  const container = $(`#${group}`); container.replaceChildren();
  state.options[group].forEach(value => {
    const button = el('button', 'choice'); button.type = 'button'; button.setAttribute('aria-pressed', String(state[key] === value));
    const symbol = el('span', 'symbol', symbols[value] || '◈'); symbol.setAttribute('aria-hidden', 'true'); button.append(symbol, el('span', '', value));
    button.onclick = () => {
      state[key] = state[key] === value ? null : value;
      renderChoices(group, key);
      $('#context-note').textContent = `${state.mood || 'Neutral mood'} · ${state.activity || 'General activity'}`;
      if (state.started) generate();
    };
    container.append(button);
  });
}
function empty(container, title, message) { const box = el('div', 'empty-state'); box.append(el('span', '', '♫'), el('h3', '', title), el('p', '', message)); container.replaceChildren(box); }
function songRow(song, index, allowRating = true, allowPlaylist = true, playlistId = null) {
  const row = el('div', 'song-row');
  row.append(el('span', 'song-number', String(index + 1).padStart(2, '0')), el('span', `cover ${song.color || 'coral'}`));
  const info = el('div', 'song-info');
  info.append(el('strong', '', song.title), el('small', '', `${song.artist} · ${song.duration == null ? 'Duration unknown' : Math.floor(song.duration / 60) + ':' + String(song.duration % 60).padStart(2, '0')}`));
  const details = el('details', 'song-details');
  details.append(el('summary', '', 'Why this track?'), el('p', '', (song.reasons || ['Saved from your catalog']).join(' · ')), el('p', '', `${song.source || 'Archived demo'} · ${song.tagSource || 'Legacy'} tags`));
  info.append(details);
  if (song.discovery) info.append(el('small', 'muted', 'Discovery · outside your artist and genre favorites'));
  row.append(info);
  const tags = el('div', 'song-tags', `${song.genre || 'Unknown'} · ${song.language || 'Unknown'}`);
  if (song.reasons) tags.title = song.reasons.join(' • ');
  row.append(tags);
  if (allowRating) {
    const score = el('span', 'score', `${song.score} pts`);
    score.title = song.reasons ? song.reasons.join(' • ') : '';
    row.append(score);
  }
  const actions = el('div', 'song-actions');
  if (playlistId) {
    const removeBtn = el('button', 'track-remove-btn');
    removeBtn.setAttribute('aria-label', `Remove ${song.title} from playlist`);
    const removeIcon = el('span', 'btn-icon', '✕');
    const removeText = el('span', 'btn-text', 'Remove');
    removeBtn.append(removeIcon, removeText);
    removeBtn.onclick = async () => {
      try {
        await api(`/playlists/${playlistId}/songs/${song.id}`, { method: 'DELETE' });
        toast(`Removed “${song.title}”`);
        await loadPlaylists();
      } catch (err) { toast(err.message); }
    };
    actions.append(removeBtn);
  } else {
    if (allowPlaylist) {
      const addBtn = el('button', 'add-playlist-btn');
      addBtn.setAttribute('aria-label', `Add ${song.title} to playlist`);
      const plusIcon = el('span', 'btn-icon', '+');
      const addText = el('span', 'btn-text', 'Playlist');
      addBtn.append(plusIcon, addText);
      addBtn.onclick = () => openAddToPlaylist(song);
      actions.append(addBtn);
    }
    if (allowRating) {
      const rate = el('button', 'rate-button', song.rating ? `★ ${song.rating}/5` : '☆ Rate');
      rate.setAttribute('aria-label', `Rate ${song.title}`);
      rate.onclick = () => openRating(song);
      actions.append(rate);
    }
  }
  const source = el('a', 'source-link', '↗');
  source.href = song.sourceUrl || 'https://musicbrainz.org';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.setAttribute('aria-label', `Metadata for ${song.title}`);
  actions.append(source);
  row.append(actions);
  return row;
}
async function generate() {
  state.started = true;
  const request = ++state.generation;
  const context = { mood: state.mood, activity: state.activity };
  $('#generate').disabled = true; $('#generate').textContent = 'Finding your music…'; $('#save-mix').disabled = true;
  $('#results').replaceChildren(el('div', 'loading', 'Finding the right tracks for your moment…')); $('#notices').replaceChildren();
  try {
    const result = await api('/recommendations', { method: 'POST', body: context });
    if (request !== state.generation) return;
    state.result = result;
    $('#results-title').textContent = `${context.mood || 'A little discovery'}${context.activity ? ` / ${context.activity}` : ''}`;
    $('#notices').replaceChildren(...result.notices.map(n => el('p', '', n)));
    if (result.songs.length) { const list = el('div', 'song-list'); result.songs.forEach((s, i) => list.append(songRow(s, i))); $('#results').replaceChildren(list); }
    else empty($('#results'), 'No tracks for this moment yet.', 'Try another mood or activity. Your current selections have been kept.');
    if (result.unclassifiedFavorites?.length) {
      const pending = el('section', 'pending-favorites');
      pending.append(el('h3', '', 'Your favorites · awaiting context tags'), el('p', 'muted', 'These imported tracks match your favorites. Their fit for this mood and activity has not been verified.'));
      const explore = el('button', 'outline', 'Explore favorites without context');
      explore.onclick = async () => {
        state.mood = null; state.activity = null;
        renderChoices('moods', 'mood'); renderChoices('activities', 'activity');
        $('#context-note').textContent = 'Neutral mood · General activity';
        await generate();
      };
      pending.append(explore);
      for (const song of result.unclassifiedFavorites) {
        const row = el('div', 'catalog-track'), info = el('div');
        info.append(el('strong', '', song.title), el('p', 'muted', song.artist), el('small', '', `Needs ${song.missingLabels.join(' and ')} tags`));
        const tag = el('button', 'outline', 'Add personal tags'); tag.onclick = () => openTags(song);
        row.append(info, tag); pending.append(row);
      }
      if (result.unclassifiedFavoriteCount > result.unclassifiedFavorites.length) {
        const all = el('button', 'outline', `See all ${result.unclassifiedFavoriteCount} favorite tracks in Your catalog`);
        all.onclick = async () => { $('#catalog-search').elements.query.value = state.user.preferences.artists?.[0] || ''; await navigate('catalog'); };
        pending.append(all);
      }
      if (result.songs.length) pending.append(el('h3', '', result.songs.every(s => s.discovery) ? 'Other artists matching this moment' : 'Tracks matching this moment'));
      $('#results').prepend(pending);
    }
    $('#save-mix').disabled = !result.songs.length;
  } catch (err) {
    if (request !== state.generation) return;
    state.result = null; empty($('#results'), 'We couldn’t load your mix.', err.message);
    const retry = el('button', 'outline retry', 'Try again'); retry.onclick = generate; $('#results').append(retry);
  } finally { if (request === state.generation) { $('#generate').disabled = false; $('#generate').textContent = 'Find my music ↗'; } }
}
$('#generate').onclick = generate;
function openDialog(id) {
  const dialog = $(id);
  const err = dialog.querySelector('.dialog-error');
  if (err) err.textContent = '';
  dialog.showModal();
}
document.querySelectorAll('.close-dialog').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
$('#preferences-button').onclick = () => {
  const container = $('#preferences-fields');
  mountPreferencesReact({
    container,
    options: state.options,
    initialPreferences: state.user.preferences,
    onSave: async (preferences) => {
      await api('/preferences', { method: 'PUT', body: preferences });
      state.user.preferences = preferences;
      $('#preferences-dialog').close();
      toast('Preferences saved.');
      if (state.started) await generate();
    },
    onClose: () => {
      $('#preferences-dialog').close();
    }
  });
  openDialog('#preferences-dialog');
};
async function submitDialog(event, task) {
  event.preventDefault(); const form = event.target, button = form.querySelector('button.primary'); button.disabled = true; form.querySelector('.dialog-error').textContent = '';
  try { await task(form); } catch (err) { form.querySelector('.dialog-error').textContent = err.message; } finally { button.disabled = false; }
}
async function openRating(song) {
  state.ratingSong = song; $('#rating-form').reset(); $('#rating-song').textContent = `${song.title} — ${song.artist}`;
  openDialog('#rating-dialog');
  try {
    const { ratings } = await api('/ratings');
    if (state.ratingSong.id !== song.id || !$('#rating-dialog').open) return;
    const saved = ratings.find(r => r.song_id === song.id);
    if (saved) { const f = $('#rating-form'); f.elements.score.value = saved.score; f.elements.comment.value = saved.comment; f.elements.helpful.value = saved.helpful ?? ''; }
  } catch (err) { $('#rating-form .dialog-error').textContent = err.message; }
}
$('#rating-form').onsubmit = event => submitDialog(event, async form => {
  const values = new FormData(form);
  await api('/ratings', { method: 'POST', body: { songId: state.ratingSong.id, score: Number(values.get('score')), helpful: values.get('helpful') === '' ? null : Number(values.get('helpful')), comment: values.get('comment') } });
  $('#rating-dialog').close(); toast('Rating saved. Your recommendations are being refreshed.'); await generate();
});
let pendingAddSong = null;

$('#save-mix').onclick = () => { $('#save-form').elements.name.value = `${state.result.context.mood || 'Discovery'}${state.result.context.activity ? ` / ${state.result.context.activity}` : ''} mix`; openDialog('#save-dialog'); };
$('#save-form').onsubmit = event => submitDialog(event, async form => {
  await api('/playlists', { method: 'POST', body: { name: form.elements.name.value, songIds: state.result.songs.map(s => s.id), kind: 'mix' } });
  $('#save-dialog').close(); toast('Mix saved. Find it in Saved mixes.');
});
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => navigate(button.dataset.view); });
async function navigate(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(n => { n.hidden = n.id !== `${view}-view`; });
  document.querySelectorAll('[data-view]').forEach(n => { n.classList.toggle('active', n.dataset.view === view); if (n.dataset.view === view) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); });
  const names = { discover: 'Discover', playlists: 'Playlists', mixes: 'Saved mixes', history: 'Recent moments', ratings: 'Your ratings', catalog: 'Your catalog' };
  $('#breadcrumb').textContent = `Your space / ${names[view] || 'Discover'}`;
  if (view === 'discover') return;
  if (view === 'catalog') return loadCatalog();
  if (view === 'playlists') return loadPlaylists();
  if (view === 'mixes') return loadMixes();
  const container = $(`#${view}-content`);
  if (!container) return;
  container.replaceChildren(el('div', 'loading', 'Loading your collection…'));
  try {
    const data = await api(`/${view}`);
    if (state.view !== view) return;
    container.replaceChildren();
    if (view === 'history') {
      if (!data.history.length) return empty(container, 'Your story starts here.', 'Generate a mix to record your first moment.');
      data.history.forEach(h => { const row = el('div', 'history-row'), title = el('div'); title.append(el('h3', '', `${h.mood || 'Neutral'} / ${h.activity || 'General'}`), el('p', '', formatDate(h.created_at))); const revisit = el('button', 'outline', 'Revisit ↗'); revisit.onclick = async () => { state.mood = h.mood; state.activity = h.activity; renderChoices('moods', 'mood'); renderChoices('activities', 'activity'); $('#context-note').textContent = `${state.mood || 'Neutral mood'} · ${state.activity || 'General activity'}`; await navigate('discover'); await generate(); }; row.append(title, revisit); container.append(row); });
    } else {
      if (!data.ratings.length) return empty(container, 'What sounds like you?', 'Rate a recommendation to start shaping your music.');
      data.ratings.forEach(r => { const card = el('article', 'rating-history'); card.append(el('h3', '', `${r.song.title} — ${r.score}/5`), el('p', '', `${r.song.artist} · ${formatDate(r.updated_at)}${r.helpful === null ? '' : ` · ${r.helpful ? 'Fits' : 'Does not fit'} your moment`}`)); if (r.comment) card.append(el('p', '', r.comment)); container.append(card); });
    }
  } catch (err) { empty(container, 'Couldn’t load this page.', err.message); const retry = el('button', 'outline retry', 'Try again'); retry.onclick = () => navigate(view); container.append(retry); }
}

const collapsedPlaylists = new Set();

async function loadPlaylists() {
  const container = $('#playlists-list');
  container.replaceChildren(el('div', 'loading', 'Loading your playlists…'));
  try {
    const data = await api('/playlists?kind=playlist');
    container.replaceChildren();
    const toggleAllBtn = $('#toggle-all-playlists-btn');
    if (!data.playlists.length) {
      if (toggleAllBtn) toggleAllBtn.hidden = true;
      empty(container, 'No playlists yet.', 'Create a playlist with “＋ Create playlist” above, or search for a song to get started.');
      return;
    }
    if (toggleAllBtn) {
      toggleAllBtn.hidden = false;
      const allCollapsed = data.playlists.every(p => collapsedPlaylists.has(p.id));
      toggleAllBtn.textContent = allCollapsed ? 'Expand all' : 'Minimize all';
    }
    data.playlists.forEach(p => {
      const isCollapsed = collapsedPlaylists.has(p.id);
      const card = el('section', `playlist-card${isCollapsed ? ' collapsed' : ''}`);
      card.dataset.playlistId = String(p.id);

      const header = el('div', 'playlist-header');
      const titleWrap = el('div', 'playlist-title-wrap');
      titleWrap.title = 'Click to minimize/expand playlist';
      titleWrap.append(
        el('h3', 'playlist-name', p.name),
        el('p', 'playlist-meta', `${p.songs.length} tracks · Created ${formatDate(p.created_at)}`)
      );

      const actions = el('div', 'playlist-header-actions');
      const toggleBtn = el('button', 'outline playlist-toggle-btn');
      toggleBtn.setAttribute('aria-label', isCollapsed ? `Expand playlist ${p.name}` : `Minimize playlist ${p.name}`);
      const toggleIcon = el('span', 'toggle-icon', isCollapsed ? '▸' : '▾');
      const toggleLabel = el('span', 'toggle-label', isCollapsed ? 'Expand' : 'Minimize');
      toggleBtn.append(toggleIcon, toggleLabel);

      const toggleAction = () => {
        if (collapsedPlaylists.has(p.id)) {
          collapsedPlaylists.delete(p.id);
          card.classList.remove('collapsed');
          toggleIcon.textContent = '▾';
          toggleLabel.textContent = 'Minimize';
          toggleBtn.setAttribute('aria-label', `Minimize playlist ${p.name}`);
        } else {
          collapsedPlaylists.add(p.id);
          card.classList.add('collapsed');
          toggleIcon.textContent = '▸';
          toggleLabel.textContent = 'Expand';
          toggleBtn.setAttribute('aria-label', `Expand playlist ${p.name}`);
        }
        if (toggleAllBtn) {
          const allCollapsed = data.playlists.every(pl => collapsedPlaylists.has(pl.id));
          toggleAllBtn.textContent = allCollapsed ? 'Expand all' : 'Minimize all';
        }
      };

      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        toggleAction();
      };
      titleWrap.onclick = () => {
        toggleAction();
      };

      const addSongsBtn = el('button', 'outline', '＋ Add songs');
      addSongsBtn.onclick = (e) => {
        e.stopPropagation();
        const input = $('#playlist-search-input');
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      const deleteBtn = el('button', 'outline', 'Delete');
      deleteBtn.setAttribute('aria-label', `Delete playlist ${p.name}`);
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete playlist “${p.name}”?`)) return;
        deleteBtn.disabled = true;
        try {
          await api(`/playlists/${p.id}`, { method: 'DELETE' });
          collapsedPlaylists.delete(p.id);
          toast(`Deleted playlist “${p.name}”`);
          await loadPlaylists();
        } catch (err) { deleteBtn.disabled = false; toast(err.message); }
      };

      actions.append(toggleBtn, addSongsBtn, deleteBtn);
      header.append(titleWrap, actions);
      card.append(header);

      const body = el('div', 'playlist-body');
      if (!p.songs.length) {
        body.append(el('p', 'muted small playlist-empty-note', 'This playlist has no tracks yet. Search above to add songs.'));
      } else {
        p.songs.forEach((s, idx) => {
          body.append(songRow(s, idx, false, false, p.id));
        });
      }
      card.append(body);
      container.append(card);
    });
  } catch (err) {
    empty(container, 'Couldn’t load playlists.', err.message);
  }
}

async function loadMixes() {
  const container = $('#mixes-content');
  container.replaceChildren(el('div', 'loading', 'Loading saved mixes…'));
  try {
    const data = await api('/playlists?kind=mix');
    container.replaceChildren();
    if (!data.playlists.length) {
      empty(container, 'Keep a good moment.', 'Generate recommendations, then choose Save this mix.');
      return;
    }
    data.playlists.forEach(p => {
      const card = el('section', 'mix-card'), header = el('div', 'mix-header'), title = el('div');
      title.append(el('h3', '', p.name), el('p', '', `${p.songs.length} tracks · Saved ${formatDate(p.created_at)}`));
      const remove = el('button', 'outline', 'Delete');
      remove.setAttribute('aria-label', `Delete ${p.name}`);
      remove.onclick = async () => {
        if (!confirm(`Delete “${p.name}”?`)) return;
        remove.disabled = true;
        try {
          await api(`/playlists/${p.id}`, { method: 'DELETE' });
          await loadMixes();
          toast('Mix deleted.');
        } catch (err) { remove.disabled = false; toast(err.message); }
      };
      header.append(title, remove); card.append(header);
      p.songs.forEach((s, i) => card.append(songRow(s, i, false, true)));
      container.append(card);
    });
  } catch (err) {
    empty(container, 'Couldn’t load saved mixes.', err.message);
  }
}

const createPlaylistBtn = $('#create-playlist-btn');
if (createPlaylistBtn) {
  createPlaylistBtn.onclick = () => {
    $('#create-playlist-form').reset();
    openDialog('#create-playlist-dialog');
  };
}
const createPlaylistForm = $('#create-playlist-form');
if (createPlaylistForm) {
  createPlaylistForm.onsubmit = event => submitDialog(event, async form => {
    const name = form.elements.name.value.trim();
    const res = await api('/playlists', { method: 'POST', body: { name, kind: 'playlist' } });
    $('#create-playlist-dialog').close();
    toast(`Playlist “${res.name}” created!`);
    if (state.view === 'playlists') await loadPlaylists();
  });
}

const toggleAllBtn = $('#toggle-all-playlists-btn');
if (toggleAllBtn) {
  toggleAllBtn.onclick = () => {
    const cards = document.querySelectorAll('.playlist-card');
    if (!cards.length) return;
    const anyExpanded = Array.from(cards).some(c => !c.classList.contains('collapsed'));
    cards.forEach(card => {
      const pid = card.dataset.playlistId;
      const btn = card.querySelector('.playlist-toggle-btn');
      const icon = btn?.querySelector('.toggle-icon');
      const label = btn?.querySelector('.toggle-label');
      if (anyExpanded) {
        card.classList.add('collapsed');
        if (pid) { collapsedPlaylists.add(Number(pid)); collapsedPlaylists.add(String(pid)); }
        if (icon) icon.textContent = '▸';
        if (label) label.textContent = 'Expand';
      } else {
        card.classList.remove('collapsed');
        if (pid) { collapsedPlaylists.delete(Number(pid)); collapsedPlaylists.delete(String(pid)); }
        if (icon) icon.textContent = '▾';
        if (label) label.textContent = 'Minimize';
      }
    });
    toggleAllBtn.textContent = anyExpanded ? 'Expand all' : 'Minimize all';
  };
}

const playlistSearchForm = $('#playlist-song-search-form');
if (playlistSearchForm) {
  playlistSearchForm.onsubmit = async event => {
    event.preventDefault();
    const q = $('#playlist-search-input').value.trim();
    const provider = $('#playlist-search-provider').value;
    if (!q) return;
    const resultsContainer = $('#playlist-search-results');
    resultsContainer.replaceChildren(el('p', 'loading', `Searching ${provider === 'library' ? 'your library' : provider} for “${q}”…`));
    try {
      const data = await api(`/songs/search?q=${encodeURIComponent(q)}&provider=${encodeURIComponent(provider)}`);
      resultsContainer.replaceChildren();
      if (!data.songs.length) {
        empty(resultsContainer, 'No tracks found.', `Try another song title or artist, or change the search scope above.`);
        return;
      }
      const list = el('div', 'search-results-list');
      data.songs.forEach(song => {
        const card = el('div', 'search-track-card');
        const info = el('div', 'search-track-info');
        info.append(
          el('strong', '', song.title),
          el('small', '', `${song.artist}${song.genre && song.genre !== 'Unknown' ? ' · ' + song.genre : ''}`)
        );
        const actions = el('div', 'search-track-actions');
        actions.append(el('span', 'provider-badge', song.source || provider));
        const addBtn = el('button', 'primary', '＋ Add to playlist');
        addBtn.style.padding = '8px 13px';
        addBtn.style.fontSize = '11px';
        addBtn.onclick = () => openAddToPlaylist(song);
        actions.append(addBtn);
        card.append(info, actions);
        list.append(card);
      });
      resultsContainer.append(list);
    } catch (err) {
      resultsContainer.replaceChildren(el('p', 'error', err.message));
    }
  };
}

async function openAddToPlaylist(song) {
  pendingAddSong = song;
  $('#add-to-playlist-song-info').textContent = `${song.title} — ${song.artist}`;
  $('#quick-create-playlist-form').reset();
  const optionsContainer = $('#add-to-playlist-options');
  optionsContainer.replaceChildren(el('p', 'loading', 'Loading your playlists…'));
  openDialog('#add-to-playlist-dialog');

  try {
    const data = await api('/playlists?kind=playlist');
    optionsContainer.replaceChildren();

    if (!data.playlists.length) {
      optionsContainer.append(el('p', 'muted small', 'You have no playlists yet. Create your first playlist below to add this track!'));
      return;
    }

    const list = el('div', 'add-to-playlist-dialog-list');
    data.playlists.forEach(p => {
      const item = el('div', 'add-to-playlist-item');
      const hasSong = p.songs && p.songs.some(s => s.id === song.id || (song.mbid && s.mbid === song.mbid) || (song.discogsId && s.discogsId === song.discogsId));
      if (hasSong) item.classList.add('added');
      item.append(el('span', '', p.name));
      item.append(el('span', 'pill', hasSong ? '✓ In playlist' : `${p.songs.length} tracks`));
      item.onclick = async () => {
        try {
          await api(`/playlists/${p.id}/songs`, { method: 'POST', body: { songId: song.id, song } });
          $('#add-to-playlist-dialog').close();
          toast(`Added “${song.title}” to “${p.name}”!`);
          if (state.view === 'playlists') await loadPlaylists();
        } catch (err) { toast(err.message); }
      };
      list.append(item);
    });
    optionsContainer.append(list);
  } catch (err) {
    optionsContainer.replaceChildren(el('p', 'error', err.message));
  }
}

const quickCreateForm = $('#quick-create-playlist-form');
if (quickCreateForm) {
  quickCreateForm.onsubmit = event => submitDialog(event, async form => {
    if (!pendingAddSong) return;
    const name = form.elements.name.value.trim();
    const song = pendingAddSong;
    let songId = song.id;
    if (!songId) {
      const imp = await api('/songs/import', { method: 'POST', body: { song } });
      songId = imp.song.id;
    }
    const created = await api('/playlists', { method: 'POST', body: { name, songIds: [songId], kind: 'playlist' } });
    $('#add-to-playlist-dialog').close();
    toast(`Created “${created.name}” and added “${song.title}”!`);
    if (state.view === 'playlists') await loadPlaylists();
  });
}

let catalogRequest = 0, catalogOffset = null, tagSong = null, artistRequest = 0;
async function loadCatalog(append = false) {
  const request = ++catalogRequest, userId = state.user?.id;
  const q = $('#catalog-search').elements.query.value;
  $('#catalog-more').hidden = true;
  if (!append) $('#catalog-content').replaceChildren(el('p', 'loading', 'Loading tracks…'));
  try {
    const data = await api(`/catalog?q=${encodeURIComponent(q)}&offset=${append ? catalogOffset : 0}`);
    if (request !== catalogRequest || userId !== state.user?.id) return;
    if (!append) $('#catalog-content').replaceChildren();
    $('#catalog-count').textContent = `${data.total} tracks · Personal tags affect only your recommendations`;
    for (const song of data.songs) {
      const row = el('article', 'catalog-track'), info = el('div');
      info.append(el('strong','',song.title),el('p','muted',song.artist),el('small','',`${song.source} · ${song.tagSource} · ${Object.keys(song.moodScores).join(', ') || 'Mood unclassified'} / ${Object.keys(song.activityScores).join(', ') || 'Activity unclassified'}`));
      const actions = el('div', '', '');
      const addBtn = el('button', 'add-playlist-btn');
      addBtn.style.marginRight = '8px';
      const plusIcon = el('span', 'btn-icon', '+');
      const addText = el('span', 'btn-text', 'Playlist');
      addBtn.append(plusIcon, addText);
      addBtn.onclick = () => openAddToPlaylist(song);
      const button = el('button', 'outline', 'Edit tags');
      button.onclick = () => openTags(song);
      actions.append(addBtn, button);
      row.append(info, actions);
      $('#catalog-content').append(row);
    }
    if (!data.total) empty($('#catalog-content'),'No tracks found.','Try a different search or import an artist above.');
    catalogOffset = data.nextOffset; $('#catalog-more').hidden = catalogOffset === null;
  } catch (err) {
    if (request !== catalogRequest || userId !== state.user?.id) return;
    toast(err.message); if (!append) empty($('#catalog-content'),'Could not load tracks.', 'Use Find tracks to retry.');
    else $('#catalog-more').hidden = false;
  }
}
$('#catalog-search').onsubmit = event=>{event.preventDefault(); loadCatalog();};
$('#catalog-more').onclick = ()=>loadCatalog(true);

const seedBtn = $('#seed-catalog-button');
if (seedBtn) {
  seedBtn.onclick = async () => {
    seedBtn.disabled = true; seedBtn.textContent = 'Importing 200+ tracks…';
    try {
      const res = await api('/catalog/seed-dynamic', { method: 'POST', body: {} });
      toast(`Added ${res.total} tracks from MusicBrainz & Discogs!`);
      state.options = await api('/options');
      await loadCatalog();
      if (state.started) await generate();
    } catch (err) { toast(err.message); }
    finally { seedBtn.disabled = false; seedBtn.textContent = '✦ Add 200+ Tracks (MusicBrainz & Discogs)'; }
  };
}

$('#artist-search').onsubmit = async event=>{
  event.preventDefault(); const request = ++artistRequest, userId = state.user?.id;
  const button = event.target.querySelector('button'); button.disabled = true;
  const provider = event.target.elements.provider?.value || 'musicbrainz';
  const providerLabel = provider === 'discogs' ? 'Discogs' : 'MusicBrainz';
  $('#artist-results').replaceChildren(el('p','loading',`Searching ${providerLabel}…`));
  try {
    const { artists } = await api(`/artists?q=${encodeURIComponent(event.target.elements.query.value)}&provider=${provider}`);
    if (request !== artistRequest || userId !== state.user?.id) return;
    $('#artist-results').replaceChildren();
    if (!artists.length) $('#artist-results').append(el('p','muted',`No artists found on ${providerLabel}. Try another spelling.`));
    for (const artist of artists) {
      const row = el('div','catalog-track'), info = el('div');
      info.append(el('strong','',artist.name),el('p','muted',[artist.type,artist.country,artist.disambiguation,providerLabel].filter(Boolean).join(' · ')));
      const add = el('button','outline',`Add from ${providerLabel}`); let offset = 0;
      add.onclick = async ()=>{
        add.disabled = true; add.textContent = 'Importing…';
        try {
          const result = await api('/catalog/import',{method:'POST',body:{artistId:artist.id,offset,provider}});
          if (userId !== state.user?.id) return;
          offset = result.nextOffset; add.textContent = offset === null ? 'All pages imported' : 'Add next page';
          toast(`${result.added} tracks added. Imported tracks need context tags before mood and activity recommendations.`);
          state.options = await api('/options'); await loadCatalog();
        } catch(err) { add.textContent = 'Retry import'; toast(err.message); }
        finally { add.disabled = offset === null; }
      };
      row.append(info,add); $('#artist-results').append(row);
    }
  } catch(err) { if (request === artistRequest && userId === state.user?.id) $('#artist-results').replaceChildren(el('p','error',err.message)); }
  finally { button.disabled = false; }
};
function openTags(song) {
  tagSong = song; $('#tags-song').textContent = `${song.title} — ${song.artist}`; $('#tags-fields').replaceChildren();
  for (const [group,key] of [['moods','moodScores'],['activities','activityScores']]) {
    const field = el('fieldset'); field.append(el('legend','',group==='moods' ? 'Moods' : 'Activities')); const checks = el('div','checkboxes');
    for (const value of state.options[group]) {
      const label = el('label'), input = el('input'); input.type='checkbox'; input.name=group; input.value=value; input.checked=!!song[key][value]; label.append(input,document.createTextNode(value)); checks.append(label);
    }
    field.append(checks); $('#tags-fields').append(field);
  }
  openDialog('#tags-dialog');
}
$('#tags-form').onsubmit = event=>submitDialog(event,async form=>{
  const fields = new FormData(form);
  await api('/annotations',{method:'PUT',body:{songId:tagSong.id,moods:fields.getAll('moods'),activities:fields.getAll('activities')}});
  $('#tags-dialog').close(); toast('Personal tags saved.'); await loadCatalog(); if (state.started) await generate();
});
function formatDate(value) { return new Date(value.replace(' ', 'T') + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
try { await enter(await api('/me')); } catch (err) { if (err.message !== 'Please sign in to continue.') $('#auth-error').textContent = err.message; }
