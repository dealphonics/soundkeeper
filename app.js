const TRACK_STORAGE_KEY = "soundkeeper-tracks-v1";
const PLAYLIST_STORAGE_KEY = "soundkeeper-playlists-v1";
const DB_NAME = "soundkeeper-db";
const DB_VERSION = 2;
const TRACK_STORE = "tracks";
const PLAYLIST_STORE = "playlists";
const TELEGRAM_WEBAPP_SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js?61";

const state = {
  library: [],
  playlists: [],
  sessionAudio: new Map(),
  currentTrackId: null,
  pendingAttachTrackId: null,
  selectedAudio: null,
  selectedCoverDataUrl: "",
  activeScreen: "home",
  overlay: {
    open: false,
    type: "all",
    id: null,
  },
  trackMenu: {
    open: false,
    trackId: null,
    playlistId: null,
  },
  playbackQueue: [],
  currentQueueIndex: -1,
  storageApi: null,
  storageReadyPromise: null,
};

const refs = {};
let telegramScriptPromise = null;

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  cacheRefs();
  bindEvents();
  renderApp();
  void ensureTelegramBridge();
  void hydrateLibrary();
}

async function hydrateLibrary() {
  const storageApi = await ensureStorageReady();
  const [tracks, playlists] = await Promise.all([
    storageApi.listTracks(),
    storageApi.listPlaylists(),
  ]);

  state.library = tracks;
  state.playlists = playlists;
  renderApp();
}

function ensureStorageReady() {
  if (state.storageApi) {
    return Promise.resolve(state.storageApi);
  }

  if (!state.storageReadyPromise) {
    state.storageReadyPromise = createStorageApi().then((storageApi) => {
      state.storageApi = storageApi;
      return storageApi;
    });
  }

  return state.storageReadyPromise;
}

function ensureTelegramBridge() {
  if (window.Telegram?.WebApp) {
    applyTelegramChrome();
    return Promise.resolve();
  }

  if (!telegramScriptPromise) {
    telegramScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = TELEGRAM_WEBAPP_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        applyTelegramChrome();
        resolve();
      };
      script.onerror = () => resolve();
      document.head.append(script);
    });
  }

  return telegramScriptPromise;
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
  refs.screenTitle = document.getElementById("screenTitle");
  refs.screenNodes = Array.from(document.querySelectorAll(".screen"));
  refs.navButtons = Array.from(document.querySelectorAll(".main-nav-button"));
  refs.mobileNavButtons = Array.from(document.querySelectorAll(".mobile-nav-button"));
  refs.allTracksCount = document.getElementById("allTracksCount");
  refs.albumCountLabel = document.getElementById("albumCountLabel");
  refs.playlistCountLabel = document.getElementById("playlistCountLabel");
  refs.albumList = document.getElementById("albumList");
  refs.playlistList = document.getElementById("playlistList");
  refs.collectionSheet = document.getElementById("collectionSheet");
  refs.closeCollectionSheet = document.getElementById("closeCollectionSheet");
  refs.sheetBackButton = document.getElementById("sheetBackButton");
  refs.sheetType = document.getElementById("sheetType");
  refs.sheetTitle = document.getElementById("sheetTitle");
  refs.sheetMeta = document.getElementById("sheetMeta");
  refs.sheetCover = document.getElementById("sheetCover");
  refs.sheetCoverPlaceholder = document.getElementById("sheetCoverPlaceholder");
  refs.sheetPlayButton = document.getElementById("sheetPlayButton");
  refs.sheetShuffleButton = document.getElementById("sheetShuffleButton");
  refs.sheetTrackList = document.getElementById("sheetTrackList");
  refs.trackMenu = document.getElementById("trackMenu");
  refs.closeTrackMenu = document.getElementById("closeTrackMenu");
  refs.trackMenuTitle = document.getElementById("trackMenuTitle");
  refs.trackMenuSubtitle = document.getElementById("trackMenuSubtitle");
  refs.trackMenuPlaylistActions = document.getElementById("trackMenuPlaylistActions");
  refs.trackMenuRemoveButton = document.getElementById("trackMenuRemoveButton");
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

  refs.closeCollectionSheet.addEventListener("click", closeCollectionSheet);
  refs.sheetBackButton.addEventListener("click", closeCollectionSheet);
  refs.sheetPlayButton.addEventListener("click", () => {
    void playOpenCollection(false);
  });
  refs.sheetShuffleButton.addEventListener("click", () => {
    void playOpenCollection(true);
  });

  refs.closeTrackMenu.addEventListener("click", closeTrackMenu);

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

    const libraryOpenButton = target.closest("[data-library-open]");
    if (libraryOpenButton) {
      openCollectionSheet(
        libraryOpenButton.dataset.libraryOpen || "all",
        libraryOpenButton.dataset.libraryId || null
      );
      return;
    }

    const trackMainButton = target.closest("[data-track-main]");
    if (trackMainButton) {
      void playTrackFromOpenCollection(trackMainButton.dataset.trackMain || "");
      return;
    }

    const trackMenuButton = target.closest("[data-track-menu-open]");
    if (trackMenuButton) {
      openTrackMenu(
        trackMenuButton.dataset.trackMenuOpen || "",
        trackMenuButton.dataset.trackMenuPlaylistId || null
      );
      return;
    }

    const trackMenuAction = target.closest("[data-track-menu-action]");
    if (trackMenuAction) {
      void handleTrackMenuAction(trackMenuAction);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.trackMenu.open) {
      closeTrackMenu();
      return;
    }

    if (state.overlay.open) {
      closeCollectionSheet();
    }
  });
}

function setActiveScreen(screen) {
  state.activeScreen = screen === "library" ? "library" : "home";
  if (state.activeScreen !== "library") {
    closeTrackMenu();
    closeCollectionSheet();
  }

  renderApp();
}

function renderApp() {
  ensureValidOverlay();
  ensureValidTrackMenu();
  renderNavigation();
  renderScreens();
  renderScreenTitle();
  renderDraft();
  renderLibraryHub();
  renderCollectionSheet();
  renderTrackMenu();
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

function renderLibraryHub() {
  const albums = getAlbums();
  refs.allTracksCount.textContent = formatTrackCount(state.library.length);
  refs.albumCountLabel.textContent = String(albums.length);
  refs.playlistCountLabel.textContent = String(state.playlists.length);

  refs.albumList.innerHTML = albums.length
    ? albums.map((album) => buildLibraryEntryMarkup(album, "album")).join("")
    : renderLibraryEmptyMarkup("Альбомов пока нет");

  refs.playlistList.innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => buildLibraryEntryMarkup(getPlaylistCardData(playlist), "playlist")).join("")
    : renderLibraryEmptyMarkup("Плейлистов пока нет");
}

function renderCollectionSheet() {
  const view = getOverlayViewData();
  if (!view || state.activeScreen !== "library") {
    refs.collectionSheet.classList.add("is-hidden");
    refs.collectionSheet.setAttribute("aria-hidden", "true");
    return;
  }

  const tracks = getTracksForView(view);
  refs.collectionSheet.classList.remove("is-hidden");
  refs.collectionSheet.setAttribute("aria-hidden", "false");
  refs.sheetType.textContent = view.typeLabel;
  refs.sheetTitle.textContent = view.title;
  refs.sheetMeta.textContent = view.meta;
  refs.sheetPlayButton.disabled = tracks.length === 0;
  refs.sheetShuffleButton.disabled = tracks.length === 0;

  if (view.coverDataUrl) {
    refs.sheetCover.src = view.coverDataUrl;
    refs.sheetCover.style.display = "block";
    refs.sheetCoverPlaceholder.style.display = "none";
  } else {
    refs.sheetCover.removeAttribute("src");
    refs.sheetCover.style.display = "none";
    refs.sheetCoverPlaceholder.style.display = "grid";
  }

  refs.sheetTrackList.innerHTML = buildSheetTrackListMarkup(tracks, view);
}

function renderTrackMenu() {
  const track = state.trackMenu.open ? getTrackById(state.trackMenu.trackId) : null;
  if (!track) {
    refs.trackMenu.classList.add("is-hidden");
    refs.trackMenu.setAttribute("aria-hidden", "true");
    return;
  }

  refs.trackMenu.classList.remove("is-hidden");
  refs.trackMenu.setAttribute("aria-hidden", "false");
  refs.trackMenuTitle.textContent = track.title;
  refs.trackMenuSubtitle.textContent = [track.artist, track.album || "Сингл"]
    .filter(Boolean)
    .join(" · ");

  const playlistButtons = state.playlists
    .filter((playlist) => !playlist.trackIds.includes(track.id))
    .map((playlist) => `
      <button
        class="track-menu-item"
        type="button"
        data-track-menu-action="add-to-playlist"
        data-playlist-id="${playlist.id}"
      >
        В плейлист: ${escapeHtml(playlist.name)}
      </button>
    `);

  refs.trackMenuPlaylistActions.innerHTML = playlistButtons.length
    ? playlistButtons.join("")
    : `<p class="track-menu-note">Нет доступных плейлистов</p>`;

  refs.trackMenuRemoveButton.classList.toggle("is-hidden", !state.trackMenu.playlistId);
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
  refs.playPauseButton.textContent = isPlaying ? "||" : ">";
  refs.prevTrackButton.disabled = state.currentQueueIndex <= 0;
  refs.nextTrackButton.disabled = state.currentQueueIndex < 0 || state.currentQueueIndex >= state.playbackQueue.length - 1;
  syncProgressUi();
}

function buildLibraryEntryMarkup(item, type) {
  const artMarkup = item.coverDataUrl
    ? `
      <span class="library-entry-art">
        <img src="${item.coverDataUrl}" alt="Обложка ${escapeHtml(item.title)}">
      </span>
    `
    : `
      <span class="library-entry-art library-entry-placeholder">${type === "album" ? "AL" : "PL"}</span>
    `;

  return `
    <button class="library-entry" type="button" data-library-open="${type}" data-library-id="${item.id}">
      ${artMarkup}
      <span class="library-entry-copy">
        <span class="library-entry-title">${escapeHtml(item.title)}</span>
        <span class="library-entry-meta">${escapeHtml(item.meta)}</span>
      </span>
      <span class="library-entry-arrow">></span>
    </button>
  `;
}

function buildSheetTrackListMarkup(tracks, view) {
  if (!tracks.length) {
    return renderEmptyStateMarkup("Пусто", "Здесь пока ничего нет.");
  }

  return tracks.map((track, index) => buildSheetTrackRowMarkup(track, index, view)).join("");
}

function buildSheetTrackRowMarkup(track, index, view) {
  const isActive = state.currentTrackId === track.id;
  const coverMarkup = track.coverDataUrl
    ? `
      <span class="sheet-track-cover">
        <img src="${track.coverDataUrl}" alt="Обложка ${escapeHtml(track.title)}">
      </span>
    `
    : `<span class="sheet-track-placeholder">SK</span>`;

  const playlistId = view.type === "playlist" ? view.playlistId : "";

  return `
    <article class="sheet-track-row ${isActive ? "is-active" : ""}">
      <button class="sheet-track-main" type="button" data-track-main="${track.id}">
        <span class="sheet-track-index">${index + 1}</span>
        ${coverMarkup}
        <span class="sheet-track-copy">
          <span class="sheet-track-title">${escapeHtml(track.title)}</span>
          <span class="sheet-track-subtitle">${escapeHtml(track.artist)}</span>
          <span class="sheet-track-album">${escapeHtml(track.album || "Сингл")}</span>
        </span>
        <span class="sheet-track-duration">${formatDuration(track.durationSeconds || 0)}</span>
      </button>

      <button
        class="track-more"
        type="button"
        aria-label="Действия"
        data-track-menu-open="${track.id}"
        data-track-menu-playlist-id="${playlistId}"
      >
        ...
      </button>
    </article>
  `;
}

function renderLibraryEmptyMarkup(copy) {
  return `<p class="library-empty">${escapeHtml(copy)}</p>`;
}

function renderEmptyStateMarkup(title, copy) {
  return `
    <div class="library-empty">
      <strong>${escapeHtml(title)}</strong><br>
      ${escapeHtml(copy)}
    </div>
  `;
}

function openCollectionSheet(type, id = null) {
  state.overlay = {
    open: true,
    type,
    id,
  };
  closeTrackMenu();
  renderCollectionSheet();
}

function closeCollectionSheet() {
  state.overlay.open = false;
  closeTrackMenu();
  renderCollectionSheet();
}

function openTrackMenu(trackId, playlistId = null) {
  if (!trackId) {
    return;
  }

  state.trackMenu = {
    open: true,
    trackId,
    playlistId: playlistId || null,
  };
  renderTrackMenu();
}

function closeTrackMenu() {
  state.trackMenu = {
    open: false,
    trackId: null,
    playlistId: null,
  };
  renderTrackMenu();
}

async function handleTrackMenuAction(button) {
  const action = button.dataset.trackMenuAction;
  const trackId = state.trackMenu.trackId;
  if (!trackId) {
    return;
  }

  if (action === "queue") {
    addTrackToQueue(trackId);
    closeTrackMenu();
    return;
  }

  if (action === "add-to-playlist") {
    const playlistId = button.dataset.playlistId || "";
    if (!playlistId) {
      return;
    }

    await addTrackToPlaylist(trackId, playlistId);
    closeTrackMenu();
    return;
  }

  if (action === "remove-from-playlist" && state.trackMenu.playlistId) {
    await removeTrackFromPlaylist(trackId, state.trackMenu.playlistId);
    closeTrackMenu();
  }
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

  state.sessionAudio.set(trackId, {
    objectUrl: URL.createObjectURL(file),
    fileName: file.name,
    mimeType: file.type,
  });

  if (state.currentTrackId === trackId) {
    await playCurrentTrack();
  }
}

async function saveTrack() {
  await ensureStorageReady();

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
  renderApp();
}

async function createPlaylist() {
  await ensureStorageReady();

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
  renderApp();
}

async function addTrackToPlaylist(trackId, playlistId) {
  await ensureStorageReady();
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
  renderApp();
}

async function removeTrackFromPlaylist(trackId, playlistId) {
  await ensureStorageReady();
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    return;
  }

  playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
  playlist.updatedAt = new Date().toISOString();
  await state.storageApi.savePlaylist(playlist);
  state.playlists = await state.storageApi.listPlaylists();
  renderApp();
}

function addTrackToQueue(trackId) {
  if (!getTrackById(trackId)) {
    return;
  }

  if (!state.currentTrackId) {
    state.currentTrackId = trackId;
    state.playbackQueue = [trackId];
    state.currentQueueIndex = 0;
    renderMiniPlayer();
    return;
  }

  if (!state.playbackQueue.length || !state.playbackQueue.includes(state.currentTrackId)) {
    state.playbackQueue = [state.currentTrackId];
    state.currentQueueIndex = 0;
  }

  const tail = state.playbackQueue.slice(state.currentQueueIndex + 1);
  if (!tail.includes(trackId)) {
    state.playbackQueue.splice(state.currentQueueIndex + 1, 0, trackId);
  }

  renderMiniPlayer();
}

async function playOpenCollection(shuffle) {
  const view = getOverlayViewData();
  if (!view) {
    return;
  }

  const queue = getTracksForView(view).map((track) => track.id);
  if (!queue.length) {
    return;
  }

  setQueue(shuffle ? shuffleArray(queue) : queue, 0);
  await playCurrentTrack();
}

async function playTrackFromOpenCollection(trackId) {
  if (!trackId) {
    return;
  }

  const view = getOverlayViewData();
  const queue = view ? getTracksForView(view).map((track) => track.id) : [trackId];
  const startIndex = Math.max(0, queue.indexOf(trackId));
  setQueue(queue, startIndex);
  await playCurrentTrack();
}

function setQueue(trackIds, startIndex) {
  const validTrackIds = trackIds.filter((trackId) => Boolean(getTrackById(trackId)));
  state.playbackQueue = validTrackIds;

  if (!validTrackIds.length) {
    state.currentQueueIndex = -1;
    state.currentTrackId = null;
    return;
  }

  state.currentQueueIndex = Math.min(Math.max(startIndex, 0), validTrackIds.length - 1);
  state.currentTrackId = validTrackIds[state.currentQueueIndex];
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
  renderCollectionSheet();
  renderMiniPlayer();
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

  renderCollectionSheet();
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

function ensureValidOverlay() {
  if (!state.overlay.open) {
    return;
  }

  if (state.overlay.type === "album" && !getAlbums().some((album) => album.id === state.overlay.id)) {
    state.overlay.open = false;
    return;
  }

  if (state.overlay.type === "playlist" && !state.playlists.some((playlist) => playlist.id === state.overlay.id)) {
    state.overlay.open = false;
  }
}

function ensureValidTrackMenu() {
  if (!state.trackMenu.open) {
    return;
  }

  if (!getTrackById(state.trackMenu.trackId)) {
    closeTrackMenu();
    return;
  }

  if (state.trackMenu.playlistId && !state.playlists.some((playlist) => playlist.id === state.trackMenu.playlistId)) {
    state.trackMenu.playlistId = null;
  }
}

function getOverlayViewData() {
  if (!state.overlay.open) {
    return null;
  }

  if (state.overlay.type === "album") {
    const album = getAlbums().find((item) => item.id === state.overlay.id);
    if (!album) {
      return null;
    }

    return {
      type: "album",
      typeLabel: "Альбом",
      title: album.title,
      meta: [album.artistLabel, formatTrackCount(album.trackIds.length)].filter(Boolean).join(" · "),
      trackIds: album.trackIds,
      coverDataUrl: album.coverDataUrl,
      playlistId: null,
    };
  }

  if (state.overlay.type === "playlist") {
    const playlist = state.playlists.find((item) => item.id === state.overlay.id);
    if (!playlist) {
      return null;
    }

    const tracks = playlist.trackIds.map(getTrackById).filter(Boolean);
    return {
      type: "playlist",
      typeLabel: "Плейлист",
      title: playlist.name,
      meta: formatTrackCount(tracks.length),
      trackIds: playlist.trackIds,
      coverDataUrl: getCollectionCoverDataUrl(tracks),
      playlistId: playlist.id,
    };
  }

  const allTracks = state.library.slice();
  return {
    type: "all",
    typeLabel: "Медиатека",
    title: "Все треки",
    meta: formatTrackCount(allTracks.length),
    trackIds: allTracks.map((track) => track.id),
    coverDataUrl: getCollectionCoverDataUrl(allTracks),
    playlistId: null,
  };
}

function getTracksForView(view) {
  return view.trackIds.map(getTrackById).filter(Boolean);
}

function getPlaylistCardData(playlist) {
  const tracks = playlist.trackIds.map(getTrackById).filter(Boolean);
  return {
    id: playlist.id,
    title: playlist.name,
    meta: formatTrackCount(tracks.length),
    coverDataUrl: getCollectionCoverDataUrl(tracks),
  };
}

function getAlbums() {
  const groups = new Map();

  for (const track of state.library) {
    const albumTitle = track.album.trim();
    if (!albumTitle) {
      continue;
    }

    const albumId = `album:${normalizeText(albumTitle)}`;
    if (!groups.has(albumId)) {
      groups.set(albumId, {
        id: albumId,
        title: albumTitle,
        trackIds: [],
        coverDataUrl: track.coverDataUrl || "",
        artistNames: new Set(),
      });
    }

    const album = groups.get(albumId);
    album.trackIds.push(track.id);
    if (!album.coverDataUrl && track.coverDataUrl) {
      album.coverDataUrl = track.coverDataUrl;
    }
    if (track.artist) {
      album.artistNames.add(track.artist);
    }
  }

  return Array.from(groups.values())
    .map((album) => ({
      id: album.id,
      title: album.title,
      trackIds: album.trackIds,
      coverDataUrl: album.coverDataUrl,
      artistLabel: Array.from(album.artistNames).join(", "),
      meta: [Array.from(album.artistNames).join(", "), formatTrackCount(album.trackIds.length)]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "ru"));
}

function getCollectionCoverDataUrl(tracks) {
  return tracks.find((track) => track.coverDataUrl)?.coverDataUrl || "";
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
  if (theme.text_color) {
    document.documentElement.style.setProperty("--text", theme.text_color);
  }
  if (theme.hint_color) {
    document.documentElement.style.setProperty("--muted", theme.hint_color);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
