const TRACK_STORAGE_KEY = "soundkeeper-tracks-v1";
const PLAYLIST_STORAGE_KEY = "soundkeeper-playlists-v1";
const DB_NAME = "soundkeeper-db";
const DB_VERSION = 2;
const TRACK_STORE = "tracks";
const PLAYLIST_STORE = "playlists";

const state = {
  library: [],
  playlists: [],
  sessionAudio: new Map(),
  currentTrackId: null,
  pendingAttachTrackId: null,
  selectedAudio: null,
  selectedCoverDataUrl: "",
  activeScreen: "home",
  activeLibraryView: { type: "all", id: null },
  libraryQuery: "",
  playbackQueue: [],
  currentQueueIndex: -1,
  storageApi: null,
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  cacheRefs();
  bindEvents();
  applyTelegramChrome();
  state.storageApi = await createStorageApi();

  const [tracks, playlists] = await Promise.all([
    state.storageApi.listTracks(),
    state.storageApi.listPlaylists(),
  ]);

  state.library = tracks;
  state.playlists = playlists;
  renderApp();
}

function cacheRefs() {
  refs.audioInput = document.getElementById("audioInput");
  refs.coverInput = document.getElementById("coverInput");
  refs.attachAudioInput = document.getElementById("attachAudioInput");
  refs.trackForm = document.getElementById("trackForm");
  refs.playlistForm = document.getElementById("playlistForm");
  refs.titleInput = document.getElementById("titleInput");
  refs.artistInput = document.getElementById("artistInput");
  refs.albumInput = document.getElementById("albumInput");
  refs.durationPreview = document.getElementById("durationPreview");
  refs.selectedAudioLabel = document.getElementById("selectedAudioLabel");
  refs.selectedCoverLabel = document.getElementById("selectedCoverLabel");
  refs.saveTrackButton = document.getElementById("saveTrackButton");
  refs.playlistNameInput = document.getElementById("playlistNameInput");
  refs.librarySearch = document.getElementById("librarySearch");
  refs.screenTitle = document.getElementById("screenTitle");
  refs.screenNodes = Array.from(document.querySelectorAll(".screen"));
  refs.navButtons = Array.from(document.querySelectorAll(".main-nav-button"));
  refs.mobileNavButtons = Array.from(document.querySelectorAll(".mobile-nav-button"));
  refs.albumList = document.getElementById("albumList");
  refs.playlistList = document.getElementById("playlistList");
  refs.libraryViewType = document.getElementById("libraryViewType");
  refs.libraryViewTitle = document.getElementById("libraryViewTitle");
  refs.libraryViewMeta = document.getElementById("libraryViewMeta");
  refs.libraryTrackList = document.getElementById("libraryTrackList");
  refs.playCollectionButton = document.getElementById("playCollectionButton");
  refs.shuffleCollectionButton = document.getElementById("shuffleCollectionButton");
  refs.miniPlayer = document.getElementById("miniPlayer");
  refs.heroCover = document.getElementById("heroCover");
  refs.heroPlaceholder = document.getElementById("heroPlaceholder");
  refs.heroTitle = document.getElementById("heroTitle");
  refs.heroArtist = document.getElementById("heroArtist");
  refs.playPauseButton = document.getElementById("playPauseButton");
  refs.prevTrackButton = document.getElementById("prevTrackButton");
  refs.nextTrackButton = document.getElementById("nextTrackButton");
  refs.progressInput = document.getElementById("progressInput");
  refs.currentTimeLabel = document.getElementById("currentTimeLabel");
  refs.durationLabel = document.getElementById("durationLabel");
  refs.audioElement = document.getElementById("audioElement");
}

function bindEvents() {
  document.getElementById("openAudioPicker").addEventListener("click", () => refs.audioInput.click());
  document.getElementById("openCoverPicker").addEventListener("click", () => refs.coverInput.click());
  document.getElementById("clearDraftButton").addEventListener("click", clearDraft);

  refs.audioInput.addEventListener("change", () => {
    void handleAudioPicked();
  });
  refs.coverInput.addEventListener("change", () => {
    void handleCoverPicked();
  });
  refs.attachAudioInput.addEventListener("change", () => {
    void handleAttachPicked();
  });

  refs.trackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveTrack();
  });
  refs.playlistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void createPlaylist();
  });
  refs.librarySearch.addEventListener("input", () => {
    state.libraryQuery = refs.librarySearch.value.trim().toLowerCase();
    renderLibraryContent();
  });

  refs.playCollectionButton.addEventListener("click", () => {
    void playActiveLibraryView(false);
  });
  refs.shuffleCollectionButton.addEventListener("click", () => {
    void playActiveLibraryView(true);
  });
  refs.playPauseButton.addEventListener("click", () => {
    void togglePlayPause();
  });
  refs.prevTrackButton.addEventListener("click", () => {
    void playPrevious();
  });
  refs.nextTrackButton.addEventListener("click", () => {
    void playNext();
  });
  refs.progressInput.addEventListener("input", handleSeek);

  refs.audioElement.addEventListener("timeupdate", syncProgressUi);
  refs.audioElement.addEventListener("loadedmetadata", syncProgressUi);
  refs.audioElement.addEventListener("play", renderMiniPlayer);
  refs.audioElement.addEventListener("pause", renderMiniPlayer);
  refs.audioElement.addEventListener("ended", () => {
    void playNext(true);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const screenButton = target.closest("[data-screen-target]");
    if (screenButton) {
      setActiveScreen(screenButton.dataset.screenTarget || "home");
      return;
    }

    const libraryButton = target.closest("[data-library-target]");
    if (libraryButton) {
      setActiveLibraryView(
        libraryButton.dataset.libraryTarget || "all",
        libraryButton.dataset.libraryId || null
      );
      return;
    }

    const playlistAction = target.closest("[data-playlist-action]");
    if (playlistAction) {
      void handlePlaylistAction(playlistAction);
      return;
    }

    const trackAction = target.closest("[data-track-action]");
    if (trackAction) {
      void handleTrackAction(trackAction);
    }
  });
}

function setActiveScreen(screen) {
  state.activeScreen = screen === "library" ? "library" : "home";
  renderNavigation();
  renderScreens();
  renderScreenTitle();
}

function setActiveLibraryView(type, id = null) {
  state.activeLibraryView = { type, id };
  renderLibrarySidebar();
  renderLibraryContent();
}

function renderApp() {
  ensureValidLibraryView();
  renderNavigation();
  renderScreens();
  renderScreenTitle();
  renderDraft();
  renderLibrarySidebar();
  renderLibraryContent();
  renderMiniPlayer();
}

function renderNavigation() {
  for (const button of refs.navButtons) {
    button.classList.toggle("is-active", button.dataset.screenTarget === state.activeScreen);
  }
  for (const button of refs.mobileNavButtons) {
    button.classList.toggle("is-active", button.dataset.screenTarget === state.activeScreen);
  }
}

function renderScreens() {
  for (const screen of refs.screenNodes) {
    screen.classList.toggle("is-active", screen.dataset.screen === state.activeScreen);
  }
}

function renderScreenTitle() {
  refs.screenTitle.textContent = state.activeScreen === "library" ? "Library" : "Home";
}

function renderDraft() {
  refs.selectedAudioLabel.textContent = state.selectedAudio
    ? `${state.selectedAudio.file.name} · ${formatDuration(state.selectedAudio.durationSeconds || 0)}`
    : "Файл не выбран";
  refs.selectedCoverLabel.textContent = state.selectedCoverDataUrl ? "Выбрана" : "Не выбрана";
  refs.saveTrackButton.disabled = !state.selectedAudio;
}

function renderLibrarySidebar() {
  const albums = getAlbums();
  const activeView = state.activeLibraryView;

  const allButton = document.querySelector('[data-library-target="all"]');
  if (allButton) {
    allButton.classList.toggle("is-active", activeView.type === "all");
  }

  refs.albumList.innerHTML = albums.length
    ? albums.map((album) => `
      <button
        class="library-source ${activeView.type === "album" && activeView.id === album.id ? "is-active" : ""}"
        type="button"
        data-library-target="album"
        data-library-id="${album.id}"
      >
        <span>${escapeHtml(album.title)}</span>
        <span class="library-source-meta">${formatTrackCount(album.trackIds.length)}</span>
      </button>
    `).join("")
    : renderSourceEmpty("Альбомов нет");

  refs.playlistList.innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => `
      <div class="playlist-row">
        <button
          class="library-source ${activeView.type === "playlist" && activeView.id === playlist.id ? "is-active" : ""}"
          type="button"
          data-library-target="playlist"
          data-library-id="${playlist.id}"
        >
          <span>${escapeHtml(playlist.name)}</span>
          <span class="library-source-meta">${formatTrackCount(playlist.trackIds.length)}</span>
        </button>
        <button class="track-action remove" type="button" data-playlist-action="delete" data-playlist-id="${playlist.id}">×</button>
      </div>
    `).join("")
    : renderSourceEmpty("Плейлистов нет");
}

function renderLibraryContent() {
  const view = getLibraryViewData();
  const tracks = getVisibleTracksForView(view);

  refs.libraryViewType.textContent = view.typeLabel;
  refs.libraryViewTitle.textContent = view.title;
  refs.libraryViewMeta.textContent = formatTrackCount(tracks.length);
  refs.playCollectionButton.disabled = tracks.length === 0;
  refs.shuffleCollectionButton.disabled = tracks.length === 0;

  refs.libraryTrackList.innerHTML = buildTrackListMarkup(tracks, view);
}

function renderMiniPlayer() {
  const track = getCurrentTrack();
  if (!track) {
    refs.miniPlayer.classList.add("is-hidden");
    refs.playPauseButton.disabled = true;
    refs.prevTrackButton.disabled = true;
    refs.nextTrackButton.disabled = true;
    refs.progressInput.value = "0";
    refs.currentTimeLabel.textContent = "0:00";
    refs.durationLabel.textContent = "0:00";
    return;
  }

  refs.miniPlayer.classList.remove("is-hidden");
  refs.heroTitle.textContent = track.title;
  refs.heroArtist.textContent = [track.artist, track.album].filter(Boolean).join(" · ");

  if (track.coverDataUrl) {
    refs.heroCover.src = track.coverDataUrl;
    refs.heroCover.style.display = "block";
    refs.heroPlaceholder.style.display = "none";
  } else {
    refs.heroCover.removeAttribute("src");
    refs.heroCover.style.display = "none";
    refs.heroPlaceholder.style.display = "grid";
  }

  const isPlaying = refs.audioElement.dataset.trackId === track.id && !refs.audioElement.paused;
  refs.playPauseButton.disabled = false;
  refs.playPauseButton.textContent = isPlaying ? "Пауза" : "Слушать";
  refs.prevTrackButton.disabled = state.currentQueueIndex <= 0;
  refs.nextTrackButton.disabled = state.currentQueueIndex < 0 || state.currentQueueIndex >= state.playbackQueue.length - 1;
  syncProgressUi();
}

async function handleAudioPicked() {
  const file = refs.audioInput.files?.[0];
  if (!file) {
    return;
  }

  if (state.selectedAudio?.objectUrl) {
    URL.revokeObjectURL(state.selectedAudio.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  const durationSeconds = await probeAudioDuration(objectUrl);

  state.selectedAudio = {
    file,
    objectUrl,
    durationSeconds,
  };

  if (!refs.titleInput.value.trim()) {
    refs.titleInput.value = stripExtension(file.name);
  }

  refs.durationPreview.value = durationSeconds ? formatDuration(durationSeconds) : "Не удалось определить";
  renderDraft();
}

async function handleCoverPicked() {
  const file = refs.coverInput.files?.[0];
  if (!file) {
    return;
  }

  state.selectedCoverDataUrl = await compressImageToDataUrl(file, 640);
  renderDraft();
}

async function handleAttachPicked() {
  const file = refs.attachAudioInput.files?.[0];
  const trackId = state.pendingAttachTrackId;
  refs.attachAudioInput.value = "";
  state.pendingAttachTrackId = null;

  if (!file || !trackId) {
    return;
  }

  const previousSession = state.sessionAudio.get(trackId);
  if (previousSession?.objectUrl) {
    URL.revokeObjectURL(previousSession.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  state.sessionAudio.set(trackId, {
    objectUrl,
    fileName: file.name,
    mimeType: file.type,
  });

  if (state.currentTrackId === trackId) {
    await playCurrentTrack();
  }
}

async function saveTrack() {
  if (!state.selectedAudio?.file) {
    return;
  }

  const track = {
    id: createId(),
    title: refs.titleInput.value.trim() || stripExtension(state.selectedAudio.file.name),
    artist: refs.artistInput.value.trim() || "Не указан",
    album: refs.albumInput.value.trim() || "",
    durationSeconds: state.selectedAudio.durationSeconds || 0,
    fileName: state.selectedAudio.file.name,
    mimeType: state.selectedAudio.file.type || "audio/mpeg",
    coverDataUrl: state.selectedCoverDataUrl,
    addedAt: new Date().toISOString(),
  };

  await state.storageApi.saveTrack(track);
  state.sessionAudio.set(track.id, {
    objectUrl: state.selectedAudio.objectUrl,
    fileName: state.selectedAudio.file.name,
    mimeType: state.selectedAudio.file.type,
  });

  state.library = await state.storageApi.listTracks();
  clearDraft({ keepTransferredAudio: true });
  ensureValidLibraryView();
  renderApp();
}

async function createPlaylist() {
  const name = refs.playlistNameInput.value.trim();
  if (!name) {
    refs.playlistNameInput.focus();
    return;
  }

  const playlist = {
    id: createId(),
    name,
    description: "",
    trackIds: [],
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await state.storageApi.savePlaylist(playlist);
  state.playlists = await state.storageApi.listPlaylists();
  refs.playlistForm.reset();
  renderLibrarySidebar();
  renderLibraryContent();
}

async function handlePlaylistAction(button) {
  const action = button.dataset.playlistAction;
  const playlistId = button.dataset.playlistId;
  if (!playlistId) {
    return;
  }

  if (action === "delete") {
    await removePlaylist(playlistId);
  }
}

async function handleTrackAction(button) {
  const action = button.dataset.trackAction;
  const trackId = button.dataset.trackId;
  if (!trackId) {
    return;
  }

  if (action === "play") {
    await playTrackFromCurrentView(trackId);
    return;
  }

  if (action === "delete") {
    await removeTrack(trackId);
    return;
  }

  if (action === "add-to-playlist") {
    const select = button.closest(".track-card")?.querySelector("[data-playlist-select]");
    const playlistId = select?.value || "";
    if (!playlistId) {
      return;
    }
    await addTrackToPlaylist(trackId, playlistId);
    return;
  }

  if (action === "remove-from-playlist") {
    const playlistId = button.dataset.playlistId;
    if (!playlistId) {
      return;
    }
    await removeTrackFromPlaylist(trackId, playlistId);
  }
}

async function removePlaylist(playlistId) {
  await state.storageApi.removePlaylist(playlistId);
  state.playlists = await state.storageApi.listPlaylists();
  ensureValidLibraryView();
  renderLibrarySidebar();
  renderLibraryContent();
}

async function addTrackToPlaylist(trackId, playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    return;
  }

  if (!playlist.trackIds.includes(trackId)) {
    playlist.trackIds.push(trackId);
    playlist.updatedAt = new Date().toISOString();
    await state.storageApi.savePlaylist(playlist);
  }

  state.playlists = await state.storageApi.listPlaylists();
  renderLibrarySidebar();
  renderLibraryContent();
}

async function removeTrackFromPlaylist(trackId, playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    return;
  }

  playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
  playlist.updatedAt = new Date().toISOString();
  await state.storageApi.savePlaylist(playlist);
  state.playlists = await state.storageApi.listPlaylists();
  renderLibrarySidebar();
  renderLibraryContent();
}

async function removeTrack(trackId) {
  await state.storageApi.removeTrack(trackId);

  const session = state.sessionAudio.get(trackId);
  if (session?.objectUrl) {
    URL.revokeObjectURL(session.objectUrl);
  }
  state.sessionAudio.delete(trackId);

  for (const playlist of state.playlists) {
    if (playlist.trackIds.includes(trackId)) {
      playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
      playlist.updatedAt = new Date().toISOString();
      await state.storageApi.savePlaylist(playlist);
    }
  }

  if (state.currentTrackId === trackId) {
    refs.audioElement.pause();
    refs.audioElement.removeAttribute("src");
    delete refs.audioElement.dataset.trackId;
    refs.audioElement.load();
    state.currentTrackId = null;
    state.playbackQueue = [];
    state.currentQueueIndex = -1;
  } else {
    state.playbackQueue = state.playbackQueue.filter((id) => id !== trackId);
    state.currentQueueIndex = state.playbackQueue.indexOf(state.currentTrackId);
  }

  state.library = await state.storageApi.listTracks();
  state.playlists = await state.storageApi.listPlaylists();
  ensureValidLibraryView();
  renderApp();
}

async function playActiveLibraryView(shuffle) {
  const tracks = getVisibleTracksForView(getLibraryViewData());
  if (!tracks.length) {
    return;
  }

  let queue = tracks.map((track) => track.id);
  if (shuffle) {
    queue = shuffleArray(queue);
  }

  setQueue(queue, 0);
  await playCurrentTrack();
}

async function playTrackFromCurrentView(trackId) {
  const tracks = getVisibleTracksForView(getLibraryViewData());
  const queue = tracks.map((track) => track.id);
  const startIndex = Math.max(0, queue.indexOf(trackId));
  setQueue(queue, startIndex);
  await playCurrentTrack();
}

function setQueue(trackIds, startIndex) {
  state.playbackQueue = trackIds.filter((trackId) => Boolean(getTrackById(trackId)));
  state.currentQueueIndex = Math.min(Math.max(startIndex, 0), Math.max(state.playbackQueue.length - 1, 0));
  state.currentTrackId = state.playbackQueue[state.currentQueueIndex] || null;
}

async function playCurrentTrack() {
  const track = getCurrentTrack();
  if (!track) {
    renderMiniPlayer();
    return;
  }

  const session = state.sessionAudio.get(track.id);
  if (!session) {
    state.pendingAttachTrackId = track.id;
    renderMiniPlayer();
    refs.attachAudioInput.click();
    return;
  }

  if (refs.audioElement.dataset.trackId !== track.id || refs.audioElement.src !== session.objectUrl) {
    refs.audioElement.src = session.objectUrl;
    refs.audioElement.dataset.trackId = track.id;
  }

  await refs.audioElement.play().catch(() => undefined);
  renderMiniPlayer();
  renderLibraryContent();
}

async function togglePlayPause() {
  const track = getCurrentTrack();
  if (!track) {
    return;
  }

  const session = state.sessionAudio.get(track.id);
  if (!session) {
    state.pendingAttachTrackId = track.id;
    refs.attachAudioInput.click();
    return;
  }

  if (refs.audioElement.dataset.trackId !== track.id) {
    await playCurrentTrack();
    return;
  }

  if (refs.audioElement.paused) {
    await refs.audioElement.play().catch(() => undefined);
  } else {
    refs.audioElement.pause();
  }

  renderMiniPlayer();
}

async function playPrevious() {
  if (state.currentQueueIndex <= 0) {
    return;
  }

  state.currentQueueIndex -= 1;
  state.currentTrackId = state.playbackQueue[state.currentQueueIndex] || null;
  await playCurrentTrack();
}

async function playNext(fromEnded = false) {
  if (state.currentQueueIndex < 0 || state.currentQueueIndex >= state.playbackQueue.length - 1) {
    if (fromEnded) {
      renderMiniPlayer();
    }
    return;
  }

  state.currentQueueIndex += 1;
  state.currentTrackId = state.playbackQueue[state.currentQueueIndex] || null;
  await playCurrentTrack();
}

function handleSeek() {
  if (!Number.isFinite(refs.audioElement.duration) || refs.audioElement.duration <= 0) {
    return;
  }

  const percentage = Number(refs.progressInput.value) / 100;
  refs.audioElement.currentTime = refs.audioElement.duration * percentage;
}

function syncProgressUi() {
  const hasDuration = Number.isFinite(refs.audioElement.duration) && refs.audioElement.duration > 0;
  const currentTime = refs.audioElement.currentTime || 0;
  const duration = hasDuration ? refs.audioElement.duration : getCurrentTrack()?.durationSeconds || 0;

  refs.currentTimeLabel.textContent = formatDuration(currentTime);
  refs.durationLabel.textContent = formatDuration(duration);
  refs.progressInput.value = hasDuration ? String((currentTime / refs.audioElement.duration) * 100) : "0";
}

function ensureValidLibraryView() {
  const view = state.activeLibraryView;
  if (view.type === "album" && !getAlbums().some((album) => album.id === view.id)) {
    state.activeLibraryView = { type: "all", id: null };
  }
  if (view.type === "playlist" && !state.playlists.some((playlist) => playlist.id === view.id)) {
    state.activeLibraryView = { type: "all", id: null };
  }
}

function getLibraryViewData() {
  if (state.activeLibraryView.type === "album") {
    const album = getAlbums().find((item) => item.id === state.activeLibraryView.id);
    if (album) {
      return {
        type: "album",
        typeLabel: "Альбом",
        title: album.title,
        trackIds: album.trackIds,
      };
    }
  }

  if (state.activeLibraryView.type === "playlist") {
    const playlist = state.playlists.find((item) => item.id === state.activeLibraryView.id);
    if (playlist) {
      return {
        type: "playlist",
        typeLabel: "Плейлист",
        title: playlist.name,
        trackIds: playlist.trackIds,
        playlistId: playlist.id,
      };
    }
  }

  return {
    type: "all",
    typeLabel: "Медиатека",
    title: "Все треки",
    trackIds: state.library.map((track) => track.id),
  };
}

function getVisibleTracksForView(view) {
  const baseTracks = view.trackIds
    .map(getTrackById)
    .filter(Boolean);

  if (!state.libraryQuery) {
    return baseTracks;
  }

  return baseTracks.filter((track) => {
    const haystack = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
    return haystack.includes(state.libraryQuery);
  });
}

function getAlbums() {
  const groups = new Map();

  for (const track of state.library) {
    const albumName = track.album.trim();
    if (!albumName) {
      continue;
    }

    const groupId = `album:${normalizeText(albumName)}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        title: albumName,
        trackIds: [],
      });
    }

    groups.get(groupId).trackIds.push(track.id);
  }

  return Array.from(groups.values()).sort((left, right) => left.title.localeCompare(right.title, "ru"));
}

function buildTrackListMarkup(tracks, view) {
  if (!tracks.length) {
    return renderEmptyStateMarkup("Пусто", "Здесь пока ничего нет.");
  }

  return tracks.map((track, index) => buildTrackCardMarkup(track, view, index)).join("");
}

function buildTrackCardMarkup(track, view, index) {
  const isActive = state.currentTrackId === track.id;
  const coverMarkup = track.coverDataUrl
    ? `<img class="track-cover" src="${track.coverDataUrl}" alt="Обложка ${escapeHtml(track.title)}">`
    : `<div class="track-cover-placeholder" aria-hidden="true">SK</div>`;

  const playlistControls = view.type !== "playlist" && state.playlists.length
    ? `
      <div class="playlist-inline">
        <select data-playlist-select aria-label="Выбор плейлиста">
          <option value="">Плейлист</option>
          ${state.playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("")}
        </select>
        <button class="track-action" type="button" data-track-action="add-to-playlist" data-track-id="${track.id}">+</button>
      </div>
    `
    : "";

  const trailingActions = view.type === "playlist"
    ? `
      <button class="track-action" type="button" data-track-action="play" data-track-id="${track.id}">Слушать</button>
      <button class="track-action remove" type="button" data-track-action="remove-from-playlist" data-track-id="${track.id}" data-playlist-id="${view.playlistId}">Убрать</button>
    `
    : `
      <button class="track-action" type="button" data-track-action="play" data-track-id="${track.id}">Слушать</button>
      <button class="track-action remove" type="button" data-track-action="delete" data-track-id="${track.id}">Удалить</button>
    `;

  return `
    <article class="track-card ${isActive ? "is-active" : ""}">
      <div class="track-order">${index + 1}</div>
      ${coverMarkup}
      <div class="track-meta">
        <div class="track-main-line">
          <h3 class="track-title">${escapeHtml(track.title)}</h3>
          <p class="track-subtitle">${escapeHtml(track.artist)}</p>
        </div>
        <p class="track-album">${escapeHtml(track.album || "Сингл")}</p>
        ${playlistControls}
      </div>
      <div class="track-side">
        <span class="track-length">${formatDuration(track.durationSeconds || 0)}</span>
        <div class="track-actions">
          ${trailingActions}
        </div>
      </div>
    </article>
  `;
}

function renderSourceEmpty(label) {
  return `<div class="collection-meta">${escapeHtml(label)}</div>`;
}

function renderEmptyStateMarkup(title, copy) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </div>
  `;
}

function getCurrentTrack() {
  if (!state.currentTrackId) {
    return null;
  }

  return getTrackById(state.currentTrackId);
}

function getTrackById(trackId) {
  return state.library.find((track) => track.id === trackId) || null;
}

function clearDraft(options = {}) {
  const { keepTransferredAudio = false } = options;

  if (!keepTransferredAudio && state.selectedAudio?.objectUrl) {
    URL.revokeObjectURL(state.selectedAudio.objectUrl);
  }

  state.selectedAudio = null;
  state.selectedCoverDataUrl = "";
  refs.trackForm.reset();
  refs.durationPreview.value = "Определится после выбора аудио";
  refs.audioInput.value = "";
  refs.coverInput.value = "";
  renderDraft();
}

function applyTelegramChrome() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return;
  }

  webApp.ready();
  webApp.expand();

  const theme = webApp.themeParams || {};
  if (theme.bg_color) {
    document.documentElement.style.setProperty("--bg", theme.bg_color);
  }
  if (theme.secondary_bg_color) {
    document.documentElement.style.setProperty("--panel", hexToRgba(theme.secondary_bg_color, 0.95));
  }
  if (theme.hint_color) {
    document.documentElement.style.setProperty("--muted", theme.hint_color);
  }
  if (theme.text_color) {
    document.documentElement.style.setProperty("--text", theme.text_color);
  }
  if (theme.button_color) {
    document.documentElement.style.setProperty("--primary", theme.button_color);
  }

  try {
    if (typeof webApp.setHeaderColor === "function" && theme.secondary_bg_color) {
      webApp.setHeaderColor(theme.secondary_bg_color);
    }
    if (typeof webApp.setBackgroundColor === "function" && theme.bg_color) {
      webApp.setBackgroundColor(theme.bg_color);
    }
  } catch (error) {
    console.warn("Telegram theming skipped", error);
  }
}

function createStorageApi() {
  if (typeof window.indexedDB === "undefined") {
    return Promise.resolve(createLocalStorageApi());
  }

  return openIndexedDb()
    .then((db) => createIndexedDbApi(db))
    .catch(() => createLocalStorageApi());
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        db.createObjectStore(TRACK_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
        db.createObjectStore(PLAYLIST_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createIndexedDbApi(db) {
  return {
    async listTracks() {
      const tracks = await runStoreRequest(db, TRACK_STORE, "readonly", (store) => store.getAll());
      return tracks.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
    },
    saveTrack(track) {
      return runStoreRequest(db, TRACK_STORE, "readwrite", (store) => store.put(track));
    },
    removeTrack(trackId) {
      return runStoreRequest(db, TRACK_STORE, "readwrite", (store) => store.delete(trackId));
    },
    async listPlaylists() {
      const playlists = await runStoreRequest(db, PLAYLIST_STORE, "readonly", (store) => store.getAll());
      return playlists.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    savePlaylist(playlist) {
      return runStoreRequest(db, PLAYLIST_STORE, "readwrite", (store) => store.put(playlist));
    },
    removePlaylist(playlistId) {
      return runStoreRequest(db, PLAYLIST_STORE, "readwrite", (store) => store.delete(playlistId));
    },
  };
}

function runStoreRequest(db, storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createLocalStorageApi() {
  return {
    async listTracks() {
      const payload = window.localStorage.getItem(TRACK_STORAGE_KEY);
      const tracks = payload ? JSON.parse(payload) : [];
      return tracks.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
    },
    async saveTrack(track) {
      const tracks = await this.listTracks();
      const nextTracks = tracks.filter((item) => item.id !== track.id);
      nextTracks.push(track);
      window.localStorage.setItem(TRACK_STORAGE_KEY, JSON.stringify(nextTracks));
    },
    async removeTrack(trackId) {
      const tracks = await this.listTracks();
      window.localStorage.setItem(
        TRACK_STORAGE_KEY,
        JSON.stringify(tracks.filter((track) => track.id !== trackId))
      );
    },
    async listPlaylists() {
      const payload = window.localStorage.getItem(PLAYLIST_STORAGE_KEY);
      const playlists = payload ? JSON.parse(payload) : [];
      return playlists.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async savePlaylist(playlist) {
      const playlists = await this.listPlaylists();
      const nextPlaylists = playlists.filter((item) => item.id !== playlist.id);
      nextPlaylists.push(playlist);
      window.localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(nextPlaylists));
    },
    async removePlaylist(playlistId) {
      const playlists = await this.listPlaylists();
      window.localStorage.setItem(
        PLAYLIST_STORAGE_KEY,
        JSON.stringify(playlists.filter((playlist) => playlist.id !== playlistId))
      );
    },
  };
}

function probeAudioDuration(objectUrl) {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = objectUrl;
    probe.onloadedmetadata = () => {
      resolve(Number.isFinite(probe.duration) ? probe.duration : 0);
      probe.src = "";
    };
    probe.onerror = () => resolve(0);
  });
}

function compressImageToDataUrl(file, maxSide) {
  return readFileAsDataUrl(file)
    .then(loadImage)
    .then((image) => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      context.fillStyle = "#0b1812";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTrackCount(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  const mod10 = safeCount % 10;
  const mod100 = safeCount % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${safeCount} трек`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${safeCount} трека`;
  }
  return `${safeCount} треков`;
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "-");
}

function shuffleArray(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
