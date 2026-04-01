const STORAGE_KEY = "soundkeeper-tracks-v1";
const DB_NAME = "soundkeeper-db";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";

const state = {
  library: [],
  sessionAudio: new Map(),
  currentTrackId: null,
  pendingAttachTrackId: null,
  selectedAudio: null,
  selectedCoverDataUrl: "",
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
  state.library = await state.storageApi.listTracks();

  renderDraft();
  renderLibrary();
  renderHero();
}

function cacheRefs() {
  refs.audioInput = document.getElementById("audioInput");
  refs.coverInput = document.getElementById("coverInput");
  refs.attachAudioInput = document.getElementById("attachAudioInput");
  refs.trackForm = document.getElementById("trackForm");
  refs.titleInput = document.getElementById("titleInput");
  refs.artistInput = document.getElementById("artistInput");
  refs.albumInput = document.getElementById("albumInput");
  refs.durationPreview = document.getElementById("durationPreview");
  refs.selectedAudioLabel = document.getElementById("selectedAudioLabel");
  refs.selectedCoverLabel = document.getElementById("selectedCoverLabel");
  refs.saveTrackButton = document.getElementById("saveTrackButton");
  refs.trackList = document.getElementById("trackList");
  refs.librarySearch = document.getElementById("librarySearch");
  refs.audioElement = document.getElementById("audioElement");
  refs.heroCover = document.getElementById("heroCover");
  refs.heroPlaceholder = document.getElementById("heroPlaceholder");
  refs.heroTitle = document.getElementById("heroTitle");
  refs.heroArtist = document.getElementById("heroArtist");
  refs.heroStatus = document.getElementById("heroStatus");
  refs.playPauseButton = document.getElementById("playPauseButton");
  refs.focusImportButton = document.getElementById("focusImportButton");
  refs.progressInput = document.getElementById("progressInput");
  refs.currentTimeLabel = document.getElementById("currentTimeLabel");
  refs.durationLabel = document.getElementById("durationLabel");
  refs.importSection = document.getElementById("importSection");
}

function bindEvents() {
  document.getElementById("openAudioPicker").addEventListener("click", () => refs.audioInput.click());
  document.getElementById("openCoverPicker").addEventListener("click", () => refs.coverInput.click());
  document.getElementById("clearDraftButton").addEventListener("click", () => clearDraft());
  refs.focusImportButton.addEventListener("click", () => refs.importSection.scrollIntoView({ behavior: "smooth", block: "start" }));

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
  refs.librarySearch.addEventListener("input", renderLibrary);

  refs.playPauseButton.addEventListener("click", () => {
    void togglePlayPause();
  });
  refs.progressInput.addEventListener("input", handleSeek);

  refs.audioElement.addEventListener("timeupdate", syncProgressUi);
  refs.audioElement.addEventListener("loadedmetadata", syncProgressUi);
  refs.audioElement.addEventListener("play", renderHero);
  refs.audioElement.addEventListener("pause", renderHero);
  refs.audioElement.addEventListener("ended", renderHero);

  refs.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const { action, trackId } = button.dataset;
    if (!trackId) {
      return;
    }

    if (action === "play") {
      void playTrack(trackId);
      return;
    }

    if (action === "focus") {
      state.currentTrackId = trackId;
      renderLibrary();
      renderHero();
      return;
    }

    if (action === "attach") {
      state.pendingAttachTrackId = trackId;
      refs.attachAudioInput.click();
      return;
    }

    if (action === "remove") {
      void removeTrack(trackId);
    }
  });
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
  renderLibrary();
  renderHero();
  await playTrack(track.id);
}

async function removeTrack(trackId) {
  await state.storageApi.removeTrack(trackId);
  const session = state.sessionAudio.get(trackId);
  if (session?.objectUrl) {
    URL.revokeObjectURL(session.objectUrl);
  }
  state.sessionAudio.delete(trackId);

  if (state.currentTrackId === trackId) {
    refs.audioElement.pause();
    refs.audioElement.removeAttribute("src");
    delete refs.audioElement.dataset.trackId;
    refs.audioElement.load();
    state.currentTrackId = null;
  }

  state.library = await state.storageApi.listTracks();
  renderLibrary();
  renderHero();
}

async function togglePlayPause() {
  const track = getCurrentTrack();
  if (!track) {
    refs.importSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const track = state.library.find((item) => item.id === trackId);
  const session = state.sessionAudio.get(trackId);
  if (!track) {
    return;
  }

  state.currentTrackId = trackId;

  if (!session) {
    state.pendingAttachTrackId = trackId;
    renderLibrary();
    renderHero();
    refs.attachAudioInput.click();
    return;
  }

  if (refs.audioElement.dataset.trackId !== trackId) {
    refs.audioElement.src = session.objectUrl;
    refs.audioElement.dataset.trackId = trackId;
  }

  await refs.audioElement.play().catch(() => undefined);
  renderLibrary();
  renderHero();
}

function handleSeek() {
  if (!Number.isFinite(refs.audioElement.duration) || refs.audioElement.duration <= 0) {
    return;
  }

  const percentage = Number(refs.progressInput.value) / 100;
  refs.audioElement.currentTime = refs.audioElement.duration * percentage;
}

function renderDraft() {
  refs.selectedAudioLabel.textContent = state.selectedAudio
    ? `${state.selectedAudio.file.name} · ${formatDuration(state.selectedAudio.durationSeconds || 0)}`
    : "Файл не выбран";
  refs.selectedCoverLabel.textContent = state.selectedCoverDataUrl ? "Обложка готова" : "Необязательно";
  refs.saveTrackButton.disabled = !state.selectedAudio;
}

function renderHero() {
  const track = getCurrentTrack();
  const session = track ? state.sessionAudio.get(track.id) : null;
  const isCurrentTrackPlaying = track && refs.audioElement.dataset.trackId === track.id && !refs.audioElement.paused;

  if (!track) {
    refs.heroTitle.textContent = "Загрузите первый трек";
    refs.heroArtist.textContent = "Выберите аудиофайл и сохраните карточку в локальную библиотеку.";
    refs.heroStatus.textContent = "В библиотеке останутся название, артист, альбом и обложка. Сам аудиофайл хранится только в текущей сессии.";
    refs.playPauseButton.textContent = "Play";
    refs.playPauseButton.disabled = true;
    refs.heroCover.style.display = "none";
    refs.heroPlaceholder.style.display = "grid";
    refs.currentTimeLabel.textContent = "0:00";
    refs.durationLabel.textContent = "0:00";
    refs.progressInput.value = "0";
    return;
  }

  refs.heroTitle.textContent = track.title;
  refs.heroArtist.textContent = [track.artist, track.album].filter(Boolean).join(" · ");

  if (session) {
    refs.heroStatus.textContent = isCurrentTrackPlaying
      ? "Трек воспроизводится из файла, выбранного на этом устройстве в текущей сессии."
      : "Аудио подключено к этой карточке в текущей сессии. Можно слушать, пока приложение открыто.";
  } else {
    refs.heroStatus.textContent = "Метаданные сохранены локально, но аудио не подключено. Нажмите Play или Подключить аудио.";
  }

  refs.playPauseButton.disabled = false;
  refs.playPauseButton.textContent = isCurrentTrackPlaying ? "Pause" : session ? "Play" : "Подключить аудио";

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

function renderLibrary() {
  const query = refs.librarySearch.value.trim().toLowerCase();
  const filtered = state.library.filter((track) => {
    const haystack = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!filtered.length) {
    refs.trackList.innerHTML = `
      <div class="empty-state">
        <h3>${state.library.length ? "Ничего не найдено" : "Библиотека пока пустая"}</h3>
        <p>${state.library.length ? "Попробуйте другой запрос." : "Выберите аудио, добавьте метаданные и сохраните первую карточку трека."}</p>
      </div>
    `;
    return;
  }

  refs.trackList.innerHTML = filtered
    .map((track) => {
      const session = state.sessionAudio.get(track.id);
      const isActive = state.currentTrackId === track.id;
      const cover = track.coverDataUrl
        ? `<img class="track-cover" src="${track.coverDataUrl}" alt="Обложка ${escapeHtml(track.title)}">`
        : `<div class="track-cover-placeholder" aria-hidden="true">SK</div>`;

      return `
        <article class="track-card ${isActive ? "is-active" : ""}">
          ${cover}
          <div class="track-meta">
            <div class="track-title-row">
              <h3 class="track-title">${escapeHtml(track.title)}</h3>
              <span class="track-badge stored">Карточка сохранена</span>
              <span class="track-badge ${session ? "ready" : ""}">${session ? "Аудио подключено" : "Только метаданные"}</span>
            </div>
            <p class="track-subtitle">${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</p>
            <p class="track-caption">${formatDuration(track.durationSeconds || 0)} · ${escapeHtml(track.fileName || "Локальный файл")}</p>
            <div class="track-badge-row">
              <button class="track-action" type="button" data-action="focus" data-track-id="${track.id}">Открыть</button>
              <button class="track-action" type="button" data-action="play" data-track-id="${track.id}">${session ? "Play" : "Play / Attach"}</button>
            </div>
          </div>
          <div class="track-actions">
            <button class="track-action" type="button" data-action="attach" data-track-id="${track.id}">Подключить аудио</button>
            <button class="track-action remove" type="button" data-action="remove" data-track-id="${track.id}">Удалить</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function syncProgressUi() {
  const hasDuration = Number.isFinite(refs.audioElement.duration) && refs.audioElement.duration > 0;
  const currentTime = refs.audioElement.currentTime || 0;
  const duration = hasDuration ? refs.audioElement.duration : getCurrentTrack()?.durationSeconds || 0;

  refs.currentTimeLabel.textContent = formatDuration(currentTime);
  refs.durationLabel.textContent = formatDuration(duration);
  refs.progressInput.value = hasDuration ? String((currentTime / refs.audioElement.duration) * 100) : "0";
}

function getCurrentTrack() {
  if (!state.currentTrackId) {
    return null;
  }

  return state.library.find((track) => track.id === state.currentTrackId) || null;
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
    document.documentElement.style.setProperty("--bg-elevated", hexToRgba(theme.secondary_bg_color, 0.92));
    document.documentElement.style.setProperty("--bg-panel", hexToRgba(theme.secondary_bg_color, 0.78));
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
  if (theme.button_text_color) {
    refs.playPauseButton.style.setProperty("color", theme.button_text_color);
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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createIndexedDbApi(db) {
  return {
    async listTracks() {
      const tracks = await runStoreRequest(db, "readonly", (store) => store.getAll());
      return tracks.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
    },
    saveTrack(track) {
      return runStoreRequest(db, "readwrite", (store) => store.put(track));
    },
    removeTrack(trackId) {
      return runStoreRequest(db, "readwrite", (store) => store.delete(trackId));
    },
  };
}

function runStoreRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRACK_STORE, mode);
    const store = transaction.objectStore(TRACK_STORE);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createLocalStorageApi() {
  return {
    async listTracks() {
      const payload = window.localStorage.getItem(STORAGE_KEY);
      const tracks = payload ? JSON.parse(payload) : [];
      return tracks.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
    },
    async saveTrack(track) {
      const tracks = await this.listTracks();
      tracks.push(track);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
    },
    async removeTrack(trackId) {
      const tracks = await this.listTracks();
      const nextTracks = tracks.filter((track) => track.id !== trackId);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTracks));
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

  return `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
