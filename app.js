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
  collectionsTab: "albums",
  selectedCollection: null,
  libraryQuery: "",
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
  if (!state.currentTrackId && state.library.length) {
    state.currentTrackId = state.library[0].id;
  }

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
  refs.playlistDescriptionInput = document.getElementById("playlistDescriptionInput");
  refs.librarySearch = document.getElementById("librarySearch");
  refs.audioElement = document.getElementById("audioElement");
  refs.heroCover = document.getElementById("heroCover");
  refs.heroPlaceholder = document.getElementById("heroPlaceholder");
  refs.heroTitle = document.getElementById("heroTitle");
  refs.heroArtist = document.getElementById("heroArtist");
  refs.heroStatus = document.getElementById("heroStatus");
  refs.playPauseButton = document.getElementById("playPauseButton");
  refs.progressInput = document.getElementById("progressInput");
  refs.currentTimeLabel = document.getElementById("currentTimeLabel");
  refs.durationLabel = document.getElementById("durationLabel");
  refs.recentTrackList = document.getElementById("recentTrackList");
  refs.libraryTrackList = document.getElementById("libraryTrackList");
  refs.collectionGrid = document.getElementById("collectionGrid");
  refs.collectionTrackList = document.getElementById("collectionTrackList");
  refs.collectionDetailArt = document.getElementById("collectionDetailArt");
  refs.collectionDetailType = document.getElementById("collectionDetailType");
  refs.collectionDetailTitle = document.getElementById("collectionDetailTitle");
  refs.collectionDetailDescription = document.getElementById("collectionDetailDescription");
  refs.trackCountValue = document.getElementById("trackCountValue");
  refs.albumCountValue = document.getElementById("albumCountValue");
  refs.playlistCountValue = document.getElementById("playlistCountValue");
  refs.screenNodes = Array.from(document.querySelectorAll(".screen"));
  refs.navButtons = Array.from(document.querySelectorAll(".nav-button"));
  refs.mobileNavButtons = Array.from(document.querySelectorAll(".mobile-nav-button"));
  refs.collectionTabButtons = Array.from(document.querySelectorAll("[data-collections-tab]"));
}

function bindEvents() {
  document.getElementById("openAudioPicker").addEventListener("click", () => {
    setActiveScreen("add");
    refs.audioInput.click();
  });
  document.getElementById("openCoverPicker").addEventListener("click", () => {
    setActiveScreen("add");
    refs.coverInput.click();
  });

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

  document.getElementById("clearDraftButton").addEventListener("click", () => clearDraft());
  refs.librarySearch.addEventListener("input", () => {
    state.libraryQuery = refs.librarySearch.value.trim().toLowerCase();
    renderLibrary();
  });

  refs.playPauseButton.addEventListener("click", () => {
    void togglePlayPause();
  });
  refs.progressInput.addEventListener("input", handleSeek);

  refs.audioElement.addEventListener("timeupdate", syncProgressUi);
  refs.audioElement.addEventListener("loadedmetadata", syncProgressUi);
  refs.audioElement.addEventListener("play", renderPlayerDock);
  refs.audioElement.addEventListener("pause", renderPlayerDock);
  refs.audioElement.addEventListener("ended", renderPlayerDock);

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

    const tabButton = target.closest("[data-collections-tab]");
    if (tabButton) {
      setCollectionsTab(tabButton.dataset.collectionsTab || "albums");
      return;
    }

    const trackButton = target.closest("[data-track-action]");
    if (trackButton) {
      void handleTrackAction(trackButton);
      return;
    }

    const collectionButton = target.closest("[data-collection-action]");
    if (collectionButton) {
      void handleCollectionAction(collectionButton);
    }
  });
}

function setActiveScreen(screen) {
  state.activeScreen = screen;
  renderNavigation();
  renderScreens();
}

function setCollectionsTab(tab) {
  state.collectionsTab = tab;
  if (tab === "albums" && state.selectedCollection?.type !== "album") {
    state.selectedCollection = null;
  }
  if (tab === "playlists" && state.selectedCollection?.type !== "playlist") {
    state.selectedCollection = null;
  }
  renderCollections();
}

function renderApp() {
  renderNavigation();
  renderScreens();
  renderDraft();
  renderPlayerDock();
  renderHome();
  renderLibrary();
  renderCollections();
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

function renderHome() {
  const albums = getAlbums();
  refs.trackCountValue.textContent = String(state.library.length);
  refs.albumCountValue.textContent = String(albums.length);
  refs.playlistCountValue.textContent = String(state.playlists.length);

  const recentTracks = state.library.slice(0, 4);
  refs.recentTrackList.innerHTML = buildTrackListMarkup(recentTracks, {
    emptyTitle: "Пока нет последних треков",
    emptyCopy: "Добавьте первый трек во вкладке Add, и здесь появится локальная история.",
    showDelete: false,
    showPlaylistChooser: false,
  });
}

function renderLibrary() {
  const filteredTracks = state.library.filter((track) => {
    const haystack = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
    return haystack.includes(state.libraryQuery);
  });

  refs.libraryTrackList.innerHTML = buildTrackListMarkup(filteredTracks, {
    emptyTitle: state.library.length ? "Ничего не найдено" : "Библиотека пока пустая",
    emptyCopy: state.library.length
      ? "Попробуйте другой запрос или откройте Collections, чтобы перейти по альбому."
      : "Перейдите во вкладку Add, выберите аудио и сохраните первый трек.",
    showDelete: true,
    showPlaylistChooser: true,
  });
}

function renderCollections() {
  for (const button of refs.collectionTabButtons) {
    button.classList.toggle("is-active", button.dataset.collectionsTab === state.collectionsTab);
  }

  refs.playlistForm.hidden = state.collectionsTab !== "playlists";

  ensureSelectedCollection();

  if (state.collectionsTab === "albums") {
    const albums = getAlbums();
    refs.collectionGrid.innerHTML = albums.length
      ? albums.map(buildAlbumCardMarkup).join("")
      : renderEmptyStateMarkup("Альбомов пока нет", "Заполните поле Album во вкладке Add, чтобы собирать альбомные карточки.");
  } else {
    refs.collectionGrid.innerHTML = state.playlists.length
      ? state.playlists.map(buildPlaylistCardMarkup).join("")
      : renderEmptyStateMarkup("Плейлистов пока нет", "Создайте первый плейлист и начните раскладывать по нему треки из библиотеки.");
  }

  renderCollectionDetail();
}

function renderCollectionDetail() {
  if (!state.selectedCollection) {
    setCollectionDetailPlaceholder();
    return;
  }

  if (state.selectedCollection.type === "album") {
    const album = getAlbums().find((item) => item.id === state.selectedCollection.id);
    if (!album) {
      setCollectionDetailPlaceholder();
      return;
    }

    refs.collectionDetailType.textContent = "Album";
    refs.collectionDetailTitle.textContent = album.title;
    refs.collectionDetailDescription.textContent = `${album.trackIds.length} track(s) · ${album.artistLabel}`;
    setCollectionDetailArt(album.coverDataUrl);
    refs.collectionTrackList.innerHTML = buildTrackListMarkup(
      album.trackIds.map(getTrackById).filter(Boolean),
      {
        emptyTitle: "В этом альбоме пока пусто",
        emptyCopy: "Добавьте треки с таким же названием альбома, чтобы наполнить коллекцию.",
        showDelete: false,
        showPlaylistChooser: true,
      }
    );
    return;
  }

  const playlist = state.playlists.find((item) => item.id === state.selectedCollection.id);
  if (!playlist) {
    setCollectionDetailPlaceholder();
    return;
  }

  const playlistTracks = playlist.trackIds.map(getTrackById).filter(Boolean);
  refs.collectionDetailType.textContent = "Playlist";
  refs.collectionDetailTitle.textContent = playlist.name;
  refs.collectionDetailDescription.textContent = playlist.description
    ? `${playlist.description} · ${playlistTracks.length} track(s)`
    : `${playlistTracks.length} track(s) · локальный плейлист`;
  setCollectionDetailArt(getCollectionCoverDataUrl(playlistTracks));
  refs.collectionTrackList.innerHTML = buildTrackListMarkup(playlistTracks, {
    emptyTitle: "Плейлист пока пустой",
    emptyCopy: "Перейдите в Library и добавьте треки в этот плейлист.",
    showDelete: false,
    showPlaylistChooser: false,
    playlistContextId: playlist.id,
  });
}

function renderDraft() {
  refs.selectedAudioLabel.textContent = state.selectedAudio
    ? `${state.selectedAudio.file.name} · ${formatDuration(state.selectedAudio.durationSeconds || 0)}`
    : "Файл не выбран";
  refs.selectedCoverLabel.textContent = state.selectedCoverDataUrl ? "Обложка готова" : "Необязательно";
  refs.saveTrackButton.disabled = !state.selectedAudio;
}

function renderPlayerDock() {
  const track = getCurrentTrack();
  const session = track ? state.sessionAudio.get(track.id) : null;
  const isPlaying = track && refs.audioElement.dataset.trackId === track.id && !refs.audioElement.paused;

  if (!track) {
    refs.heroTitle.textContent = "Загрузите первый трек";
    refs.heroArtist.textContent = "Локальная библиотека, альбомы и плейлисты живут только на устройстве";
    refs.heroStatus.textContent = "Откройте вкладку Add, выберите аудиофайл и сохраните карточку. После этого трек появится в Home, Library и Collections.";
    refs.playPauseButton.disabled = true;
    refs.playPauseButton.textContent = "Play";
    refs.heroCover.style.display = "none";
    refs.heroPlaceholder.style.display = "grid";
    refs.progressInput.value = "0";
    refs.currentTimeLabel.textContent = "0:00";
    refs.durationLabel.textContent = "0:00";
    return;
  }

  refs.heroTitle.textContent = track.title;
  refs.heroArtist.textContent = [track.artist, track.album].filter(Boolean).join(" · ");
  refs.playPauseButton.disabled = false;
  refs.playPauseButton.textContent = isPlaying ? "Pause" : session ? "Play" : "Attach";

  if (session) {
    refs.heroStatus.textContent = isPlaying
      ? "Трек воспроизводится из локального файла, подключенного в этой сессии."
      : "Карточка активна. Можно слушать трек, пока Mini App открыт и файл прикреплен.";
  } else {
    refs.heroStatus.textContent = "Карточка сохранена, но сам файл не прикреплен к этой сессии. Нажмите Play или Attach.";
  }

  if (track.coverDataUrl) {
    refs.heroCover.src = track.coverDataUrl;
    refs.heroCover.style.display = "block";
    refs.heroPlaceholder.style.display = "none";
  } else {
    refs.heroCover.removeAttribute("src");
    refs.heroCover.style.display = "none";
    refs.heroPlaceholder.style.display = "grid";
  }

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

  if (refs.audioElement.dataset.trackId === trackId) {
    delete refs.audioElement.dataset.trackId;
  }

  state.currentTrackId = trackId;
  await playTrack(trackId);
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
  state.currentTrackId = track.id;
  clearDraft({ keepTransferredAudio: true });
  setActiveScreen("library");
  renderApp();
  await playTrack(track.id);
}

async function createPlaylist() {
  const name = refs.playlistNameInput.value.trim();
  const description = refs.playlistDescriptionInput.value.trim();
  if (!name) {
    refs.playlistNameInput.focus();
    return;
  }

  const playlist = {
    id: createId(),
    name,
    description,
    trackIds: [],
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await state.storageApi.savePlaylist(playlist);
  state.playlists = await state.storageApi.listPlaylists();
  state.collectionsTab = "playlists";
  state.selectedCollection = { type: "playlist", id: playlist.id };
  refs.playlistForm.reset();
  renderCollections();
  renderLibrary();
  renderHome();
}

async function handleTrackAction(button) {
  const action = button.dataset.trackAction;
  const trackId = button.dataset.trackId;
  if (!trackId) {
    return;
  }

  if (action === "focus") {
    state.currentTrackId = trackId;
    renderPlayerDock();
    return;
  }

  if (action === "play") {
    await playTrack(trackId);
    return;
  }

  if (action === "attach") {
    state.pendingAttachTrackId = trackId;
    refs.attachAudioInput.click();
    return;
  }

  if (action === "remove") {
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

async function handleCollectionAction(button) {
  const action = button.dataset.collectionAction;
  const collectionId = button.dataset.collectionId;
  if (!collectionId) {
    return;
  }

  if (action === "open-album") {
    state.collectionsTab = "albums";
    state.selectedCollection = { type: "album", id: collectionId };
    renderCollections();
    return;
  }

  if (action === "open-playlist") {
    state.collectionsTab = "playlists";
    state.selectedCollection = { type: "playlist", id: collectionId };
    renderCollections();
    return;
  }

  if (action === "delete-playlist") {
    await removePlaylist(collectionId);
  }
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
  if (state.collectionsTab === "playlists") {
    state.selectedCollection = { type: "playlist", id: playlistId };
  }
  renderHome();
  renderLibrary();
  renderCollections();
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
  renderHome();
  renderLibrary();
  renderCollections();
}

async function removePlaylist(playlistId) {
  await state.storageApi.removePlaylist(playlistId);
  state.playlists = await state.storageApi.listPlaylists();
  if (state.selectedCollection?.type === "playlist" && state.selectedCollection.id === playlistId) {
    state.selectedCollection = null;
  }
  renderHome();
  renderLibrary();
  renderCollections();
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
  }

  state.library = await state.storageApi.listTracks();
  state.playlists = await state.storageApi.listPlaylists();
  if (!state.currentTrackId && state.library.length) {
    state.currentTrackId = state.library[0].id;
  }
  renderApp();
}

async function togglePlayPause() {
  const track = getCurrentTrack();
  if (!track) {
    setActiveScreen("add");
    return;
  }

  const session = state.sessionAudio.get(track.id);
  if (!session) {
    state.pendingAttachTrackId = track.id;
    refs.attachAudioInput.click();
    return;
  }

  const currentSource = refs.audioElement.dataset.trackId;
  if (currentSource !== track.id) {
    await playTrack(track.id);
    return;
  }

  if (refs.audioElement.paused) {
    await refs.audioElement.play().catch(() => undefined);
  } else {
    refs.audioElement.pause();
  }
}

async function playTrack(trackId) {
  const track = getTrackById(trackId);
  const session = state.sessionAudio.get(trackId);
  if (!track) {
    return;
  }

  state.currentTrackId = trackId;

  if (!session) {
    state.pendingAttachTrackId = trackId;
    renderPlayerDock();
    refs.attachAudioInput.click();
    return;
  }

  if (refs.audioElement.dataset.trackId !== trackId || refs.audioElement.src !== session.objectUrl) {
    refs.audioElement.src = session.objectUrl;
    refs.audioElement.dataset.trackId = trackId;
  }

  await refs.audioElement.play().catch(() => undefined);
  renderPlayerDock();
  renderHome();
  renderLibrary();
  renderCollections();
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

function ensureSelectedCollection() {
  if (state.collectionsTab === "albums") {
    const albums = getAlbums();
    if (!albums.length) {
      state.selectedCollection = null;
      return;
    }

    const isValid = state.selectedCollection?.type === "album"
      && albums.some((album) => album.id === state.selectedCollection.id);
    if (!isValid) {
      state.selectedCollection = { type: "album", id: albums[0].id };
    }
    return;
  }

  if (!state.playlists.length) {
    state.selectedCollection = null;
    return;
  }

  const isValid = state.selectedCollection?.type === "playlist"
    && state.playlists.some((playlist) => playlist.id === state.selectedCollection.id);
  if (!isValid) {
    state.selectedCollection = { type: "playlist", id: state.playlists[0].id };
  }
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
        artists: new Set(),
        trackIds: [],
        coverDataUrl: "",
      });
    }

    const group = groups.get(groupId);
    group.trackIds.push(track.id);
    if (track.artist) {
      group.artists.add(track.artist);
    }
    if (!group.coverDataUrl && track.coverDataUrl) {
      group.coverDataUrl = track.coverDataUrl;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      artistLabel: Array.from(group.artists).slice(0, 2).join(", ") || "Unknown artist",
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "ru"));
}

function buildAlbumCardMarkup(album) {
  const isSelected = state.selectedCollection?.type === "album" && state.selectedCollection.id === album.id;
  const coverMarkup = album.coverDataUrl
    ? `<img class="collection-cover" src="${album.coverDataUrl}" alt="Обложка ${escapeHtml(album.title)}">`
    : `<div class="collection-cover-placeholder" aria-hidden="true">AL</div>`;

  return `
    <article class="collection-card ${isSelected ? "is-selected" : ""}">
      ${coverMarkup}
      <div class="collection-copy">
        <h3>${escapeHtml(album.title)}</h3>
        <p>${escapeHtml(album.artistLabel)}</p>
        <p>${album.trackIds.length} track(s)</p>
      </div>
      <div class="track-actions">
        <button class="track-action" type="button" data-collection-action="open-album" data-collection-id="${album.id}">Open</button>
      </div>
    </article>
  `;
}

function buildPlaylistCardMarkup(playlist) {
  const playlistTracks = playlist.trackIds.map(getTrackById).filter(Boolean);
  const isSelected = state.selectedCollection?.type === "playlist" && state.selectedCollection.id === playlist.id;
  const coverDataUrl = getCollectionCoverDataUrl(playlistTracks);
  const coverMarkup = coverDataUrl
    ? `<img class="collection-cover" src="${coverDataUrl}" alt="Обложка ${escapeHtml(playlist.name)}">`
    : `<div class="collection-cover-placeholder" aria-hidden="true">PL</div>`;

  return `
    <article class="collection-card ${isSelected ? "is-selected" : ""}">
      ${coverMarkup}
      <div class="collection-copy">
        <h3>${escapeHtml(playlist.name)}</h3>
        <p>${escapeHtml(playlist.description || "Local playlist")}</p>
        <p>${playlistTracks.length} track(s)</p>
      </div>
      <div class="track-actions">
        <button class="track-action" type="button" data-collection-action="open-playlist" data-collection-id="${playlist.id}">Open</button>
        <button class="track-action remove" type="button" data-collection-action="delete-playlist" data-collection-id="${playlist.id}">Delete</button>
      </div>
    </article>
  `;
}

function buildTrackListMarkup(tracks, options = {}) {
  if (!tracks.length) {
    return renderEmptyStateMarkup(options.emptyTitle || "Пусто", options.emptyCopy || "Здесь пока ничего нет.");
  }

  return tracks.map((track) => buildTrackCardMarkup(track, options)).join("");
}

function buildTrackCardMarkup(track, options = {}) {
  const session = state.sessionAudio.get(track.id);
  const isActive = state.currentTrackId === track.id;
  const coverMarkup = track.coverDataUrl
    ? `<img class="track-cover" src="${track.coverDataUrl}" alt="Обложка ${escapeHtml(track.title)}">`
    : `<div class="track-cover-placeholder" aria-hidden="true">SK</div>`;
  const playlistControls = options.showPlaylistChooser && state.playlists.length
    ? `
      <div class="playlist-inline">
        <select data-playlist-select aria-label="Выбор плейлиста">
          <option value="">Выбрать плейлист</option>
          ${state.playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("")}
        </select>
        <button class="track-action" type="button" data-track-action="add-to-playlist" data-track-id="${track.id}">+ Playlist</button>
      </div>
    `
    : "";
  const trailingActions = [
    `<button class="track-action" type="button" data-track-action="attach" data-track-id="${track.id}">${session ? "Reattach" : "Attach"}</button>`,
    options.playlistContextId
      ? `<button class="track-action remove" type="button" data-track-action="remove-from-playlist" data-track-id="${track.id}" data-playlist-id="${options.playlistContextId}">Remove</button>`
      : "",
    options.showDelete
      ? `<button class="track-action remove" type="button" data-track-action="remove" data-track-id="${track.id}">Delete</button>`
      : "",
  ].filter(Boolean).join("");

  return `
    <article class="track-card ${isActive ? "is-active" : ""}">
      ${coverMarkup}
      <div class="track-meta">
        <div class="track-title-row">
          <h3 class="track-title">${escapeHtml(track.title)}</h3>
          <span class="track-badge stored">Saved</span>
          <span class="track-badge ${session ? "ready" : ""}">${session ? "Ready" : "Metadata only"}</span>
        </div>
        <p class="track-subtitle">${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</p>
        <p class="track-caption">${formatDuration(track.durationSeconds || 0)} · ${escapeHtml(track.fileName || "Локальный файл")}</p>
        <div class="track-badge-row">
          <button class="track-action" type="button" data-track-action="focus" data-track-id="${track.id}">Open</button>
          <button class="track-action" type="button" data-track-action="play" data-track-id="${track.id}">${session ? "Play" : "Play / Attach"}</button>
        </div>
        ${playlistControls}
      </div>
      <div class="track-actions">
        ${trailingActions}
      </div>
    </article>
  `;
}

function renderEmptyStateMarkup(title, copy) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </div>
  `;
}

function setCollectionDetailPlaceholder() {
  refs.collectionDetailType.textContent = "Select";
  refs.collectionDetailTitle.textContent = "Выберите альбом или плейлист";
  refs.collectionDetailDescription.textContent = "Здесь появится список треков выбранной коллекции.";
  setCollectionDetailArt("");
  refs.collectionTrackList.innerHTML = renderEmptyStateMarkup(
    "Коллекция не выбрана",
    "Откройте Albums или Playlists слева, чтобы увидеть локальную подборку."
  );
}

function setCollectionDetailArt(coverDataUrl) {
  refs.collectionDetailArt.style.backgroundImage = coverDataUrl ? `url("${coverDataUrl}")` : "";
  refs.collectionDetailArt.style.backgroundSize = coverDataUrl ? "cover" : "";
  refs.collectionDetailArt.style.backgroundPosition = coverDataUrl ? "center" : "";
  refs.collectionDetailArt.textContent = coverDataUrl ? "" : "SK";
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
  if (theme.bg_color) {
    document.documentElement.style.setProperty("--bg", theme.bg_color);
  }
  if (theme.secondary_bg_color) {
    document.documentElement.style.setProperty("--panel", hexToRgba(theme.secondary_bg_color, 0.9));
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

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "-");
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
