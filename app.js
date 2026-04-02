const TRACK_STORAGE_KEY = "soundkeeper-tracks-v1";
const PLAYLIST_STORAGE_KEY = "soundkeeper-playlists-v1";
const ARTIST_PROFILE_STORAGE_KEY = "soundkeeper-artists-v1";
const PLAY_HISTORY_STORAGE_KEY = "soundkeeper-play-history-v1";
const DB_NAME = "soundkeeper-db";
const DB_VERSION = 4;
const TRACK_STORE = "tracks";
const PLAYLIST_STORE = "playlists";
const ARTIST_PROFILE_STORE = "artist-profiles";
const PLAY_HISTORY_STORE = "play-history";
const TELEGRAM_WEBAPP_SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js?61";
const SPLASH_MIN_DURATION_MS = 760;
const SPLASH_MAX_DURATION_MS = 2200;

const state = {
  library: [],
  playlists: [],
  artistProfiles: [],
  playHistory: [],
  sessionAudio: new Map(),
  currentTrackId: null,
  pendingAttachTrackId: null,
  pendingCollectionCover: null,
  selectedAudio: null,
  selectedCoverDataUrl: "",
  activeScreen: "home",
  statsRange: "week",
  overlay: {
    open: false,
    type: "all",
    id: null,
  },
  trackMenu: {
    open: false,
    trackId: null,
    collectionType: "all",
    collectionId: null,
  },
  playbackQueue: [],
  currentQueueIndex: -1,
  drag: {
    active: false,
    pointerId: null,
    rowEl: null,
    ghostEl: null,
    timerId: null,
    startX: 0,
    startY: 0,
    grabOffsetY: 0,
    suppressClickUntil: 0,
  },
  storageApi: null,
  storageReadyPromise: null,
};

const refs = {};
let telegramScriptPromise = null;
let telegramReadySent = false;
let splashDismissPromise = null;
const splashStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

window.addEventListener("load", () => {
  markTelegramReady();
});

window.addEventListener("pageshow", () => {
  markTelegramReady();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    markTelegramReady();
  }
});

async function init() {
  markTelegramReady();
  cacheRefs();
  bindEvents();
  applyTelegramChrome();
  renderApp();
  const bootTasks = [
    ensureTelegramBridge(),
    hydrateLibrary(),
  ];

  void Promise.race([
    Promise.allSettled(bootTasks),
    delay(SPLASH_MAX_DURATION_MS),
  ]).finally(() => {
    void dismissSplash();
  });
}

async function hydrateLibrary() {
  const storageApi = await ensureStorageReady();
  const [tracks, playlists, artistProfiles, playHistory] = await Promise.all([
    storageApi.listTracks(),
    storageApi.listPlaylists(),
    storageApi.listArtistProfiles(),
    storageApi.listPlayHistory(),
  ]);

  state.library = tracks;
  state.playlists = playlists;
  state.artistProfiles = artistProfiles;
  state.playHistory = playHistory;
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
    markTelegramReady();
    applyTelegramChrome();
    return Promise.resolve();
  }

  if (!telegramScriptPromise) {
    telegramScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = TELEGRAM_WEBAPP_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        markTelegramReady();
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
  refs.appSplash = document.getElementById("appSplash");
  refs.audioInput = document.getElementById("audioInput");
  refs.coverInput = document.getElementById("coverInput");
  refs.playlistCoverInput = document.getElementById("playlistCoverInput");
  refs.attachAudioInput = document.getElementById("attachAudioInput");
  refs.bulkAttachAudioInput = document.getElementById("bulkAttachAudioInput");
  refs.trackForm = document.getElementById("trackForm");
  refs.playlistForm = document.getElementById("playlistForm");
  refs.openBulkAttachPicker = document.getElementById("openBulkAttachPicker");
  refs.bulkAttachStatus = document.getElementById("bulkAttachStatus");
  refs.statsTracksList = document.getElementById("statsTracksList");
  refs.statsArtistsList = document.getElementById("statsArtistsList");
  refs.statsRangeButtons = Array.from(document.querySelectorAll("[data-stats-range]"));
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
  refs.artistCountLabel = document.getElementById("artistCountLabel");
  refs.albumList = document.getElementById("albumList");
  refs.playlistList = document.getElementById("playlistList");
  refs.artistList = document.getElementById("artistList");
  refs.collectionSheet = document.getElementById("collectionSheet");
  refs.closeCollectionSheet = document.getElementById("closeCollectionSheet");
  refs.sheetBackButton = document.getElementById("sheetBackButton");
  refs.sheetType = document.getElementById("sheetType");
  refs.sheetTitle = document.getElementById("sheetTitle");
  refs.sheetMeta = document.getElementById("sheetMeta");
  refs.sheetCoverWrap = document.getElementById("sheetCoverWrap");
  refs.sheetCover = document.getElementById("sheetCover");
  refs.sheetCoverPlaceholder = document.getElementById("sheetCoverPlaceholder");
  refs.sheetPlayButton = document.getElementById("sheetPlayButton");
  refs.sheetShuffleButton = document.getElementById("sheetShuffleButton");
  refs.sheetPlaylistCoverButton = document.getElementById("sheetPlaylistCoverButton");
  refs.sheetTrackList = document.getElementById("sheetTrackList");
  refs.trackMenu = document.getElementById("trackMenu");
  refs.closeTrackMenu = document.getElementById("closeTrackMenu");
  refs.trackMenuTitle = document.getElementById("trackMenuTitle");
  refs.trackMenuSubtitle = document.getElementById("trackMenuSubtitle");
  refs.trackMenuPlaylistActions = document.getElementById("trackMenuPlaylistActions");
  refs.trackMenuRemoveButton = document.getElementById("trackMenuRemoveButton");
  refs.trackMenuDeleteButton = document.getElementById("trackMenuDeleteButton");
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

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms || 0));
  });
}

async function dismissSplash() {
  if (splashDismissPromise) {
    return splashDismissPromise;
  }

  splashDismissPromise = (async () => {
    if (!refs.appSplash) {
      document.body.classList.remove("is-splash-visible");
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - splashStartedAt;
    if (elapsed < SPLASH_MIN_DURATION_MS) {
      await delay(SPLASH_MIN_DURATION_MS - elapsed);
    }

    refs.appSplash.classList.add("is-hidden");
    document.body.classList.remove("is-splash-visible");
    await delay(380);

    if (refs.appSplash?.isConnected) {
      refs.appSplash.remove();
    }
    refs.appSplash = null;
  })();

  return splashDismissPromise;
}

function bindEvents() {
  document.getElementById("openAudioPicker").addEventListener("click", () => refs.audioInput.click());
  document.getElementById("openCoverPicker").addEventListener("click", () => refs.coverInput.click());
  document.getElementById("clearDraftButton").addEventListener("click", clearDraft);
  refs.openBulkAttachPicker.addEventListener("click", () => refs.bulkAttachAudioInput.click());

  refs.audioInput.addEventListener("change", () => {
    void handleAudioPicked();
  });
  refs.coverInput.addEventListener("change", () => {
    void handleCoverPicked();
  });
  refs.playlistCoverInput.addEventListener("change", () => {
    void handlePlaylistCoverPicked();
  });
  refs.attachAudioInput.addEventListener("change", () => {
    void handleAttachPicked();
  });
  refs.bulkAttachAudioInput.addEventListener("change", () => {
    void handleBulkAttachPicked();
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
  refs.sheetPlaylistCoverButton.addEventListener("click", () => {
    const view = getOverlayViewData();
    if (!view || !view.coverEditableType || !view.coverEditableId) {
      return;
    }

    state.pendingCollectionCover = {
      type: view.coverEditableType,
      id: view.coverEditableId,
    };
    refs.playlistCoverInput.click();
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
  refs.sheetTrackList.addEventListener("pointerdown", handleTrackRowPointerDown);
  document.addEventListener("pointermove", handleTrackRowPointerMove, { passive: false });
  document.addEventListener("pointerup", handleTrackRowPointerUp);
  document.addEventListener("pointercancel", handleTrackRowPointerUp);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (state.drag.suppressClickUntil > Date.now() && target.closest(".sheet-track-row")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const screenButton = target.closest("[data-screen-target]");
    if (screenButton) {
      setActiveScreen(screenButton.dataset.screenTarget || "home");
      return;
    }

    const statsRangeButton = target.closest("[data-stats-range]");
    if (statsRangeButton) {
      setStatsRange(statsRangeButton.dataset.statsRange || "week");
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
        trackMenuButton.dataset.trackMenuCollectionType || "all",
        trackMenuButton.dataset.trackMenuCollectionId || null
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
  state.activeScreen = ["home", "library", "statistics"].includes(screen) ? screen : "home";
  if (state.activeScreen !== "library") {
    closeTrackMenu();
    closeCollectionSheet();
  }

  renderApp();
}

function setStatsRange(range) {
  state.statsRange = range === "all" ? "all" : "week";
  renderStatistics();
}

function renderApp() {
  ensureValidOverlay();
  ensureValidTrackMenu();
  renderNavigation();
  renderScreens();
  renderScreenTitle();
  renderDraft();
  renderLibraryHub();
  renderStatistics();
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
  const titles = {
    home: "Home",
    library: "Library",
    statistics: "Statistics",
  };
  refs.screenTitle.textContent = titles[state.activeScreen] || "Home";
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
  const artists = getArtists();
  const connectedTrackCount = state.library.filter((track) => state.sessionAudio.has(track.id)).length;
  refs.allTracksCount.textContent = formatTrackCount(state.library.length);
  refs.albumCountLabel.textContent = String(albums.length);
  refs.playlistCountLabel.textContent = String(state.playlists.length);
  refs.artistCountLabel.textContent = String(artists.length);
  refs.openBulkAttachPicker.disabled = state.library.length === 0;
  refs.bulkAttachStatus.textContent = state.library.length
    ? `${connectedTrackCount} из ${state.library.length} подключено`
    : "";

  refs.albumList.innerHTML = albums.length
    ? albums.map((album) => buildLibraryEntryMarkup(album, "album")).join("")
    : renderLibraryEmptyMarkup("Альбомов пока нет");

  refs.playlistList.innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => buildLibraryEntryMarkup(getPlaylistCardData(playlist), "playlist")).join("")
    : renderLibraryEmptyMarkup("Плейлистов пока нет");

  refs.artistList.innerHTML = artists.length
    ? artists.map((artist) => buildLibraryEntryMarkup(artist, "artist")).join("")
    : renderLibraryEmptyMarkup("Исполнителей пока нет");
}

function renderStatistics() {
  for (const button of refs.statsRangeButtons) {
    button.classList.toggle("is-active", button.dataset.statsRange === state.statsRange);
  }

  const topTracks = getTopTracksByRange(state.statsRange);
  const topArtists = getTopArtistsStatsByRange(state.statsRange);

  refs.statsTracksList.innerHTML = topTracks.length
    ? topTracks.map((item, index) => buildStatsTrackRowMarkup(item, index)).join("")
    : renderLibraryEmptyMarkup("Прослушиваний пока нет");

  refs.statsArtistsList.innerHTML = topArtists.length
    ? topArtists.map((item, index) => buildStatsArtistRowMarkup(item, index)).join("")
    : renderLibraryEmptyMarkup("Исполнителей пока нет");
}

function buildStatsTrackRowMarkup(item, index) {
  const coverMarkup = item.coverDataUrl
    ? `
      <span class="stats-cover">
        <img src="${item.coverDataUrl}" alt="Обложка ${escapeHtml(item.title)}">
      </span>
    `
    : `<span class="stats-cover stats-cover-placeholder">♪</span>`;

  return `
    <article class="stats-row">
      <span class="stats-rank">${index + 1}</span>
      ${coverMarkup}
      <span class="stats-copy">
        <span class="stats-title">${escapeHtml(item.title)}</span>
        <span class="stats-subtitle">${escapeHtml(item.artist)}</span>
      </span>
      <span class="stats-value">${item.playCount}</span>
    </article>
  `;
}

function buildStatsArtistRowMarkup(item, index) {
  const coverMarkup = item.coverDataUrl
    ? `
      <span class="stats-cover">
        <img src="${item.coverDataUrl}" alt="Обложка ${escapeHtml(item.artist)}">
      </span>
    `
    : `<span class="stats-cover stats-cover-placeholder">${escapeHtml(getArtistInitials(item.artist))}</span>`;

  return `
    <article class="stats-row">
      <span class="stats-rank">${index + 1}</span>
      ${coverMarkup}
      <span class="stats-copy">
        <span class="stats-title">${escapeHtml(item.artist)}</span>
      </span>
    </article>
  `;
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
  refs.sheetCoverWrap.classList.toggle("is-hidden", !view.showCover);
  refs.sheetPlaylistCoverButton.classList.toggle("is-hidden", !view.coverEditableId);

  if (view.showCover && view.coverDataUrl) {
    refs.sheetCover.src = view.coverDataUrl;
    refs.sheetCover.style.display = "block";
    refs.sheetCoverPlaceholder.style.display = "none";
  } else if (view.showCover) {
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

  refs.trackMenuDeleteButton.textContent = "Удалить из медиатеки";

  if (state.trackMenu.collectionType === "playlist" && state.trackMenu.collectionId) {
    refs.trackMenuRemoveButton.textContent = "Убрать из плейлиста";
    refs.trackMenuRemoveButton.dataset.trackMenuAction = "remove-from-playlist";
    refs.trackMenuRemoveButton.classList.remove("is-hidden");
    return;
  }

  if (state.trackMenu.collectionType === "album" && state.trackMenu.collectionId) {
    refs.trackMenuRemoveButton.textContent = "Убрать из альбома";
    refs.trackMenuRemoveButton.dataset.trackMenuAction = "remove-from-album";
    refs.trackMenuRemoveButton.classList.remove("is-hidden");
    return;
  }

  refs.trackMenuRemoveButton.classList.add("is-hidden");
  refs.trackMenuRemoveButton.dataset.trackMenuAction = "remove-from-playlist";
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
  const placeholderLabel = type === "album" ? "AL" : type === "artist" ? "AR" : "PL";
  const artMarkup = item.coverDataUrl
    ? `
      <span class="library-entry-art">
        <img src="${item.coverDataUrl}" alt="Обложка ${escapeHtml(item.title)}">
      </span>
    `
    : `
      <span class="library-entry-art library-entry-placeholder">${placeholderLabel}</span>
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

  const collectionId = view.type === "playlist"
    ? view.playlistId
    : view.type === "album"
      ? view.albumId
      : "";

  return `
    <article class="sheet-track-row ${isActive ? "is-active" : ""}" data-track-id="${track.id}">
      <div class="sheet-track-main" role="button" tabindex="0" data-track-main="${track.id}">
        <span class="sheet-track-index">${index + 1}</span>
        ${coverMarkup}
        <span class="sheet-track-copy">
          <span class="sheet-track-title">${escapeHtml(track.title)}</span>
          <span class="sheet-track-subtitle">${escapeHtml(track.artist)}</span>
          <span class="sheet-track-album">${escapeHtml(track.album || "Сингл")}</span>
        </span>
      </div>

      <span class="sheet-track-duration">${formatDuration(track.durationSeconds || 0)}</span>

      <button
        class="track-drag-handle"
        type="button"
        aria-label="Переместить трек"
        data-track-drag-handle="true"
      >
        |||
      </button>

      <button
        class="track-more"
        type="button"
        aria-label="Действия"
        data-track-menu-open="${track.id}"
        data-track-menu-collection-type="${view.type}"
        data-track-menu-collection-id="${collectionId}"
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
  clearTrackDragTimer();
  if (state.drag.active && state.drag.rowEl) {
    endTrackDrag(state.drag.rowEl);
  } else {
    state.drag.ghostEl?.remove();
    state.drag.ghostEl = null;
    state.drag.pointerId = null;
    state.drag.rowEl = null;
  }
  state.overlay.open = false;
  closeTrackMenu();
  renderCollectionSheet();
}

function openTrackMenu(trackId, collectionType = "all", collectionId = null) {
  if (!trackId) {
    return;
  }

  state.trackMenu = {
    open: true,
    trackId,
    collectionType,
    collectionId: collectionId || null,
  };
  renderTrackMenu();
}

function closeTrackMenu() {
  state.trackMenu = {
    open: false,
    trackId: null,
    collectionType: "all",
    collectionId: null,
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

  if (action === "remove-from-playlist" && state.trackMenu.collectionId) {
    await removeTrackFromPlaylist(trackId, state.trackMenu.collectionId);
    closeTrackMenu();
    return;
  }

  if (action === "remove-from-album" && state.trackMenu.collectionId) {
    await removeTrackFromAlbum(trackId, state.trackMenu.collectionId);
    closeTrackMenu();
    return;
  }

  if (action === "delete-track") {
    await deleteTrackFromLibrary(trackId);
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

async function handlePlaylistCoverPicked() {
  const file = refs.playlistCoverInput.files?.[0];
  const pendingCover = state.pendingCollectionCover;
  refs.playlistCoverInput.value = "";
  state.pendingCollectionCover = null;

  if (!file || !pendingCover?.id || !pendingCover.type) {
    return;
  }

  await ensureStorageReady();
  const coverDataUrl = await compressImageToDataUrl(file, 640);

  if (pendingCover.type === "playlist") {
    const playlist = state.playlists.find((item) => item.id === pendingCover.id);
    if (!playlist) {
      return;
    }

    playlist.coverDataUrl = coverDataUrl;
    playlist.updatedAt = new Date().toISOString();
    await state.storageApi.savePlaylist(playlist);
    state.playlists = await state.storageApi.listPlaylists();
    renderApp();
    return;
  }

  if (pendingCover.type === "artist") {
    const profile = getOrCreateArtistProfile(pendingCover.id);
    profile.coverDataUrl = coverDataUrl;
    profile.updatedAt = new Date().toISOString();
    await state.storageApi.saveArtistProfile(profile);
    state.artistProfiles = await state.storageApi.listArtistProfiles();
    renderApp();
  }
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

async function handleBulkAttachPicked() {
  const files = Array.from(refs.bulkAttachAudioInput.files || []);
  refs.bulkAttachAudioInput.value = "";

  if (!files.length) {
    return;
  }

  await ensureStorageReady();
  if (!state.library.length) {
    state.library = await state.storageApi.listTracks();
  }

  const matchPlan = buildBulkAttachPlan(files);
  for (const [trackId, file] of matchPlan.entries()) {
    const previousSession = state.sessionAudio.get(trackId);
    if (previousSession?.objectUrl) {
      URL.revokeObjectURL(previousSession.objectUrl);
    }

    state.sessionAudio.set(trackId, {
      objectUrl: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size || 0,
    });
  }

  if (state.currentTrackId && state.sessionAudio.has(state.currentTrackId)) {
    renderMiniPlayer();
  }

  renderApp();
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
    sortOrder: getNextLibrarySortOrder(),
    albumTrackOrder: refs.albumInput.value.trim() ? getNextAlbumTrackOrder(refs.albumInput.value.trim()) : null,
    durationSeconds: state.selectedAudio.durationSeconds || 0,
    fileName: state.selectedAudio.file.name,
    fileSize: state.selectedAudio.file.size || 0,
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
    coverDataUrl: "",
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

  const playResult = await refs.audioElement.play().catch(() => undefined);
  if (playResult !== undefined || !refs.audioElement.paused) {
    await registerTrackPlay(track);
  }

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
    return;
  }

  if (state.overlay.type === "artist" && !getArtists().some((artist) => artist.id === state.overlay.id)) {
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

  if (state.trackMenu.collectionType === "playlist"
    && state.trackMenu.collectionId
    && !state.playlists.some((playlist) => playlist.id === state.trackMenu.collectionId)) {
    state.trackMenu.collectionId = null;
  }

  if (state.trackMenu.collectionType === "album"
    && state.trackMenu.collectionId
    && !getAlbums().some((album) => album.id === state.trackMenu.collectionId)) {
    state.trackMenu.collectionId = null;
  }

  if (state.trackMenu.collectionType === "artist"
    && state.trackMenu.collectionId
    && !getArtists().some((artist) => artist.id === state.trackMenu.collectionId)) {
    state.trackMenu.collectionId = null;
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
      albumId: album.id,
      trackIds: album.trackIds,
      coverDataUrl: album.coverDataUrl,
      showCover: true,
      coverEditableType: null,
      coverEditableId: null,
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
      albumId: null,
      trackIds: playlist.trackIds,
      coverDataUrl: playlist.coverDataUrl || getCollectionCoverDataUrl(tracks),
      showCover: true,
      coverEditableType: "playlist",
      coverEditableId: playlist.id,
      playlistId: playlist.id,
    };
  }

  if (state.overlay.type === "artist") {
    const artist = getArtists().find((item) => item.id === state.overlay.id);
    if (!artist) {
      return null;
    }

    return {
      type: "artist",
      typeLabel: "Исполнитель",
      title: artist.title,
      meta: formatTrackCount(artist.trackIds.length),
      albumId: null,
      trackIds: artist.trackIds,
      coverDataUrl: artist.coverDataUrl,
      showCover: true,
      coverEditableType: "artist",
      coverEditableId: artist.id,
      playlistId: null,
    };
  }

  const allTracks = state.library.slice();
  return {
    type: "all",
    typeLabel: "Медиатека",
    title: "Все треки",
    meta: formatTrackCount(allTracks.length),
    albumId: null,
    trackIds: allTracks.map((track) => track.id),
    coverDataUrl: "",
    showCover: false,
    coverEditableType: null,
    coverEditableId: null,
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
    coverDataUrl: playlist.coverDataUrl || getCollectionCoverDataUrl(tracks),
  };
}

function getArtists() {
  const groups = new Map();

  for (const track of state.library) {
    const artistName = String(track.artist || "").trim();
    if (!artistName) {
      continue;
    }

    const artistId = `artist:${normalizeText(artistName)}`;
    if (!groups.has(artistId)) {
      groups.set(artistId, {
        id: artistId,
        title: artistName,
        tracks: [],
      });
    }

    groups.get(artistId).tracks.push(track);
  }

  return Array.from(groups.values())
    .map((artist) => getArtistCardData(artist))
    .sort((left, right) => left.title.localeCompare(right.title, "ru"));
}

function getArtistCardData(artist) {
  const profile = getArtistProfile(artist.id);
  const orderedTrackIds = orderTrackIdsByProfile(
    artist.tracks.map((track) => track.id),
    profile?.trackIds || []
  );
  const orderedTracks = orderedTrackIds.map(getTrackById).filter(Boolean);

  return {
    id: artist.id,
    title: artist.title,
    meta: formatTrackCount(orderedTracks.length),
    trackIds: orderedTrackIds,
    coverDataUrl: profile?.coverDataUrl || getCollectionCoverDataUrl(orderedTracks),
  };
}

function getArtistProfile(artistId) {
  return state.artistProfiles.find((profile) => profile.id === artistId) || null;
}

function getOrCreateArtistProfile(artistId) {
  return getArtistProfile(artistId) || {
    id: artistId,
    coverDataUrl: "",
    trackIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function orderTrackIdsByProfile(trackIds, preferredOrderIds) {
  const availableIds = trackIds.filter(Boolean);
  const availableSet = new Set(availableIds);
  const ordered = preferredOrderIds.filter((trackId) => availableSet.has(trackId));
  const used = new Set(ordered);
  const rest = availableIds.filter((trackId) => !used.has(trackId));
  return [...ordered, ...rest];
}

function getAlbums() {
  const groups = new Map();

  for (const track of state.library) {
    const albumTitle = String(track.album || "").trim();
    if (!albumTitle) {
      continue;
    }

    const albumId = `album:${normalizeText(albumTitle)}`;
    if (!groups.has(albumId)) {
      groups.set(albumId, {
        id: albumId,
        title: albumTitle,
        tracks: [],
        coverDataUrl: track.coverDataUrl || "",
        artistNames: new Set(),
      });
    }

    const album = groups.get(albumId);
    album.tracks.push(track);
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
      trackIds: album.tracks
        .slice()
        .sort(compareTracksByAlbumOrder)
        .map((track) => track.id),
      coverDataUrl: album.coverDataUrl,
      artistLabel: Array.from(album.artistNames).join(", "),
      meta: [Array.from(album.artistNames).join(", "), formatTrackCount(album.tracks.length)]
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

function compareTracksByLibraryOrder(left, right) {
  const leftOrder = Number.isFinite(left?.sortOrder) ? Number(left.sortOrder) : null;
  const rightOrder = Number.isFinite(right?.sortOrder) ? Number(right.sortOrder) : null;

  if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder !== null && rightOrder === null) {
    return -1;
  }
  if (leftOrder === null && rightOrder !== null) {
    return 1;
  }

  return String(right?.addedAt || "").localeCompare(String(left?.addedAt || "")) || String(left?.title || "").localeCompare(String(right?.title || ""), "ru");
}

function compareTracksByAlbumOrder(left, right) {
  const leftOrder = Number.isFinite(left?.albumTrackOrder) ? Number(left.albumTrackOrder) : null;
  const rightOrder = Number.isFinite(right?.albumTrackOrder) ? Number(right.albumTrackOrder) : null;

  if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder !== null && rightOrder === null) {
    return -1;
  }
  if (leftOrder === null && rightOrder !== null) {
    return 1;
  }

  return compareTracksByLibraryOrder(left, right);
}

function getNextLibrarySortOrder() {
  return state.library.reduce((maxValue, track) => Math.max(maxValue, Number(track.sortOrder) || 0), 0) + 1;
}

function getNextAlbumTrackOrder(albumTitle) {
  const normalizedAlbum = normalizeText(albumTitle);
  return state.library
    .filter((track) => normalizeText(track.album || "") === normalizedAlbum)
    .reduce((maxValue, track) => Math.max(maxValue, Number(track.albumTrackOrder) || 0), 0) + 1;
}

async function deleteTrackFromLibrary(trackId) {
  await ensureStorageReady();
  const track = getTrackById(trackId);
  if (!track) {
    return;
  }

  const session = state.sessionAudio.get(trackId);
  if (session?.objectUrl) {
    URL.revokeObjectURL(session.objectUrl);
  }
  state.sessionAudio.delete(trackId);

  for (const playlist of state.playlists) {
    if (!playlist.trackIds.includes(trackId)) {
      continue;
    }

    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    playlist.updatedAt = new Date().toISOString();
    await state.storageApi.savePlaylist(playlist);
  }

  for (const profile of state.artistProfiles) {
    if (!profile.trackIds?.includes(trackId)) {
      continue;
    }

    profile.trackIds = profile.trackIds.filter((id) => id !== trackId);
    profile.updatedAt = new Date().toISOString();
    await state.storageApi.saveArtistProfile(profile);
  }

  await state.storageApi.removeTrack(trackId);
  await state.storageApi.removePlayEventsByTrackId(trackId);

  state.library = await state.storageApi.listTracks();
  state.playlists = await state.storageApi.listPlaylists();
  state.artistProfiles = await state.storageApi.listArtistProfiles();
  state.playHistory = await state.storageApi.listPlayHistory();
  syncPlaybackAfterTrackRemoval(trackId);
  renderApp();
}

async function removeTrackFromAlbum(trackId, albumId) {
  await ensureStorageReady();
  const track = getTrackById(trackId);
  const album = getAlbums().find((item) => item.id === albumId);
  if (!track || !album) {
    return;
  }

  track.album = "";
  track.albumTrackOrder = null;
  await state.storageApi.saveTrack(track);
  state.library = await state.storageApi.listTracks();
  renderApp();
}

function syncPlaybackAfterTrackRemoval(trackId) {
  state.playbackQueue = state.playbackQueue.filter((id) => id !== trackId);

  if (state.currentTrackId === trackId) {
    refs.audioElement.pause();
    refs.audioElement.removeAttribute("src");
    refs.audioElement.dataset.trackId = "";

    if (!state.playbackQueue.length) {
      state.currentTrackId = null;
      state.currentQueueIndex = -1;
      return;
    }

    state.currentQueueIndex = Math.min(Math.max(state.currentQueueIndex, 0), state.playbackQueue.length - 1);
    state.currentTrackId = state.playbackQueue[state.currentQueueIndex] || null;
    void playCurrentTrack();
    return;
  }

  state.currentQueueIndex = state.currentTrackId ? state.playbackQueue.indexOf(state.currentTrackId) : -1;
}

async function persistTrackOrderFromDom() {
  const view = getOverlayViewData();
  if (!view) {
    return;
  }

  const orderedIds = Array.from(refs.sheetTrackList.querySelectorAll(".sheet-track-row"))
    .map((row) => row.dataset.trackId || "")
    .filter(Boolean);

  if (!orderedIds.length) {
    return;
  }

  if (view.type === "playlist" && view.playlistId) {
    await reorderPlaylistTracks(view.playlistId, orderedIds);
    return;
  }

  if (view.type === "album" && view.albumId) {
    await reorderAlbumTracks(view.albumId, orderedIds);
    return;
  }

  if (view.type === "artist" && view.coverEditableId) {
    await reorderArtistTracks(view.coverEditableId, orderedIds);
    return;
  }

  await reorderLibraryTracks(orderedIds);
}

async function reorderPlaylistTracks(playlistId, orderedIds) {
  await ensureStorageReady();
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    return;
  }

  playlist.trackIds = orderedIds.filter((trackId) => playlist.trackIds.includes(trackId));
  playlist.updatedAt = new Date().toISOString();
  await state.storageApi.savePlaylist(playlist);
  state.playlists = await state.storageApi.listPlaylists();
  renderApp();
}

async function reorderAlbumTracks(albumId, orderedIds) {
  await ensureStorageReady();
  const album = getAlbums().find((item) => item.id === albumId);
  if (!album) {
    return;
  }

  const updates = orderedIds
    .map((trackId, index) => {
      const track = getTrackById(trackId);
      if (!track || normalizeText(track.album || "") !== normalizeText(album.title)) {
        return null;
      }

      track.albumTrackOrder = index + 1;
      return state.storageApi.saveTrack(track);
    })
    .filter(Boolean);

  await Promise.all(updates);
  state.library = await state.storageApi.listTracks();
  renderApp();
}

async function reorderArtistTracks(artistId, orderedIds) {
  await ensureStorageReady();
  const artist = getArtists().find((item) => item.id === artistId);
  if (!artist) {
    return;
  }

  const profile = getOrCreateArtistProfile(artistId);
  profile.trackIds = orderedIds.filter((trackId) => artist.trackIds.includes(trackId));
  profile.updatedAt = new Date().toISOString();
  await state.storageApi.saveArtistProfile(profile);
  state.artistProfiles = await state.storageApi.listArtistProfiles();
  renderApp();
}

async function reorderLibraryTracks(orderedIds) {
  await ensureStorageReady();
  const updates = orderedIds
    .map((trackId, index) => {
      const track = getTrackById(trackId);
      if (!track) {
        return null;
      }

      track.sortOrder = index + 1;
      return state.storageApi.saveTrack(track);
    })
    .filter(Boolean);

  await Promise.all(updates);
  state.library = await state.storageApi.listTracks();
  renderApp();
}

function handleTrackRowPointerDown(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const dragHandle = target.closest("[data-track-drag-handle]");
  if (!(dragHandle instanceof HTMLElement)) {
    return;
  }

  const row = dragHandle.closest(".sheet-track-row");
  if (!(row instanceof HTMLElement) || !refs.sheetTrackList.contains(row)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  clearTrackDragTimer();
  const rowRect = row.getBoundingClientRect();
  try {
    row.setPointerCapture(event.pointerId);
  } catch (error) {
    // Telegram WebView can ignore pointer capture before drag starts.
  }
  state.drag.pointerId = event.pointerId;
  state.drag.rowEl = row;
  state.drag.startX = event.clientX;
  state.drag.startY = event.clientY;
  state.drag.grabOffsetY = event.clientY - rowRect.top;
  beginTrackDrag(row, event.pointerId);
}

function handleTrackRowPointerMove(event) {
  if (state.drag.pointerId !== event.pointerId || !state.drag.rowEl) {
    return;
  }

  event.preventDefault();
  const row = state.drag.rowEl;
  if (state.drag.ghostEl) {
    state.drag.ghostEl.style.top = `${event.clientY - state.drag.grabOffsetY}px`;
  }

  const panel = refs.sheetTrackList.closest(".collection-sheet-panel");
  if (panel instanceof HTMLElement) {
    const panelRect = panel.getBoundingClientRect();
    if (event.clientY > panelRect.bottom - 64) {
      panel.scrollTop += 12;
    } else if (event.clientY < panelRect.top + 64) {
      panel.scrollTop -= 12;
    }
  }

  const nextRow = getReorderTargetRow(event.clientY, row);
  if (nextRow) {
    refs.sheetTrackList.insertBefore(row, nextRow);
  } else {
    refs.sheetTrackList.append(row);
  }
  syncSheetTrackIndices();
}

function handleTrackRowPointerUp(event) {
  if (state.drag.pointerId !== event.pointerId) {
    return;
  }

  const wasActive = state.drag.active;
  const row = state.drag.rowEl;
  clearTrackDragTimer();

  if (wasActive && row) {
    endTrackDrag(row);
    void persistTrackOrderFromDom();
  } else {
    state.drag.pointerId = null;
    state.drag.rowEl = null;
  }
}

function beginTrackDrag(row, pointerId) {
  if (state.drag.pointerId !== pointerId || !row.isConnected) {
    return;
  }

  const rowRect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.remove("is-active");
  ghost.classList.remove("is-drag-source");
  ghost.classList.add("sheet-track-ghost");
  ghost.style.width = `${rowRect.width}px`;
  ghost.style.height = `${rowRect.height}px`;
  ghost.style.left = `${rowRect.left}px`;
  ghost.style.top = `${rowRect.top}px`;
  document.body.append(ghost);

  state.drag.active = true;
  state.drag.ghostEl = ghost;
  state.drag.suppressClickUntil = Date.now() + 700;
  row.classList.add("is-drag-source");
  refs.sheetTrackList.style.touchAction = "none";
  const panel = refs.sheetTrackList.closest(".collection-sheet-panel");
  if (panel instanceof HTMLElement) {
    panel.style.touchAction = "none";
  }
  document.body.classList.add("is-dragging-tracks");
}

function endTrackDrag(row) {
  try {
    if (state.drag.pointerId !== null && row.hasPointerCapture?.(state.drag.pointerId)) {
      row.releasePointerCapture(state.drag.pointerId);
    }
  } catch (error) {
    // Ignore pointer capture release issues in embedded webviews.
  }

  state.drag.ghostEl?.remove();
  state.drag.ghostEl = null;
  row.classList.remove("is-drag-source");
  refs.sheetTrackList.style.touchAction = "";
  const panel = refs.sheetTrackList.closest(".collection-sheet-panel");
  if (panel instanceof HTMLElement) {
    panel.style.touchAction = "";
  }
  document.body.classList.remove("is-dragging-tracks");
  syncSheetTrackIndices();
  state.drag.active = false;
  state.drag.pointerId = null;
  state.drag.rowEl = null;
}

function getReorderTargetRow(pointerY, draggedRow) {
  const rows = Array.from(refs.sheetTrackList.querySelectorAll(".sheet-track-row"))
    .filter((row) => row !== draggedRow);

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) {
      return row;
    }
  }

  return null;
}

function clearTrackDragTimer() {
  if (state.drag.timerId) {
    window.clearTimeout(state.drag.timerId);
    state.drag.timerId = null;
  }
}

function syncSheetTrackIndices() {
  Array.from(refs.sheetTrackList.querySelectorAll(".sheet-track-row")).forEach((row, index) => {
    const label = row.querySelector(".sheet-track-index");
    if (label) {
      label.textContent = String(index + 1);
    }
  });
}

async function registerTrackPlay(track) {
  await ensureStorageReady();
  const playEvent = {
    id: createId(),
    trackId: track.id,
    playedAt: new Date().toISOString(),
    artist: track.artist || "Не указан",
  };

  await state.storageApi.savePlayEvent(playEvent);
  state.playHistory = await state.storageApi.listPlayHistory();
  if (state.activeScreen === "statistics") {
    renderStatistics();
  }
}

function getTopTracksByRange(range) {
  const history = getPlayHistoryByRange(range);
  const counts = new Map();

  for (const event of history) {
    const track = getTrackById(event.trackId);
    if (!track) {
      continue;
    }

    const current = counts.get(track.id) || {
      id: track.id,
      title: track.title,
      artist: track.artist || "Не указан",
      coverDataUrl: track.coverDataUrl || "",
      playCount: 0,
    };

    current.playCount += 1;
    counts.set(track.id, current);
  }

  return Array.from(counts.values())
    .sort((left, right) => right.playCount - left.playCount || left.title.localeCompare(right.title, "ru"))
    .slice(0, 10);
}

function getTopArtistsByRange(range) {
  const history = getPlayHistoryByRange(range);
  const counts = new Map();

  for (const event of history) {
    const artist = event.artist || getTrackById(event.trackId)?.artist || "Не указан";
    counts.set(artist, (counts.get(artist) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([artist, playCount]) => ({ artist, playCount }))
    .sort((left, right) => right.playCount - left.playCount || left.artist.localeCompare(right.artist, "ru"))
    .slice(0, 10);
}

function getTopArtistsStatsByRange(range) {
  const history = getPlayHistoryByRange(range);
  const counts = new Map();
  const artists = getArtists();

  for (const event of history) {
    const artist = event.artist || getTrackById(event.trackId)?.artist || "Не указан";
    const artistId = `artist:${normalizeText(artist)}`;
    const artistCard = artists.find((item) => item.id === artistId);
    const current = counts.get(artistId) || {
      artist,
      playCount: 0,
      coverDataUrl: artistCard?.coverDataUrl || "",
    };

    current.playCount += 1;
    counts.set(artistId, current);
  }

  return Array.from(counts.values())
    .sort((left, right) => right.playCount - left.playCount || left.artist.localeCompare(right.artist, "ru"))
    .slice(0, 10);
}

function getPlayHistoryByRange(range) {
  if (range === "all") {
    return state.playHistory;
  }

  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return state.playHistory.filter((event) => {
    const playedAt = new Date(event.playedAt).getTime();
    return Number.isFinite(playedAt) && playedAt >= since;
  });
}

function buildBulkAttachPlan(files) {
  const unmatchedTracks = state.library.filter((track) => !state.sessionAudio.has(track.id));
  const plans = new Map();

  for (const file of files) {
    const match = findTrackForAudioFile(file, unmatchedTracks, plans);
    if (!match) {
      continue;
    }

    plans.set(match.id, file);
  }

  return plans;
}

function findTrackForAudioFile(file, tracks, plans) {
  const fileNameKey = toFileLookupKey(file.name);
  const titleKey = normalizeText(stripExtension(file.name)).replace(/-/g, "");
  const fileSize = Number(file.size) || 0;

  const candidates = tracks
    .filter((track) => !plans.has(track.id))
    .map((track) => ({
      track,
      score: scoreTrackFileMatch(track, fileNameKey, titleKey, fileSize),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || compareTrackFreshness(left.track, right.track));

  return candidates[0]?.track || null;
}

function scoreTrackFileMatch(track, fileNameKey, titleKey, fileSize) {
  const trackFileNameKey = toFileLookupKey(track.fileName || "");
  const trackTitleKey = normalizeText(track.title || "").replace(/-/g, "");
  const trackFileSize = Number(track.fileSize) || 0;
  let score = 0;

  if (trackFileNameKey && trackFileNameKey === fileNameKey) {
    score += 10;
  }
  if (trackTitleKey && trackTitleKey === titleKey) {
    score += 4;
  }
  if (trackFileSize && fileSize && trackFileSize === fileSize) {
    score += 3;
  }

  return score;
}

function compareTrackFreshness(left, right) {
  return String(right.addedAt || "").localeCompare(String(left.addedAt || ""));
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

function markTelegramReady() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return;
  }

  try {
    if (!telegramReadySent) {
      webApp.ready();
      telegramReadySent = true;
    }
    webApp.expand();
  } catch (error) {
    // Ignore bridge timing issues; the next lifecycle event will retry.
  }
}

function applyTelegramChrome() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return;
  }

  markTelegramReady();

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
      if (!db.objectStoreNames.contains(ARTIST_PROFILE_STORE)) {
        db.createObjectStore(ARTIST_PROFILE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PLAY_HISTORY_STORE)) {
        db.createObjectStore(PLAY_HISTORY_STORE, { keyPath: "id" });
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
      return tracks.sort(compareTracksByLibraryOrder);
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
    async listArtistProfiles() {
      const profiles = await runStoreRequest(db, ARTIST_PROFILE_STORE, "readonly", (store) => store.getAll());
      return profiles.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    },
    saveArtistProfile(profile) {
      return runStoreRequest(db, ARTIST_PROFILE_STORE, "readwrite", (store) => store.put(profile));
    },
    async listPlayHistory() {
      const history = await runStoreRequest(db, PLAY_HISTORY_STORE, "readonly", (store) => store.getAll());
      return history.sort((left, right) => String(right.playedAt || "").localeCompare(String(left.playedAt || "")));
    },
    savePlayEvent(event) {
      return runStoreRequest(db, PLAY_HISTORY_STORE, "readwrite", (store) => store.put(event));
    },
    async removePlayEventsByTrackId(trackId) {
      const history = await runStoreRequest(db, PLAY_HISTORY_STORE, "readonly", (store) => store.getAll());
      const removals = history
        .filter((event) => event.trackId === trackId)
        .map((event) => runStoreRequest(db, PLAY_HISTORY_STORE, "readwrite", (store) => store.delete(event.id)));
      await Promise.all(removals);
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
      return tracks.sort(compareTracksByLibraryOrder);
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
    async listArtistProfiles() {
      const payload = window.localStorage.getItem(ARTIST_PROFILE_STORAGE_KEY);
      const profiles = payload ? JSON.parse(payload) : [];
      return profiles.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    },
    async saveArtistProfile(profile) {
      const profiles = await this.listArtistProfiles();
      const nextProfiles = profiles.filter((item) => item.id !== profile.id);
      nextProfiles.push(profile);
      window.localStorage.setItem(ARTIST_PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
    },
    async listPlayHistory() {
      const payload = window.localStorage.getItem(PLAY_HISTORY_STORAGE_KEY);
      const history = payload ? JSON.parse(payload) : [];
      return history.sort((left, right) => String(right.playedAt || "").localeCompare(String(left.playedAt || "")));
    },
    async savePlayEvent(event) {
      const history = await this.listPlayHistory();
      history.push(event);
      window.localStorage.setItem(PLAY_HISTORY_STORAGE_KEY, JSON.stringify(history));
    },
    async removePlayEventsByTrackId(trackId) {
      const history = await this.listPlayHistory();
      window.localStorage.setItem(
        PLAY_HISTORY_STORAGE_KEY,
        JSON.stringify(history.filter((event) => event.trackId !== trackId))
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

function toFileLookupKey(fileName) {
  return normalizeText(stripExtension(fileName || ""));
}

function getArtistInitials(artist) {
  const words = String(artist || "SK")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() || "").join("") || "SK";
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
