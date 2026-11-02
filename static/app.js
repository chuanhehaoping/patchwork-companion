// リアルパートナーAI フロントエンド制御 (v8)
// - 着せ替え時の別衣装戻りバグ完全根絶（衣装固有URL一意管理＋前後スロット完全同期）
// - 選択・会話時の無反応ゼロ保証（最新ターン優先キャンセル＋カード全体クリック＋即時スピナー表示）
// - ハイブリッドマイク音声認識（MediaRecorder実音声録音 → ローカル faster-whisper + VAD自動送信）＆常時表示チャットバー

let activeIdleSlot = "a";
let currentEmotion = "normal";
let currentIdleUrl = "";
let currentPosterUrl = "";
let showThought = true;
let hasEnteredAndGreeted = false;
let lastUserPrompt = "（部屋に入ってきた瞬間）";
let latestState = null;
let selectedMediaFiles = [];
let selectedCharFiles = [];
let playbackToken = 0;
let userTurnToken = 0;
let activeAbortController = null;
let rawPreviewAudio = null;
let rawPreviewVoiceId = null;

// ===== サブ秒 (< 1,000ms) NDJSON Web Audio + Canvas ROI リアルタイム同期エンジン状態 =====
let companionAudioCtx = null;
let activeAudioNodes = [];
let scheduledRoiSegments = [];
let nextAudioScheduleTime = 0;
let streamDoneReceived = false;
let roiRafId = null;
const portraitImageCache = new Map();
let activeStreamBaseImg = null;

window.__lastTalkMetrics = null;

// DOM要素の参照
const enterOverlay = document.getElementById("enter-overlay");
const enterAvatarImg = document.getElementById("enter-avatar-img");
const enterTitle = document.getElementById("enter-title");
const btnEnterRoom = document.getElementById("btn-enter-room");
const btnEnterWardrobe = document.getElementById("btn-enter-wardrobe");
const btnEnterAudition = document.getElementById("btn-enter-audition");

const cameraRig = document.getElementById("camera-rig");
const idleVideoA = document.getElementById("idle-video-a");
const idleVideoB = document.getElementById("idle-video-b");
const talkingVideo = document.getElementById("talking-video");
const talkingVideoNext = document.getElementById("talking-video-next");
const roiTalkCanvas = document.getElementById("roi-talk-canvas");
const roiTalkCtx = roiTalkCanvas ? roiTalkCanvas.getContext("2d", { alpha: false }) : null;
const lightingTint = document.getElementById("lighting-tint");
const fxLayer = document.getElementById("fx-layer");

const partnerNameLabel = document.getElementById("partner-name-label");
const partnerGenderPill = document.getElementById("partner-gender-pill");
const heartMeter = document.getElementById("heart-meter");
const coinPill = document.getElementById("coin-pill");
const memoryPill = document.getElementById("memory-pill");

const btnToggleThought = document.getElementById("btn-toggle-thought");
const thoughtBubble = document.getElementById("thought-bubble");
const thoughtText = document.getElementById("thought-text");
const eventToast = document.getElementById("event-toast");
const tableGifts = document.getElementById("table-gifts");

const userHeardPill = document.getElementById("user-heard-pill");
const spokenSubtitle = document.getElementById("spoken-subtitle");
const speakingBars = document.getElementById("speaking-bars");
const choicesRow = document.getElementById("choices-row");

const btnMic = document.getElementById("btn-mic");
const micLabel = document.getElementById("mic-label");
const micLevelWrap = document.getElementById("mic-level-wrap");
const micLevelFill = document.getElementById("mic-level-fill");
const btnWardrobeBottom = document.getElementById("btn-wardrobe-bottom");
const btnGiftMenu = document.getElementById("btn-gift-menu");
const btnDistance = document.getElementById("btn-distance");
const giftDrawer = document.getElementById("gift-drawer");
const freeInputForm = document.getElementById("free-input-form");
const freeInputText = document.getElementById("free-input-text");
const btnSendText = document.getElementById("btn-send-text");

// 👗 髪色・服・スタイル着せ替えショップモーダル要素
const wardrobeModal = document.getElementById("wardrobe-modal");
const btnOpenWardrobeModal = document.getElementById("btn-open-wardrobe-modal");
const btnCloseWardrobeTop = document.getElementById("btn-close-wardrobe-top");
const btnCloseWardrobe = document.getElementById("btn-close-wardrobe");
const wardrobeCoinCount = document.getElementById("wardrobe-coin-count");
const btnTopupCoins = document.getElementById("btn-topup-coins");
const wardrobeStatus = document.getElementById("wardrobe-status");
const wardrobeGrid = document.getElementById("wardrobe-grid");

// 👑 キャラ審査・学習生成＆理想のAI恋人カスタムスタジオモーダル要素
const charModal = document.getElementById("char-modal");
const btnOpenCharModal = document.getElementById("btn-open-char-modal");
const btnCloseCharModal = document.getElementById("btn-close-char-modal");
const btnCloseCharModalTop = document.getElementById("btn-close-char-modal-top");
const genderSelectBtns = document.querySelectorAll(".gender-select-btn");
const customFaceSelect = document.getElementById("custom-face-select");
const customPartnerName = document.getElementById("custom-partner-name");
const customFirstPerson = document.getElementById("custom-first-person");
const customVoiceSelect = document.getElementById("custom-voice-select");
const btnCustomVoiceRaw = document.getElementById("btn-custom-voice-raw");
const customUserName = document.getElementById("custom-user-name");
const customUserGender = document.getElementById("custom-user-gender");
const btnApplyCustomProfile = document.getElementById("btn-apply-custom-profile");
const faceFilterTabs = document.querySelectorAll("#face-filter-tabs .face-filter-tab");
const faceFilterTabFavs = document.getElementById("face-filter-tab-favs");
const faceFilterTabNew = document.getElementById("face-filter-tab-new");
const favoriteFacesBar = document.getElementById("favorite-faces-bar");
const favoriteFacesSummary = document.getElementById("favorite-faces-summary");
const btnCopyFavoriteFaces = document.getElementById("btn-copy-favorite-faces");
const faceCatalogGrid = document.getElementById("face-catalog-grid");
const candidateSectionWrap = document.getElementById("candidate-section-wrap");
const candidateGrid = document.getElementById("candidate-grid");
const approvedSectionWrap = document.getElementById("approved-section-wrap");
const approvedCharGrid = document.getElementById("approved-char-grid");
const auditionPreviewPanel = document.getElementById("audition-preview-panel");
const auditionPreviewVideo = document.getElementById("audition-preview-video");
const auditionPreviewLabel = document.getElementById("audition-preview-label");
const charmSlider = document.getElementById("charm-slider");
const charmValLabel = document.getElementById("charm-val-label");
const btnApplyCharm = document.getElementById("btn-apply-charm");
const charLearnForm = document.getElementById("char-learn-form");
const charNameInput = document.getElementById("char-name-input");
const charFolderInput = document.getElementById("char-folder-input");
const charDropzone = document.getElementById("char-dropzone");
const charFilesInput = document.getElementById("char-files-input");
const charFilesLabel = document.getElementById("char-files-label");
const btnSubmitCharLearn = document.getElementById("btn-submit-char-learn");
const charLearnStatus = document.getElementById("char-learn-status");

// 🎙️ 実在肉声＆話し方DNA学習モーダル要素
const voiceModal = document.getElementById("voice-modal");
const btnOpenVoiceModal = document.getElementById("btn-open-voice-modal");
const btnCloseVoiceTop = document.getElementById("btn-close-voice-top");
const btnCloseVoiceModal = document.getElementById("btn-close-voice-modal");
const voiceFilterTabs = document.querySelectorAll("#voice-filter-tabs .voice-filter-tab");
const voiceListEl = document.getElementById("voice-list");
const voiceLearnForm = document.getElementById("voice-learn-form");
const voiceLabelInput = document.getElementById("voice-label-input");
const voiceGenderSelect = document.getElementById("voice-gender-select");
const voiceFolderInput = document.getElementById("voice-folder-input");
const voiceFileInput = document.getElementById("voice-file-input");
const voiceDropzone = document.getElementById("voice-dropzone");
const voiceFileLabel = document.getElementById("voice-file-label");
const btnSubmitVoiceLearn = document.getElementById("btn-submit-voice-learn");
const voiceLearnStatus = document.getElementById("voice-learn-status");

let selectedCustomGender = "female";
let selectedCustomFaceId = "face_f02_mio";
let cachedFaceCatalog = [];
let recommendedFaceByGender = {
  female: "face_f02_mio",
  male: "face_m01_ren",
  other: "face_o01_haru",
};
let currentFaceGenderFilter = "all";
let favoriteFaceIds = [];
let cachedVoicesList = [];
let recommendedVoicesMap = {
  female: "human_g0143",
  male: "human_g0144",
  other: "human_g0244",
};
let currentVoiceGenderFilter = "all";

function updateCoinDisplay(coinsVal) {
  const c = Number(coinsVal ?? 1200);
  if (coinPill) coinPill.textContent = `💎 ${c.toLocaleString()}`;
  if (wardrobeCoinCount) wardrobeCoinCount.textContent = `💎 ${c.toLocaleString()} コイン`;
}

function showUserHeardText(txt) {
  if (!userHeardPill) return;
  if (!txt) {
    userHeardPill.classList.add("hidden");
    return;
  }
  userHeardPill.textContent = `🗣️ あなた：「${txt}」`;
  userHeardPill.classList.remove("hidden");
}

function ensureCompanionAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!companionAudioCtx) {
    try {
      companionAudioCtx = new AudioCtx();
    } catch (_) {
      return null;
    }
  }
  if (companionAudioCtx.state === "suspended") {
    companionAudioCtx.resume().catch(() => {});
  }
  return companionAudioCtx;
}

function ensureBasePortraitImage(url) {
  if (!url) return Promise.resolve(null);
  if (portraitImageCache.has(url)) {
    return portraitImageCache.get(url);
  }
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  portraitImageCache.set(url, p);
  return p;
}

function releaseScheduledRoiBitmaps() {
  for (const seg of scheduledRoiSegments) {
    if (Array.isArray(seg.frames)) {
      for (const bmp of seg.frames) {
        if (bmp && typeof bmp.close === "function") {
          try {
            bmp.close();
          } catch (_) {}
        }
      }
    }
  }
  scheduledRoiSegments = [];
}

function stopCurrentTalkingPlayback() {
  playbackToken += 1;
  if (roiRafId !== null) {
    cancelAnimationFrame(roiRafId);
    roiRafId = null;
  }
  for (const node of activeAudioNodes) {
    try {
      node.onended = null;
      node.stop();
      node.disconnect();
    } catch (_) {}
  }
  activeAudioNodes = [];
  nextAudioScheduleTime = 0;
  streamDoneReceived = false;
  releaseScheduledRoiBitmaps();
  if (roiTalkCanvas) {
    roiTalkCanvas.classList.remove("active");
  }

  talkingVideo.onended = null;
  talkingVideo.oncanplay = null;
  talkingVideoNext.onended = null;
  talkingVideoNext.oncanplay = null;
  talkingVideo.pause();
  talkingVideoNext.pause();
  talkingVideo.classList.remove("active");
  talkingVideoNext.classList.remove("active");
  speakingBars.classList.add("hidden");
}

// 新しいユーザー操作を始める際、進行中の古い通信・発話を安全に中断して最新リクエストを最優先で通す
function beginNewUserTurn() {
  userTurnToken += 1;
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch (_) {}
  }
  activeAbortController = new AbortController();
  stopCurrentTalkingPlayback();
  ensureCompanionAudioCtx();
  return {
    turnId: userTurnToken,
    signal: activeAbortController.signal,
    turnStartPerfNow: performance.now(),
  };
}

function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function decodePcmS16ToFloat32(pcmB64, prevLastSample = 0.0) {
  if (!pcmB64) return { pcm: new Float32Array(0), lastSample: prevLastSample };
  const u8 = base64ToUint8Array(pcmB64);
  const sampleCount = u8.byteLength >> 1;
  const i16 = new Int16Array(u8.buffer, u8.byteOffset, sampleCount);
  const f32 = new Float32Array(sampleCount);
  const inv = 1.0 / 32768.0;
  for (let i = 0; i < sampleCount; i++) {
    f32[i] = i16[i] * inv;
  }
  // 連続スライス境界では音量を一切落とさずそのまま接続し、別文結合時にステップ不連続がある場合のみ先頭64サンプル(2.6ms)でC1連続デクリック補間
  if (sampleCount > 0) {
    const stepDelta = prevLastSample - f32[0];
    if (Math.abs(stepDelta) > 0.0015) {
      const rampLen = Math.min(64, sampleCount);
      for (let i = 0; i < rampLen; i++) {
        const w = 0.5 * (1.0 + Math.cos((Math.PI * i) / rampLen));
        f32[i] = Math.max(-1.0, Math.min(1.0, f32[i] + stepDelta * w));
      }
    }
  }
  const nextLast = sampleCount > 0 ? f32[sampleCount - 1] : prevLastSample;
  return { pcm: f32, lastSample: nextLast };
}

async function decodeRoiFramesToBitmaps(framesB64) {
  if (!Array.isArray(framesB64) || framesB64.length === 0) return [];
  return Promise.all(
    framesB64.map(async (b64) => {
      const u8 = base64ToUint8Array(b64);
      const blob = new Blob([u8], { type: "image/jpeg" });
      return createImageBitmap(blob);
    })
  );
}

// 実写待機ループ動画の完全衣装同期（着せ替え後に前の服へ戻る現象を物理的に100%防ぐ）
function switchIdleVideo(emotion, customIdleUrl = null, customPosterUrl = null) {
  currentEmotion = emotion || "normal";
  if (customPosterUrl) {
    currentPosterUrl = customPosterUrl;
    if (enterAvatarImg) enterAvatarImg.src = customPosterUrl;
    ensureBasePortraitImage(customPosterUrl);
  }

  const curVid = activeIdleSlot === "a" ? idleVideoA : idleVideoB;
  const subVid = activeIdleSlot === "a" ? idleVideoB : idleVideoA;

  if (currentPosterUrl) {
    curVid.poster = currentPosterUrl;
    subVid.poster = currentPosterUrl;
  }

  // 裏スロットに古い別衣装の動画が残らないよう常にクリア
  subVid.pause();
  subVid.classList.remove("active");
  if (subVid.hasAttribute("src")) {
    subVid.removeAttribute("src");
    subVid.load();
  }

  // 万一カスタム新規生成キャラで待機動画が空文字("")の場合は前の衣装のループ動画を完全消去して新しいposterを表示
  if (customIdleUrl === "") {
    currentIdleUrl = "";
    curVid.pause();
    curVid.removeAttribute("src");
    curVid.load();
    curVid.classList.add("active");
    return;
  }

  if (typeof customIdleUrl === "string" && customIdleUrl.length > 0) {
    currentIdleUrl = customIdleUrl;
  }
  if (!currentIdleUrl) {
    curVid.classList.add("active");
    return;
  }

  if (curVid.getAttribute("src") === currentIdleUrl) {
    curVid.classList.add("active");
    curVid.play().catch(() => {});
    return;
  }

  curVid.src = currentIdleUrl;
  curVid.muted = true;
  curVid.loop = true;
  curVid.classList.add("active");
  curVid.load();
  curVid.play().catch(() => {});
}

// 起動時・リロード時に現在装着中の髪色・服・待機ループ・選択肢を2msで即座に同期
async function preloadInitialCharacterInfo() {
  try {
    const res = await fetch("/api/companion/state", { cache: "no-store" });
    if (res.ok) {
      const state = await res.json();
      applyCompanionState(state, { skipAutoPlayTalking: true });
      if (state.active_character) {
        const styleSub = state.active_character.source_desc
          ? `（${state.active_character.source_desc.replace("着せ替え：", "")}）`
          : "";
        enterTitle.textContent = `${state.partner_name}が部屋で待っています${styleSub}`;
      }
    }
  } catch (_) {}
}
preloadInitialCharacterInfo();

// 2文目フォローアップ動画をバックグラウンドでポーリング取得＆プリロード
async function waitForFollowupVideo(jobId, token) {
  for (let attempt = 0; attempt < 55; attempt++) {
    if (token !== playbackToken) return null;
    try {
      const res = await fetch(`/api/companion/followup/${jobId}`, { cache: "no-store" });
      if (res.ok) {
        const job = await res.json();
        if (job.status === "ready" && job.video_url) {
          return job.video_url;
        }
        if (job.status === "error" || job.status === "cancelled") {
          return null;
        }
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 220));
  }
  return null;
}

// 1文目即再生 ＋ 2文目シームレス連続再生対応の実写リップシンクプレイヤー
function playTalkingVideo(talkingVideoUrl, audioB64Fallback, spokenText, followupJobId = "") {
  stopCurrentTalkingPlayback();
  const myToken = playbackToken;

  const finishAllTalking = () => {
    if (myToken !== playbackToken) return;
    talkingVideo.classList.remove("active");
    talkingVideoNext.classList.remove("active");
    speakingBars.classList.add("hidden");
    const activeIdle = activeIdleSlot === "a" ? idleVideoA : idleVideoB;
    if (currentPosterUrl) activeIdle.poster = currentPosterUrl;
    if (currentIdleUrl && activeIdle.getAttribute("src") !== currentIdleUrl) {
      activeIdle.src = currentIdleUrl;
      activeIdle.load();
    }
    activeIdle.classList.add("active");
    activeIdle.play().catch(() => {});
  };

  if (talkingVideoUrl) {
    let followupPromise = null;
    let followupPreloaded = false;
    if (followupJobId) {
      followupPromise = waitForFollowupVideo(followupJobId, myToken).then((url2) => {
        if (url2 && myToken === playbackToken) {
          talkingVideoNext.src = url2;
          talkingVideoNext.muted = false;
          talkingVideoNext.loop = false;
          talkingVideoNext.load();
          followupPreloaded = true;
        }
        return url2;
      });
    }

    if (currentPosterUrl) {
      talkingVideo.poster = currentPosterUrl;
      talkingVideoNext.poster = currentPosterUrl;
    }
    talkingVideo.src = talkingVideoUrl;
    talkingVideo.muted = false;
    talkingVideo.loop = false;

    talkingVideo.onended = async () => {
      if (myToken !== playbackToken) return;
      if (!followupPromise) {
        finishAllTalking();
        return;
      }
      const url2 = await followupPromise;
      if (!url2 || myToken !== playbackToken) {
        finishAllTalking();
        return;
      }
      if (!followupPreloaded) {
        talkingVideoNext.src = url2;
        talkingVideoNext.muted = false;
        talkingVideoNext.loop = false;
        talkingVideoNext.load();
      }
      talkingVideoNext.onended = finishAllTalking;
      talkingVideoNext.onerror = finishAllTalking;

      const startSecond = () => {
        if (myToken !== playbackToken) return;
        talkingVideoNext.oncanplay = null;
        talkingVideoNext.classList.add("active");
        talkingVideo.classList.remove("active");
        talkingVideoNext.play().catch(finishAllTalking);
      };

      if (talkingVideoNext.readyState >= 3) {
        startSecond();
      } else {
        talkingVideoNext.oncanplay = startSecond;
      }
    };

    talkingVideo.onerror = finishAllTalking;

    talkingVideo.oncanplay = () => {
      if (myToken !== playbackToken) return;
      talkingVideo.oncanplay = null;
      const activeIdle = activeIdleSlot === "a" ? idleVideoA : idleVideoB;
      try {
        if (currentIdleUrl) {
          activeIdle.currentTime = 0.0;
          activeIdle.play().catch(() => {});
        }
      } catch (_) {}

      speakingBars.classList.remove("hidden");
      talkingVideo.classList.add("active");
      talkingVideo.play().catch(() => {
        // ブラウザの自動再生音声制限に引っかかった場合はミュート解除フォールバックまたは字幕維持
        finishAllTalking();
      });
    };

    talkingVideo.load();
    return;
  }

  if (audioB64Fallback) {
    const audio = new Audio("data:audio/wav;base64," + audioB64Fallback);
    audio.onplay = () => speakingBars.classList.remove("hidden");
    audio.onended = () => speakingBars.classList.add("hidden");
    audio.play().catch(() => speakingBars.classList.add("hidden"));
  }
}

function spawnFloatingFx(x, y, symbol = "💗") {
  const el = document.createElement("div");
  el.className = "floating-heart";
  el.textContent = symbol;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

let toastTimer = null;
function showEventToast(text) {
  if (!text) return;
  eventToast.textContent = text;
  eventToast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => eventToast.classList.add("hidden"), 3500);
}

function renderChoiceChips(choices) {
  choicesRow.innerHTML = "";
  (choices || []).forEach((choiceText) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-chip";
    btn.textContent = choiceText;
    btn.onclick = () => sendTalk(choiceText);
    choicesRow.appendChild(btn);
  });
}

// バックエンドからの状態を画面へ一括反映
function applyCompanionState(data, opts = {}) {
  if (!data) return;
  latestState = data;

  const nextIdle = typeof data.idle_video_url === "string" ? data.idle_video_url : null;
  const nextPoster = typeof data.portrait_url === "string" && data.portrait_url ? data.portrait_url : null;
  switchIdleVideo(data.emotion || "normal", nextIdle, nextPoster);

  const unameBadge = data.user_name ? `（${data.user_name}と一緒）` : "";
  partnerNameLabel.textContent = `${data.partner_name || "ひより"}${unameBadge}`;
  if (partnerGenderPill) {
    const pg = data.partner_gender || "female";
    const fp = data.first_person || (pg === "male" ? "俺" : pg === "other" ? "私" : "わたし");
    partnerGenderPill.classList.remove("male", "other");
    if (pg === "male") {
      partnerGenderPill.classList.add("male");
      partnerGenderPill.textContent = `👨 彼氏（${fp}）`;
    } else if (pg === "other") {
      partnerGenderPill.classList.add("other");
      partnerGenderPill.textContent = `🌈 恋人（${fp}）`;
    } else {
      partnerGenderPill.textContent = `👩 彼女（${fp}）`;
    }
  }
  if (data.recommended_voices) {
    recommendedVoicesMap = { ...recommendedVoicesMap, ...data.recommended_voices };
  }
  if (Array.isArray(data.favorite_face_ids)) {
    favoriteFaceIds = data.favorite_face_ids;
  }
  if (Array.isArray(data.face_catalog) && data.face_catalog.length > 0) {
    cachedFaceCatalog = data.face_catalog;
  }
  if (typeof renderFavoriteFacesBar === "function") {
    renderFavoriteFacesBar();
  }
  if (data.recommended_face_by_gender) {
    recommendedFaceByGender = {
      ...recommendedFaceByGender,
      ...data.recommended_face_by_gender,
    };
  }
  if (data.active_character && data.active_character.id) {
    selectedCustomFaceId = data.active_character.id;
  }
  heartMeter.textContent = `💗 ${data.affection ?? 62}`;
  updateCoinDisplay(data.coins ?? 1200);
  memoryPill.textContent = `🧠 記憶 ${data.memories_count || 0}件`;

  if (data.recognized_user_text) {
    showUserHeardText(data.recognized_user_text);
  }

  if (!data.active_character && data.pending_candidates_count > 0) {
    btnOpenCharModal.textContent = `👑 顔を審査 (${data.pending_candidates_count}候補)`;
    btnOpenCharModal.classList.add("pulse-attention");
  } else if (data.active_character) {
    btnOpenCharModal.textContent = `👑 顔(75種)・性別・声カスタム`;
    btnOpenCharModal.classList.remove("pulse-attention");
  }

  if (data.active_voice_name) {
    const shortVoice = data.active_voice_name
      .replace(/^🎙️\s*学習：/, "")
      .replace(/^実在(女性|男性|中性)[①②③④]：/, "")
      .split("（")[0];
    btnOpenVoiceModal.textContent = `🎙️ ${shortVoice}`;
  }

  lightingTint.className = `lighting-tint scene-${data.time_scene || "evening"}`;
  document.querySelectorAll(".scene-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scene === data.time_scene);
  });

  cameraRig.classList.toggle("close-up", Boolean(data.is_close_distance));
  btnDistance.classList.toggle("active", Boolean(data.is_close_distance));
  btnDistance.textContent = data.is_close_distance ? "🛋️ 少し離れる" : "💓 近づく";

  if (data.spoken || !opts.preserveSubtitleIfEmpty) {
    spokenSubtitle.textContent = data.spoken || "";
  }
  if (data.inner_thought && (!opts.preserveSubtitleIfEmpty || data.inner_thought !== "……♪")) {
    thoughtText.textContent = data.inner_thought;
  } else if (!opts.preserveSubtitleIfEmpty) {
    thoughtText.textContent = data.inner_thought || "";
  }
  thoughtBubble.classList.toggle("hidden", !showThought);

  tableGifts.innerHTML = "";
  (data.room_items || []).forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "table-gift-chip";
    chip.title = `${item.name}（プレゼント済み）`;
    chip.textContent = item.emoji;
    tableGifts.appendChild(chip);
  });

  if (!opts.preserveChoicesIfEmpty || (Array.isArray(data.choices) && data.choices.length > 0)) {
    renderChoiceChips(data.choices || []);
  }

  if (data.event_badge) {
    showEventToast(data.event_badge);
  }

  if (!opts.skipAutoPlayTalking && (data.talking_video_url || data.audio_b64)) {
    hasEnteredAndGreeted = true;
    playTalkingVideo(data.talking_video_url, data.audio_b64, data.spoken, data.followup_job_id || "");
  }
}

// ===== Web Audio クロック完全同期 25fps 顔ROI Canvas レンダラ =====
let nextWallScheduleTime = 0;

function startRoiSyncLoop(myPlayToken, turnId) {
  if (roiRafId !== null) {
    cancelAnimationFrame(roiRafId);
    roiRafId = null;
  }
  let lastSegIdx = -1;
  let lastFrameIdx = -1;
  let drawnCharKey = "";

  const tick = () => {
    if (myPlayToken !== playbackToken || turnId !== userTurnToken) {
      roiRafId = null;
      return;
    }

    const useAudioClock = Boolean(companionAudioCtx && companionAudioCtx.state === "running");
    const nowT = useAudioClock ? companionAudioCtx.currentTime : performance.now() / 1000;

    let activeSegIdx = -1;
    for (let i = 0; i < scheduledRoiSegments.length; i++) {
      const s = scheduledRoiSegments[i];
      const sStart = useAudioClock ? s.audioStart : s.wallStart;
      const sEnd = useAudioClock ? s.audioEnd : s.wallEnd;
      if (nowT >= sStart && nowT < sEnd) {
        activeSegIdx = i;
        break;
      }
      if (nowT >= sEnd) {
        activeSegIdx = i;
      }
    }

    if (activeSegIdx >= 0 && roiTalkCanvas && roiTalkCtx) {
      const seg = scheduledRoiSegments[activeSegIdx];
      const segStart = useAudioClock ? seg.audioStart : seg.wallStart;
      if (seg.frames && seg.frames.length > 0 && !seg.released) {
        const elapsed = Math.max(0, nowT - segStart);
        const fIdx = Math.min(seg.frames.length - 1, Math.floor(elapsed * seg.fps));
        if (activeSegIdx !== lastSegIdx || fIdx !== lastFrameIdx) {
          const charKey = `${seg.charId}|${seg.frameW}x${seg.frameH}`;
          if (roiTalkCanvas.width !== seg.frameW || roiTalkCanvas.height !== seg.frameH) {
            roiTalkCanvas.width = seg.frameW;
            roiTalkCanvas.height = seg.frameH;
            drawnCharKey = "";
          }
          if (drawnCharKey !== charKey && seg.baseImg) {
            roiTalkCtx.drawImage(seg.baseImg, 0, 0, seg.frameW, seg.frameH);
            drawnCharKey = charKey;
          }
          const bmp = seg.frames[fIdx];
          if (bmp && seg.w > 0 && seg.h > 0) {
            roiTalkCtx.drawImage(bmp, seg.x, seg.y, seg.w, seg.h);
          }
          lastSegIdx = activeSegIdx;
          lastFrameIdx = fIdx;
        }
      }

      // 再生完了済みの古いチャンクの ImageBitmap を逐次解放して VRAM を一定に保つ
      for (let j = 0; j < activeSegIdx; j++) {
        const oldSeg = scheduledRoiSegments[j];
        if (!oldSeg.released) {
          oldSeg.released = true;
          if (Array.isArray(oldSeg.frames)) {
            for (const bmp of oldSeg.frames) {
              if (bmp && typeof bmp.close === "function") {
                try {
                  bmp.close();
                } catch (_) {}
              }
            }
          }
          oldSeg.frames = [];
        }
      }
    }

    const endTarget = useAudioClock ? nextAudioScheduleTime : nextWallScheduleTime;
    if (streamDoneReceived && nowT >= endTarget + 0.025) {
      roiRafId = null;
      if (roiTalkCanvas) roiTalkCanvas.classList.remove("active");
      speakingBars.classList.add("hidden");
      releaseScheduledRoiBitmaps();

      // 発話終了後は背後の現在衣装待機ループ動画へ0.00秒でシームレス復帰
      const activeIdle = activeIdleSlot === "a" ? idleVideoA : idleVideoB;
      if (currentPosterUrl) activeIdle.poster = currentPosterUrl;
      if (currentIdleUrl && activeIdle.getAttribute("src") !== currentIdleUrl) {
        activeIdle.src = currentIdleUrl;
        activeIdle.load();
      }
      activeIdle.classList.add("active");
      activeIdle.play().catch(() => {});

      if (window.__lastTalkMetrics && window.__lastTalkMetrics.turnId === turnId) {
        window.__lastTalkMetrics.active = false;
        window.__lastTalkMetrics.finished = true;
      }
      return;
    }

    roiRafId = requestAnimationFrame(tick);
  };

  roiRafId = requestAnimationFrame(tick);
}

// ===== NDJSON ストリーミング送受信＆リアルタイム AV チャンク再生コア =====
async function consumeCompanionNdjsonStream(url, fetchOpts, turnId, turnStartPerfNow, hooks = {}) {
  const myPlayToken = playbackToken;
  nextAudioScheduleTime = 0;
  nextWallScheduleTime = 0;
  streamDoneReceived = false;

  const res = await fetch(url, fetchOpts);
  if (turnId !== userTurnToken) return { aborted: true };

  if (!res.ok) {
    let errBody = null;
    try {
      errBody = await res.json();
    } catch (_) {}
    if (hooks.onHttpError) {
      await hooks.onHttpError(res, errBody);
    } else if (turnId === userTurnToken) {
      spokenSubtitle.textContent =
        (errBody && errBody.detail) || "ごめんね、ちょっと通信が詰まっちゃったみたい。もう一回話しかけて？";
    }
    return { ok: false, status: res.status, error: errBody };
  }

  if (hooks.onHttpOk) {
    hooks.onHttpOk(res);
  }

  if (!res.body) {
    return { ok: false };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let textBuf = "";
  let chunkSeqCount = 0;
  let prevPcmLastSample = 0.0;

  const schedulePcmAudioImmediate = (audioCtx, pcmF32, sr, durSec, isFirstChunk) => {
    let audioStart = 0;
    let underrunMs = 0;
    if (audioCtx) {
      const nowCtx = audioCtx.currentTime;
      if (isFirstChunk || nextAudioScheduleTime <= 0) {
        audioStart = nowCtx + 0.018;
      } else {
        if (nowCtx > nextAudioScheduleTime + 0.002) {
          underrunMs = Math.round((nowCtx - nextAudioScheduleTime) * 10000) / 10;
          audioStart = nowCtx + 0.006;
        } else {
          audioStart = nextAudioScheduleTime;
        }
      }
      if (pcmF32.length > 0) {
        const audioBuf = audioCtx.createBuffer(1, pcmF32.length, sr);
        audioBuf.copyToChannel(pcmF32, 0);
        const srcNode = audioCtx.createBufferSource();
        srcNode.buffer = audioBuf;
        srcNode.connect(audioCtx.destination);
        srcNode.start(audioStart);
        activeAudioNodes.push(srcNode);
        srcNode.onended = () => {
          const idx = activeAudioNodes.indexOf(srcNode);
          if (idx >= 0) activeAudioNodes.splice(idx, 1);
        };
      }
      nextAudioScheduleTime = audioStart + durSec;
    }
    const nowWall = performance.now() / 1000;
    const wallStart =
      isFirstChunk || nextWallScheduleTime <= 0
        ? nowWall + 0.018
        : Math.max(nowWall + 0.006, nextWallScheduleTime);
    nextWallScheduleTime = wallStart + durSec;
    return { audioStart, wallStart, underrunMs };
  };

  const processPacket = async (pkt) => {
    if (!pkt || turnId !== userTurnToken || myPlayToken !== playbackToken) return;

    if (pkt.type === "no_speech") {
      if (hooks.onNoSpeech) {
        hooks.onNoSpeech(pkt);
      }
      return;
    }

    if (pkt.type === "state" && pkt.payload) {
      if (pkt.payload.recognized_user_text) {
        lastUserPrompt = pkt.payload.recognized_user_text;
      }
      applyCompanionState(pkt.payload, {
        skipAutoPlayTalking: true,
        preserveSubtitleIfEmpty: Boolean(hooks.preserveSubtitleOnEmptyState),
        preserveChoicesIfEmpty: Boolean(hooks.preserveChoicesOnEmptyState),
      });
      return;
    }

    if (pkt.type === "subtitle") {
      if (pkt.spoken) {
        spokenSubtitle.textContent = pkt.spoken;
        if (latestState) latestState.spoken = pkt.spoken;
      }
      if (pkt.emotion) {
        currentEmotion = pkt.emotion;
        if (latestState) latestState.emotion = pkt.emotion;
      }
      return;
    }

    if (pkt.type === "av_chunk") {
      const roi = pkt.roi || {};
      const framesB64 = roi.frames_b64 || [];
      const sr = Number(pkt.sample_rate || 24000);
      const fps = Number(roi.fps || 25);
      const audioCtx = ensureCompanionAudioCtx();
      if (audioCtx && audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => {});
      }

      const decodedPcm = decodePcmS16ToFloat32(pkt.pcm_s16_b64 || "", prevPcmLastSample);
      prevPcmLastSample = decodedPcm.lastSample;
      const pcmF32 = decodedPcm.pcm;
      const durSec = pcmF32.length > 0 ? pcmF32.length / sr : framesB64.length / fps;

      if (chunkSeqCount === 0) {
        // 初回チャンクは映像と音声が完全同時に始まるよう ImageBitmap デコード完了直後にスケジュール開始
        const [baseImg, bitmaps] = await Promise.all([
          ensureBasePortraitImage(currentPosterUrl),
          decodeRoiFramesToBitmaps(framesB64),
        ]);

        if (turnId !== userTurnToken || myPlayToken !== playbackToken) {
          for (const bmp of bitmaps) {
            if (bmp && typeof bmp.close === "function") {
              try {
                bmp.close();
              } catch (_) {}
            }
          }
          return;
        }

        const { audioStart, wallStart } = schedulePcmAudioImmediate(audioCtx, pcmF32, sr, durSec, true);
        const frameW = Number(roi.frame_w || (baseImg && baseImg.naturalWidth) || 1280);
        const frameH = Number(roi.frame_h || (baseImg && baseImg.naturalHeight) || 720);

        const segObj = {
          seq: pkt.seq ?? 0,
          audioStart,
          audioEnd: audioStart + durSec,
          wallStart,
          wallEnd: wallStart + durSec,
          fps,
          frameW,
          frameH,
          x: Number(roi.x || 0),
          y: Number(roi.y || 0),
          w: Number(roi.w || 0),
          h: Number(roi.h || 0),
          charId: roi.char_id || "",
          baseImg,
          frames: bitmaps,
          released: false,
        };
        scheduledRoiSegments.push(segObj);

        hasEnteredAndGreeted = true;
        activeStreamBaseImg = baseImg;

        const activeIdle = activeIdleSlot === "a" ? idleVideoA : idleVideoB;
        try {
          if (currentIdleUrl) {
            activeIdle.play().catch(() => {});
          }
        } catch (_) {}

        if (roiTalkCanvas && roiTalkCtx) {
          if (roiTalkCanvas.width !== frameW || roiTalkCanvas.height !== frameH) {
            roiTalkCanvas.width = frameW;
            roiTalkCanvas.height = frameH;
          }
          if (baseImg) {
            roiTalkCtx.drawImage(baseImg, 0, 0, frameW, frameH);
          }
          if (bitmaps[0] && segObj.w > 0 && segObj.h > 0) {
            roiTalkCtx.drawImage(bitmaps[0], segObj.x, segObj.y, segObj.w, segObj.h);
          }
          roiTalkCanvas.classList.add("active");
        }
        speakingBars.classList.remove("hidden");

        const firstAvMs = Math.round((performance.now() - turnStartPerfNow) * 10) / 10;
        window.__lastTalkMetrics = {
          turnId,
          url,
          firstAvMs,
          totalChunks: 1,
          totalFrames: bitmaps.length,
          underrunCount: 0,
          maxUnderrunMs: 0,
          totalUnderrunMs: 0,
          charId: segObj.charId,
          active: true,
          finished: false,
          startedAtPerf: performance.now(),
        };

        startRoiSyncLoop(myPlayToken, turnId);
        chunkSeqCount += 1;
        return;
      }

      // 2チャンク目以降は createImageBitmap を待たずに PCM を 0.05ms で即座に WebAudio へギャップレス予約！
      const { audioStart, wallStart, underrunMs } = schedulePcmAudioImmediate(audioCtx, pcmF32, sr, durSec, false);
      const frameW = Number(roi.frame_w || (activeStreamBaseImg && activeStreamBaseImg.naturalWidth) || 1280);
      const frameH = Number(roi.frame_h || (activeStreamBaseImg && activeStreamBaseImg.naturalHeight) || 720);

      const segObj = {
        seq: pkt.seq ?? chunkSeqCount,
        audioStart,
        audioEnd: audioStart + durSec,
        wallStart,
        wallEnd: wallStart + durSec,
        fps,
        frameW,
        frameH,
        x: Number(roi.x || 0),
        y: Number(roi.y || 0),
        w: Number(roi.w || 0),
        h: Number(roi.h || 0),
        charId: roi.char_id || "",
        baseImg: activeStreamBaseImg,
        frames: null,
        released: false,
      };
      scheduledRoiSegments.push(segObj);

      if (window.__lastTalkMetrics && window.__lastTalkMetrics.turnId === turnId) {
        window.__lastTalkMetrics.totalChunks += 1;
        window.__lastTalkMetrics.totalFrames += framesB64.length;
        if (underrunMs > 0) {
          window.__lastTalkMetrics.underrunCount += 1;
          window.__lastTalkMetrics.maxUnderrunMs = Math.max(window.__lastTalkMetrics.maxUnderrunMs, underrunMs);
          window.__lastTalkMetrics.totalUnderrunMs =
            Math.round((window.__lastTalkMetrics.totalUnderrunMs + underrunMs) * 10) / 10;
        }
      }

      // ImageBitmap デコードは再生予定時刻より十分手前でバックグラウンド並列完了させる
      Promise.all([ensureBasePortraitImage(currentPosterUrl), decodeRoiFramesToBitmaps(framesB64)])
        .then(([baseImg, bitmaps]) => {
          if (segObj.released || turnId !== userTurnToken || myPlayToken !== playbackToken) {
            for (const bmp of bitmaps) {
              if (bmp && typeof bmp.close === "function") {
                try {
                  bmp.close();
                } catch (_) {}
              }
            }
            return;
          }
          if (baseImg) segObj.baseImg = baseImg;
          segObj.frames = bitmaps;
        })
        .catch(() => {});

      chunkSeqCount += 1;
      return;
    }

    if (pkt.type === "done") {
      if (latestState) {
        if (pkt.spoken) latestState.spoken = pkt.spoken;
        if (pkt.inner_thought) latestState.inner_thought = pkt.inner_thought;
        if (pkt.emotion) latestState.emotion = pkt.emotion;
        if (typeof pkt.affection === "number") latestState.affection = pkt.affection;
        if (typeof pkt.mood === "number") latestState.mood = pkt.mood;
        if (typeof pkt.user_name === "string") latestState.user_name = pkt.user_name;
        if (typeof pkt.memories_count === "number") latestState.memories_count = pkt.memories_count;
        if (Array.isArray(pkt.latest_memories)) latestState.latest_memories = pkt.latest_memories;
        if (Array.isArray(pkt.choices)) latestState.choices = pkt.choices;
      }

      if (pkt.spoken) spokenSubtitle.textContent = pkt.spoken;
      if (pkt.inner_thought) thoughtText.textContent = pkt.inner_thought;
      if (typeof pkt.affection === "number") heartMeter.textContent = `💗 ${pkt.affection}`;
      if (typeof pkt.memories_count === "number") memoryPill.textContent = `🧠 記憶 ${pkt.memories_count}件`;
      if (typeof pkt.user_name === "string" && latestState) {
        const unameBadge = pkt.user_name ? `（${pkt.user_name}と一緒）` : "";
        partnerNameLabel.textContent = `${latestState.partner_name || "ひより"}${unameBadge}`;
      }
      if (Array.isArray(pkt.choices) && pkt.choices.length > 0) {
        renderChoiceChips(pkt.choices);
      }

      streamDoneReceived = true;
      if (chunkSeqCount === 0) {
        speakingBars.classList.add("hidden");
        if (roiTalkCanvas) roiTalkCanvas.classList.remove("active");
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (turnId !== userTurnToken || myPlayToken !== playbackToken) {
      try {
        await reader.cancel();
      } catch (_) {}
      return { aborted: true };
    }
    textBuf += decoder.decode(value, { stream: true });
    let nlIdx;
    while ((nlIdx = textBuf.indexOf("\n")) >= 0) {
      const line = textBuf.slice(0, nlIdx).trim();
      textBuf = textBuf.slice(nlIdx + 1);
      if (!line) continue;
      let pkt = null;
      try {
        pkt = JSON.parse(line);
      } catch (_) {}
      if (pkt) {
        await processPacket(pkt);
      }
    }
  }

  const tail = (textBuf + decoder.decode()).trim();
  if (tail && turnId === userTurnToken && myPlayToken === playbackToken) {
    try {
      const pkt = JSON.parse(tail);
      await processPacket(pkt);
    } catch (_) {}
  }
  streamDoneReceived = true;
  return { ok: true, chunks: chunkSeqCount };
}

async function sendTalk(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();
  lastUserPrompt = clean;
  giftDrawer.classList.add("hidden");
  showUserHeardText(clean);
  spokenSubtitle.textContent = "（……あなたの言葉を聞いて、嬉しそうに返事を考えています）";

  try {
    await consumeCompanionNdjsonStream(
      "/api/companion/talk_stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal,
      },
      turnId,
      turnStartPerfNow,
      {
        preserveSubtitleOnEmptyState: true,
        preserveChoicesOnEmptyState: true,
      }
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
    if (turnId === userTurnToken) {
      spokenSubtitle.textContent = "通信エラーが起きました。もう一度送信してみてください。";
    }
  }
}

async function sendAction(actionType, value = null) {
  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();
  if (actionType === "pat_head") lastUserPrompt = "（頭をやさしくなでた）";
  if (actionType === "poke_cheek") lastUserPrompt = "（ほっぺをツンッとつついた）";
  if (actionType === "toggle_distance") lastUserPrompt = "（グッと近くまで顔を寄せた）";
  if (actionType === "gift") lastUserPrompt = "（サプライズで差し入れを渡した！）";

  showUserHeardText(lastUserPrompt);
  giftDrawer.classList.add("hidden");
  spokenSubtitle.textContent = "（……ドキッとして反応しています）";

  try {
    await consumeCompanionNdjsonStream(
      "/api/companion/action_stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: actionType, value }),
        signal,
      },
      turnId,
      turnStartPerfNow
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
}

async function triggerRoomInitGreeting() {
  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();
  spokenSubtitle.textContent = "（……あなたが部屋に入ってきたのに気づいて笑顔を向けています）";
  try {
    await consumeCompanionNdjsonStream(
      "/api/companion/init_stream",
      { method: "POST", signal },
      turnId,
      turnStartPerfNow
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
}

// ===== 入室＆着せ替え・オーディション直行ボタン =====
btnEnterRoom.addEventListener("click", async () => {
  ensureCompanionAudioCtx();
  enterOverlay.classList.add("hidden");
  idleVideoA.play().catch(() => {});
  await triggerRoomInitGreeting();
});

btnEnterWardrobe.addEventListener("click", async () => {
  ensureCompanionAudioCtx();
  enterOverlay.classList.add("hidden");
  idleVideoA.play().catch(() => {});
  await openWardrobeModal();
});

btnEnterAudition.addEventListener("click", async () => {
  ensureCompanionAudioCtx();
  enterOverlay.classList.add("hidden");
  idleVideoA.play().catch(() => {});
  await openCharacterStudioModal();
});

// ===== 👑 キャラクター学習生成＆理想のAI恋人カスタムスタジオ制御 =====
function formatCharmLabel(val) {
  const v = parseFloat(val);
  if (v < 0.75) return `${v.toFixed(2)}（落ち着いた控えめ微笑み）`;
  if (v > 1.15) return `${v.toFixed(2)}（とびきり愛嬌たっぷり笑顔）`;
  return `${v.toFixed(2)}（自然な愛嬌・標準）`;
}

function getGenderDisplayTag(g) {
  if (g === "male") return "👨 男性";
  if (g === "other") return "🌈 中性・その他";
  return "👩 女性";
}

function populateCustomVoiceSelect(voices, activeVoiceId, preferredGender) {
  if (!customVoiceSelect) return;
  customVoiceSelect.innerHTML = "";
  const list = Array.isArray(voices) ? voices : [];
  // 現在の性別と一致する声を先頭に並べつつ全ボイスを選択可能にする
  const sorted = [...list].sort((a, b) => {
    const aMatch = (a.gender || "female") === preferredGender ? 0 : 1;
    const bMatch = (b.gender || "female") === preferredGender ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return 0;
  });
  sorted.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    const gTag = getGenderDisplayTag(v.gender || "female");
    const recMark =
      recommendedVoicesMap && recommendedVoicesMap[preferredGender] === v.id
        ? "★推奨 "
        : "";
    opt.textContent = `${recMark}[${gTag}] ${v.name}（${v.dialect || "自然体"}）`;
    if (v.id === activeVoiceId) {
      opt.selected = true;
    }
    customVoiceSelect.appendChild(opt);
  });
}

function populateCustomFaceSelect(faces, activeFaceId, preferredGender) {
  if (!customFaceSelect) return;
  customFaceSelect.innerHTML = "";
  const list = Array.isArray(faces) ? faces : [];
  const sorted = [...list].sort((a, b) => {
    const aMatch = (a.gender || "female") === preferredGender ? 0 : 1;
    const bMatch = (b.gender || "female") === preferredGender ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return 0;
  });
  sorted.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    const gTag = getGenderDisplayTag(f.gender || "female");
    const isFav = favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite);
    const favMark = isFav ? "⭐ " : "";
    const recMark =
      recommendedFaceByGender && recommendedFaceByGender[preferredGender] === f.id
        ? "★代表顔 "
        : "";
    const codePrefix = f.code ? `【${f.code}】` : "";
    const cleanTitle = (f.style_title || f.name || "").replace(/^[FMO]\d{2}\s*/, "");
    opt.textContent = `${favMark}${recMark}${codePrefix}[${gTag}] ${cleanTitle}（${f.category || "顔カタログ"}）`;
    if (f.id === activeFaceId) {
      opt.selected = true;
    }
    customFaceSelect.appendChild(opt);
  });
  if (activeFaceId) {
    selectedCustomFaceId = activeFaceId;
  } else if (sorted.length > 0) {
    selectedCustomFaceId = sorted[0].id;
  }
}

function setActiveGenderButtons(genderKey, autoRecommend = false) {
  const g = ["female", "male", "other"].includes(genderKey) ? genderKey : "female";
  selectedCustomGender = g;
  genderSelectBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.gender === g);
  });
  if (voiceGenderSelect) {
    voiceGenderSelect.value = g;
  }

  if (autoRecommend) {
    // 推奨顔へ自動切替
    const recFaceId =
      (recommendedFaceByGender && recommendedFaceByGender[g]) ||
      (g === "male"
        ? "face_m01_ren"
        : g === "other"
        ? "face_o01_haru"
        : "face_f02_mio");
    const matchedFace = cachedFaceCatalog.find((f) => f.id === recFaceId);
    selectedCustomFaceId = recFaceId;
    populateCustomFaceSelect(cachedFaceCatalog, recFaceId, g);

    // 推奨一人称へ自動切替
    const defaultFp =
      (matchedFace && matchedFace.first_person) ||
      (g === "male" ? "俺" : g === "other" ? "私" : "わたし");
    if (customFirstPerson) {
      customFirstPerson.value = defaultFp;
    }
    // 推奨名へ自動切替
    const nextName =
      (matchedFace && matchedFace.name) ||
      (g === "male" ? "レン" : g === "other" ? "ハル" : "美桜");
    if (customPartnerName) {
      customPartnerName.value = nextName;
      if (charNameInput) charNameInput.value = nextName;
    }
    // 推奨ボイスへ自動切替
    const recVid =
      (matchedFace && matchedFace.voice_id) ||
      (recommendedVoicesMap && recommendedVoicesMap[g]) ||
      (g === "male" ? "human_g0144" : g === "other" ? "human_g0244" : "human_g0143");
    populateCustomVoiceSelect(cachedVoicesList, recVid, g);
    renderFaceCatalogGrid();
  }
}

function selectFaceInStudio(faceItem, syncProfileFields = true) {
  if (!faceItem || !faceItem.id) return;
  selectedCustomFaceId = faceItem.id;
  const fGender = ["female", "male", "other"].includes(faceItem.gender)
    ? faceItem.gender
    : selectedCustomGender;

  if (syncProfileFields) {
    selectedCustomGender = fGender;
    genderSelectBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.gender === fGender);
    });
    if (voiceGenderSelect) {
      voiceGenderSelect.value = fGender;
    }
    if (faceItem.name && customPartnerName) {
      customPartnerName.value = faceItem.name;
      if (charNameInput) charNameInput.value = faceItem.name;
    }
    if (faceItem.first_person && customFirstPerson) {
      customFirstPerson.value = faceItem.first_person;
    }
    const targetVid =
      faceItem.voice_id ||
      (recommendedVoicesMap && recommendedVoicesMap[fGender]) ||
      (customVoiceSelect && customVoiceSelect.value) ||
      "human_g0143";
    populateCustomVoiceSelect(cachedVoicesList, targetVid, fGender);
  }
  populateCustomFaceSelect(cachedFaceCatalog, faceItem.id, selectedCustomGender);
  renderFaceCatalogGrid();
}

if (customFaceSelect) {
  customFaceSelect.addEventListener("change", () => {
    const fid = customFaceSelect.value;
    const fObj = cachedFaceCatalog.find((f) => f.id === fid);
    if (fObj) {
      selectFaceInStudio(fObj, true);
    } else {
      selectedCustomFaceId = fid;
      renderFaceCatalogGrid();
    }
  });
}

genderSelectBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    stopRawPreviewAudio();
    setActiveGenderButtons(btn.dataset.gender || "female", true);
  });
});

faceFilterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentFaceGenderFilter = tab.dataset.faceFilter || "all";
    faceFilterTabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderFaceCatalogGrid();
  });
});

if (customPartnerName && charNameInput) {
  customPartnerName.addEventListener("input", () => {
    charNameInput.value = customPartnerName.value;
  });
  charNameInput.addEventListener("input", () => {
    customPartnerName.value = charNameInput.value;
  });
}

if (btnCustomVoiceRaw) {
  btnCustomVoiceRaw.addEventListener("click", () => {
    const vid = customVoiceSelect ? customVoiceSelect.value : "";
    if (!vid) return;
    if (rawPreviewAudio && rawPreviewVoiceId === vid) {
      stopRawPreviewAudio();
      btnCustomVoiceRaw.textContent = "🔊 原音試聴";
      return;
    }
    stopRawPreviewAudio();
    const aud = new Audio(`/api/companion/voices/raw_sample/${encodeURIComponent(vid)}?t=${Date.now()}`);
    rawPreviewAudio = aud;
    rawPreviewVoiceId = vid;
    btnCustomVoiceRaw.textContent = "⏹️ 停止";
    aud.onended = () => {
      btnCustomVoiceRaw.textContent = "🔊 原音試聴";
      stopRawPreviewAudio();
    };
    aud.play().catch(() => {
      btnCustomVoiceRaw.textContent = "🔊 原音試聴";
      stopRawPreviewAudio();
    });
  });
}

async function applyCustomLoverSettingsImmediate(overrideFaceItem = null, cardEl = null) {
  stopRawPreviewAudio();
  if (overrideFaceItem) {
    selectFaceInStudio(overrideFaceItem, true);
  }
  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();
  if (btnApplyCustomProfile) btnApplyCustomProfile.disabled = true;

  let overlay = null;
  if (cardEl) {
    cardEl.style.position = "relative";
    overlay = document.createElement("div");
    overlay.className = "card-loading-overlay";
    overlay.innerHTML = `<div class="spinner-ring"></div><div>✨ この顔で会話を開始中…</div>`;
    cardEl.appendChild(overlay);
  }

  const pName = (customPartnerName && customPartnerName.value.trim()) || "ひより";
  const fp = (customFirstPerson && customFirstPerson.value) || "わたし";
  const vid = (customVoiceSelect && customVoiceSelect.value) || "";
  const faceId = (customFaceSelect && customFaceSelect.value) || selectedCustomFaceId || "";
  const rawUName = (customUserName && customUserName.value.trim()) || "";
  const uName = rawUName === "あなた" ? "" : rawUName;
  const uGender = (customUserGender && customUserGender.value) || "unspecified";

  charLearnStatus.textContent = `💝『${pName}』（${getGenderDisplayTag(selectedCustomGender)} / 一人称:${fp}）の顔と肉声を反映して会話を開始します…`;
  charLearnStatus.classList.remove("hidden");

  try {
    await consumeCompanionNdjsonStream(
      "/api/companion/profile/customize_stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_gender: selectedCustomGender,
          partner_name: pName,
          first_person: fp,
          voice_id: vid,
          face_id: faceId,
          user_name: uName,
          user_gender: uGender,
        }),
        signal,
      },
      turnId,
      turnStartPerfNow,
      {
        onHttpOk: () => {
          if (btnApplyCustomProfile) btnApplyCustomProfile.disabled = false;
          hasEnteredAndGreeted = true;
          if (enterOverlay) enterOverlay.classList.add("hidden");
          if (turnId === userTurnToken) {
            auditionPreviewVideo.pause();
            charLearnStatus.classList.add("hidden");
            charModal.classList.add("hidden");
          }
        },
        onHttpError: async (_res, errBody) => {
          if (btnApplyCustomProfile) btnApplyCustomProfile.disabled = false;
          if (turnId === userTurnToken) {
            charLearnStatus.textContent = `⚠️ ${(errBody && errBody.detail) || "設定反映に失敗しました"}`;
          }
        },
      }
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
    charLearnStatus.textContent = "⚠️ 通信エラーが発生しました。";
  } finally {
    if (btnApplyCustomProfile) btnApplyCustomProfile.disabled = false;
    if (overlay) overlay.remove();
  }
}

if (btnApplyCustomProfile) {
  btnApplyCustomProfile.addEventListener("click", () => {
    applyCustomLoverSettingsImmediate(null, null);
  });
}

charmSlider.addEventListener("input", () => {
  charmValLabel.textContent = formatCharmLabel(charmSlider.value);
});

btnApplyCharm.addEventListener("click", async () => {
  const { turnId, signal } = beginNewUserTurn();
  btnApplyCharm.disabled = true;
  charLearnStatus.textContent = "😊 表情と目元の愛嬌バランスを更新して実写プレビューを生成中…";
  charLearnStatus.classList.remove("hidden");
  try {
    const res = await fetch("/api/companion/expression/tune", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charm_level: parseFloat(charmSlider.value) }),
      signal,
    });
    if (turnId !== userTurnToken) return;
    if (res.ok) {
      const data = await res.json();
      charLearnStatus.classList.add("hidden");
      charModal.classList.add("hidden");
      applyCompanionState(data);
    }
  } catch (_) {
  } finally {
    btnApplyCharm.disabled = false;
  }
});

async function runFaceCatalogAuditionPreview(faceItem) {
  if (!faceItem || !faceItem.id) return;
  selectFaceInStudio(faceItem, false);
  const chosenVid =
    (customVoiceSelect && customVoiceSelect.value) || faceItem.voice_id || "";
  const chosenGender = faceItem.gender || selectedCustomGender || "female";
  const labelText = faceItem.style_title || faceItem.name;
  charLearnStatus.textContent = `🎬『${labelText}』の顔×選択中の声×愛嬌度(${parseFloat(charmSlider.value).toFixed(2)})でテスト発話・まばたき動画を生成中…（約3〜5秒）`;
  charLearnStatus.classList.remove("hidden");
  charLearnStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const res = await fetch("/api/companion/characters/preview_audition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        face_id: faceItem.id,
        charm_level: parseFloat(charmSlider.value),
        voice_id: chosenVid,
        gender: chosenGender,
      }),
    });
    if (!res.ok) {
      charLearnStatus.textContent = "⚠️ 試写プレビュー生成に失敗しました。";
      return;
    }
    const data = await res.json();
    auditionPreviewPanel.classList.remove("hidden");
    auditionPreviewLabel.textContent = `🎬 試写中：${labelText}（愛嬌度 ${data.charm_level}）— まばたき・表情・声を確認して良ければ「✨ この顔で話す」を押してください`;
    auditionPreviewVideo.src = data.preview_video_url;
    auditionPreviewPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    auditionPreviewVideo.play().catch(() => {});
    charLearnStatus.classList.add("hidden");
  } catch (_) {
    charLearnStatus.textContent = "⚠️ 試写プレビュー通信中にエラーが発生しました。";
  }
}

function renderFavoriteFacesBar() {
  const allFaces = Array.isArray(cachedFaceCatalog) ? cachedFaceCatalog : [];
  const favFaces = allFaces.filter((f) => favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite));
  const favCount = favFaces.length > 0 ? favFaces.length : favoriteFaceIds.length;
  const unselectedCount = allFaces.filter((f) => !(favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite))).length;

  if (faceFilterTabFavs) {
    faceFilterTabFavs.textContent = `⭐ 好み選抜済み (${favCount})`;
  }
  if (faceFilterTabNew) {
    faceFilterTabNew.textContent = `🆕 新候補・未選抜 (${unselectedCount})`;
  }
  if (!favoriteFacesSummary) return;

  if (favFaces.length === 0) {
    favoriteFacesSummary.innerHTML = `<span style="opacity:0.8">⭐ 好み選抜中 (0種): 各カードの「☆ 好み選抜」を押すとここにお気に入りリストが集まります</span>`;
    return;
  }

  favoriteFacesSummary.innerHTML = "";
  const labelSpan = document.createElement("strong");
  labelSpan.textContent = `⭐ 好み選抜中 (${favFaces.length}種): `;
  favoriteFacesSummary.appendChild(labelSpan);

  favFaces.forEach((f) => {
    const chip = document.createElement("span");
    chip.className = "fav-pill-chip";
    chip.title = "クリックでこの顔を選択";
    chip.textContent = `${f.code ? `【${f.code}】` : ""}${f.name}`;
    chip.onclick = () => {
      selectFaceInStudio(f, true);
    };
    favoriteFacesSummary.appendChild(chip);
  });
}

async function toggleFavoriteFace(faceItem) {
  if (!faceItem || !faceItem.id) return;
  try {
    const res = await fetch("/api/companion/faces/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ face_id: faceItem.id }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.favorite_face_ids)) {
      favoriteFaceIds = data.favorite_face_ids;
    }
    if (Array.isArray(data.face_catalog)) {
      cachedFaceCatalog = data.face_catalog;
    } else {
      cachedFaceCatalog.forEach((f) => {
        if (f.id === faceItem.id) {
          f.is_favorite = Boolean(data.is_favorite);
        }
      });
    }
    renderFavoriteFacesBar();
    populateCustomFaceSelect(cachedFaceCatalog, selectedCustomFaceId, selectedCustomGender);
    renderFaceCatalogGrid();
  } catch (_) {}
}

if (btnCopyFavoriteFaces) {
  btnCopyFavoriteFaces.addEventListener("click", async () => {
    const allFaces = Array.isArray(cachedFaceCatalog) ? cachedFaceCatalog : [];
    const favFaces = allFaces.filter((f) => favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite));
    if (favFaces.length === 0) {
      charLearnStatus.textContent = "💡 まだ好み選抜（⭐）された顔がありません。各カードの「☆ 好み選抜」ボタンを押してキープしてください。";
      charLearnStatus.classList.remove("hidden");
      return;
    }
    const codesText = favFaces.map((f) => `${f.code || f.id}(${f.name})`).join(", ");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(codesText);
      }
    } catch (_) {}
    btnCopyFavoriteFaces.textContent = "✅ 選抜番号をコピーしました！";
    charLearnStatus.textContent = `📋 好み選抜リスト（${favFaces.length}種）をコピーしました： ${codesText}`;
    charLearnStatus.classList.remove("hidden");
    setTimeout(() => {
      btnCopyFavoriteFaces.textContent = "📋 選抜した番号一覧をコピー";
    }, 2400);
  });
}

function renderFaceCatalogGrid() {
  if (!faceCatalogGrid) return;
  faceCatalogGrid.innerHTML = "";
  const allFaces = Array.isArray(cachedFaceCatalog) ? cachedFaceCatalog : [];
  const filtered = allFaces.filter((f) => {
    if (currentFaceGenderFilter === "all") return true;
    if (currentFaceGenderFilter === "foreign") {
      return f.origin === "foreign";
    }
    if (currentFaceGenderFilter === "japanese") {
      return f.origin === "japanese";
    }
    if (currentFaceGenderFilter === "favorites") {
      return favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite);
    }
    if (currentFaceGenderFilter === "unselected") {
      return Boolean(f.is_new_candidate) || !(favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite));
    }
    return (f.gender || "female") === currentFaceGenderFilter;
  });

  if (filtered.length === 0) {
    if (currentFaceGenderFilter === "favorites") {
      faceCatalogGrid.innerHTML = `<div class="empty-hint">まだ好み選抜（⭐）された顔がありません。各カードの右上「☆ 好み選抜」ボタンを押すとここにお気に入りリストが集まります。</div>`;
    } else if (currentFaceGenderFilter === "unselected") {
      faceCatalogGrid.innerHTML = `<div class="empty-hint">すべての候補が選抜済み（⭐）になっています！</div>`;
    } else {
      faceCatalogGrid.innerHTML = `<div class="empty-hint">該当する顔がありません。</div>`;
    }
    return;
  }

  filtered.forEach((f, idx) => {
    const isCurrentActive = Boolean(f.active);
    const isStudioSelected = f.id === selectedCustomFaceId;
    const isFav = favoriteFaceIds.includes(f.id) || Boolean(f.is_favorite);
    const isNewCand = Boolean(f.is_new_candidate);
    const card = document.createElement("div");
    card.className = `char-card face-catalog-card ${isCurrentActive ? "active-char" : ""} ${
      isStudioSelected ? "selected-face" : ""
    } ${isFav ? "favorite-face" : ""} ${isNewCand ? "new-candidate-face" : ""}`;
    card.dataset.faceId = f.id;
    card.dataset.faceCode = f.code || "";
    card.dataset.faceGender = f.gender || "female";

    const gTag = getGenderDisplayTag(f.gender || "female");
    let badgeText = isNewCand ? `🆕 新候補 (${gTag})` : gTag;
    let badgeCls = isNewCand ? "tag-selected" : "";
    if (isCurrentActive) {
      badgeText = "現在会話中 ✨";
      badgeCls = "tag-active";
    } else if (isStudioSelected) {
      badgeText = "選択中 💖";
      badgeCls = "tag-selected";
    }

    const codeLabel = f.code ? `<span class="char-code-badge">${f.code}</span>` : "";
    const cleanCardTitle = (f.style_title || f.name || "").replace(/^[FMO]\d{2}\s*/, "");
    const loadingAttr = idx < 18 || filtered.length <= 24 ? "eager" : "lazy";

    card.innerHTML = `
      <div class="char-img-wrap" style="cursor:pointer" title="クリックでこの顔を選択">
        <img src="${f.thumb_url || f.portrait_url}" alt="${cleanCardTitle}" loading="${loadingAttr}" decoding="async" />
        <span class="char-tag ${badgeCls}">${badgeText}</span>
        <button type="button" class="btn-fav-toggle ${isFav ? "active" : ""}" title="クリックで好み選抜リストにキープ／解除">
          ${isFav ? "⭐ 選抜済" : "☆ 好み選抜"}
        </button>
        ${codeLabel}
        <span class="char-category-badge">${f.category || gTag}</span>
      </div>
      <div class="char-card-body">
        <div class="char-style-title">${f.code ? `【${f.code}】` : ""}${cleanCardTitle}</div>
        <div class="char-source-sub">${f.source_desc || ""}</div>
        <div class="char-card-btns">
          <button type="button" class="btn-audition-play">▶ 試写</button>
          <button type="button" class="btn-approve-face btn-use-face-now">
            ${isCurrentActive ? "✨ この顔で話す" : "💝 この顔で話す"}
          </button>
        </div>
      </div>
    `;

    card.querySelector(".char-img-wrap").onclick = () => {
      selectFaceInStudio(f, true);
    };
    const favBtn = card.querySelector(".btn-fav-toggle");
    if (favBtn) {
      favBtn.onclick = (ev) => {
        ev.stopPropagation();
        toggleFavoriteFace(f);
      };
    }
    card.querySelector(".btn-audition-play").onclick = (ev) => {
      ev.stopPropagation();
      runFaceCatalogAuditionPreview(f);
    };
    card.querySelector(".btn-use-face-now").onclick = (ev) => {
      ev.stopPropagation();
      applyCustomLoverSettingsImmediate(f, card);
    };
    faceCatalogGrid.appendChild(card);
  });
}

async function runCandidateAuditionPreview(candidateId, labelText) {
  const chosenVid = customVoiceSelect ? customVoiceSelect.value : "";
  const chosenFp = customFirstPerson ? customFirstPerson.value : "";
  charLearnStatus.textContent = `🎬『${labelText}』の顔×選択中の声×愛嬌度(${parseFloat(charmSlider.value).toFixed(2)})でテスト発話・まばたき動画を生成中…（約3〜5秒）`;
  charLearnStatus.classList.remove("hidden");
  charLearnStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const res = await fetch("/api/companion/characters/preview_audition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_id: candidateId,
        charm_level: parseFloat(charmSlider.value),
        voice_id: chosenVid,
        gender: selectedCustomGender,
        first_person: chosenFp,
      }),
    });
    if (!res.ok) {
      charLearnStatus.textContent = "⚠️ 試写プレビュー生成に失敗しました。";
      return;
    }
    const data = await res.json();
    auditionPreviewPanel.classList.remove("hidden");
    auditionPreviewLabel.textContent = `🎬 試写中：${labelText}（愛嬌度 ${data.charm_level}）— まばたき・表情・声を確認して良ければ「✅ 合格・採用」を押してください`;
    auditionPreviewVideo.src = data.preview_video_url;
    auditionPreviewPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    auditionPreviewVideo.play().catch(() => {});
    charLearnStatus.classList.add("hidden");
  } catch (_) {
    charLearnStatus.textContent = "⚠️ 試写プレビュー通信中にエラーが発生しました。";
  }
}

async function approveCandidateFace(candidateId, cardEl = null) {
  const { turnId, signal } = beginNewUserTurn();
  const cname =
    (customPartnerName && customPartnerName.value.trim()) ||
    charNameInput.value.trim() ||
    "ひより";
  const chosenFp = customFirstPerson ? customFirstPerson.value : "";
  const chosenVid = customVoiceSelect ? customVoiceSelect.value : "";
  let overlay = null;
  if (cardEl) {
    cardEl.style.position = "relative";
    overlay = document.createElement("div");
    overlay.className = "card-loading-overlay";
    overlay.innerHTML = `<div class="spinner-ring"></div><div>✅『${cname}』として採用中…</div>`;
    cardEl.appendChild(overlay);
  }
  charLearnStatus.textContent = `✅ あなたが合格を出した顔を『${cname}』（${getGenderDisplayTag(selectedCustomGender)}）として正式採用し、待機映像と挨拶を準備しています…`;
  charLearnStatus.classList.remove("hidden");
  try {
    const res = await fetch("/api/companion/characters/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_id: candidateId,
        character_name: cname,
        gender: selectedCustomGender,
        first_person: chosenFp,
        voice_id: chosenVid,
      }),
      signal,
    });
    if (turnId !== userTurnToken) return;
    if (res.ok) {
      const stateData = await res.json();
      auditionPreviewVideo.pause();
      charLearnStatus.classList.add("hidden");
      charModal.classList.add("hidden");
      applyCompanionState(stateData);
    } else {
      const err = await res.json();
      charLearnStatus.textContent = `⚠️ ${err.detail || "採用処理に失敗しました"}`;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
    charLearnStatus.textContent = "⚠️ 通信エラーが発生しました。";
  } finally {
    if (overlay) overlay.remove();
  }
}

async function refreshCharacterStudio() {
  const [res, vRes] = await Promise.all([
    fetch("/api/companion/characters", { cache: "no-store" }),
    fetch("/api/companion/voices", { cache: "no-store" }),
  ]);
  if (!res.ok) return;
  const payload = await res.json();
  if (vRes && vRes.ok) {
    const vData = await vRes.json();
    cachedVoicesList = vData.voices || [];
    if (vData.recommended_by_gender) {
      recommendedVoicesMap = vData.recommended_by_gender;
    }
  } else if (Array.isArray(payload.voices)) {
    cachedVoicesList = payload.voices;
    if (payload.recommended_by_gender) {
      recommendedVoicesMap = payload.recommended_by_gender;
    }
  }

  if (Array.isArray(payload.favorite_face_ids)) {
    favoriteFaceIds = payload.favorite_face_ids;
  }
  if (Array.isArray(payload.face_catalog)) {
    cachedFaceCatalog = payload.face_catalog;
  }
  if (payload.recommended_face_by_gender) {
    recommendedFaceByGender = payload.recommended_face_by_gender;
  }

  const pGender = payload.partner_gender || (latestState && latestState.partner_gender) || "female";
  const pName = payload.partner_name || (latestState && latestState.partner_name) || "ひより";
  const pFp = payload.first_person || (latestState && latestState.first_person) || "わたし";
  const rawUName = payload.user_name || (latestState && latestState.user_name) || "";
  const uName = rawUName === "あなた" ? "" : rawUName;
  const uGender = payload.user_gender || (latestState && latestState.user_gender) || "unspecified";
  const activeVid = payload.active_voice_id || (latestState && latestState.active_voice_id) || "human_g0143";
  const rawActiveId = payload.active_character && payload.active_character.id;
  const inCatalog = rawActiveId && cachedFaceCatalog.some((f) => f.id === rawActiveId);
  const activeFaceId =
    (inCatalog ? rawActiveId : null) ||
    (recommendedFaceByGender && recommendedFaceByGender[pGender]) ||
    "face_f02_mio";

  setActiveGenderButtons(pGender, false);
  selectedCustomFaceId = activeFaceId;
  renderFavoriteFacesBar();
  populateCustomFaceSelect(cachedFaceCatalog, activeFaceId, pGender);
  if (customPartnerName) customPartnerName.value = pName;
  if (charNameInput) charNameInput.value = pName;
  if (customFirstPerson) customFirstPerson.value = pFp;
  if (customUserName) customUserName.value = uName;
  if (customUserGender) customUserGender.value = uGender;
  populateCustomVoiceSelect(cachedVoicesList, activeVid, pGender);
  renderFaceCatalogGrid();

  if (payload.charm_level) {
    charmSlider.value = payload.charm_level;
    charmValLabel.textContent = formatCharmLabel(payload.charm_level);
  }
  if (payload.default_folder && !charFolderInput.value.trim()) {
    charFolderInput.value = payload.default_folder;
  }

  candidateGrid.innerHTML = "";
  const cands = payload.candidates || [];
  if (cands.length === 0) {
    candidateGrid.innerHTML = `<div class="empty-hint">下の Step 3 から好きな写真またはフォルダを読み込むと、ここに写真審査用の顔候補が並びます。</div>`;
  } else {
    cands.forEach((c, idx) => {
      const card = document.createElement("div");
      card.className = "char-card candidate-card";
      const gTag = getGenderDisplayTag(c.gender || pGender);
      card.innerHTML = `
        <div class="char-img-wrap" style="cursor:pointer" title="クリックで試写プレビュー">
          <img src="${c.thumb_url || c.portrait_url}" alt="候補${idx + 1}" loading="lazy" />
          <span class="char-tag">候補 #${idx + 1} (${gTag})</span>
        </div>
        <div class="char-card-body">
          <div class="char-style-title">${c.style_label || c.style}</div>
          <div class="char-source-sub">${c.source_desc || ""}</div>
          <div class="char-card-btns">
            <button type="button" class="btn-audition-play">▶ 試写（表情・声）</button>
            <button type="button" class="btn-approve-face">✅ 合格・採用</button>
          </div>
        </div>
      `;
      card.querySelector(".char-img-wrap").onclick = () =>
        runCandidateAuditionPreview(c.candidate_id, `候補 #${idx + 1}（${c.style_label}）`);
      card.querySelector(".btn-audition-play").onclick = () =>
        runCandidateAuditionPreview(c.candidate_id, `候補 #${idx + 1}（${c.style_label}）`);
      card.querySelector(".btn-approve-face").onclick = () => approveCandidateFace(c.candidate_id, card);
      candidateGrid.appendChild(card);
    });
  }

  const chars = (payload.characters || []).filter((ch) => !ch.builtin_face_catalog);
  approvedSectionWrap.classList.toggle("hidden", chars.length === 0);
  approvedCharGrid.innerHTML = "";
  chars.forEach((ch) => {
    const card = document.createElement("div");
    card.className = `char-card ${ch.active ? "active-char" : ""}`;
    card.style.cursor = "pointer";
    const gTag = getGenderDisplayTag(ch.gender || "female");
    card.innerHTML = `
      <div class="char-img-wrap">
        <img src="${ch.thumb_url || ch.portrait_url}" alt="${ch.name}" loading="lazy" />
        <span class="char-tag ${ch.active ? "tag-active" : ""}">${ch.active ? "採用中 ✨" : "合格済"}</span>
      </div>
      <div class="char-card-body">
        <div class="char-style-title">${ch.name} <small style="opacity:0.8">(${gTag})</small></div>
        <div class="char-source-sub">${ch.source_desc || ""}</div>
        <div class="char-card-btns">
          <button type="button" class="btn-approve-face">
            ${ch.active ? "✨ この姿で会話する" : "🔄 この姿に切替"}
          </button>
        </div>
      </div>
    `;
    card.onclick = async () => {
      const { turnId, signal } = beginNewUserTurn();
      card.style.position = "relative";
      const overlay = document.createElement("div");
      overlay.className = "card-loading-overlay";
      overlay.innerHTML = `<div class="spinner-ring"></div><div>🔄 切り替え中…</div>`;
      card.appendChild(overlay);
      try {
        const selRes = await fetch("/api/companion/characters/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character_id: ch.id }),
          signal,
        });
        if (turnId !== userTurnToken) return;
        if (selRes.ok) {
          const stateData = await selRes.json();
          charLearnStatus.classList.add("hidden");
          charModal.classList.add("hidden");
          applyCompanionState(stateData);
        }
      } catch (_) {
      } finally {
        overlay.remove();
      }
    };
    approvedCharGrid.appendChild(card);
  });
}

async function openCharacterStudioModal() {
  stopCurrentTalkingPlayback();
  stopRawPreviewAudio();
  if (enterOverlay) enterOverlay.classList.add("hidden");
  charLearnStatus.classList.add("hidden");
  await refreshCharacterStudio();
  charModal.classList.remove("hidden");
}

function closeCharacterStudioModal() {
  stopRawPreviewAudio();
  auditionPreviewVideo.pause();
  charModal.classList.add("hidden");
  if (!hasEnteredAndGreeted) {
    triggerRoomInitGreeting();
  }
}

btnOpenCharModal.addEventListener("click", openCharacterStudioModal);
if (partnerGenderPill) {
  partnerGenderPill.addEventListener("click", openCharacterStudioModal);
}
btnCloseCharModal.addEventListener("click", closeCharacterStudioModal);
btnCloseCharModalTop.addEventListener("click", closeCharacterStudioModal);

function setSelectedCharImageFiles(fileList) {
  selectedCharFiles = Array.from(fileList || []).filter(
    (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name)
  );
  if (selectedCharFiles.length > 0) {
    charFilesLabel.innerHTML = `✅ <strong>${selectedCharFiles.length}枚</strong>の顔画像を選択中（クリックで変更可）<br/><small>下のボタンを押すと選択中の性別（${getGenderDisplayTag(selectedCustomGender)}）に合わせて全画像から本人特徴を学習し、審査用の顔候補を生成します</small>`;
  }
}

charFilesInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    setSelectedCharImageFiles(e.target.files);
  }
});

charDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  charDropzone.classList.add("dragover");
});
charDropzone.addEventListener("dragleave", () => {
  charDropzone.classList.remove("dragover");
});
charDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  charDropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    setSelectedCharImageFiles(e.dataTransfer.files);
  }
});

charLearnForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const folderVal = charFolderInput.value.trim();
  if (selectedCharFiles.length === 0 && !folderVal) {
    charLearnStatus.textContent = "⚠️ 複数枚の顔画像をドロップするか、ローカル画像フォルダのパスを入力してください。";
    charLearnStatus.classList.remove("hidden");
    return;
  }

  btnSubmitCharLearn.disabled = true;
  const cname =
    (customPartnerName && customPartnerName.value.trim()) ||
    charNameInput.value.trim() ||
    "ひより";
  const fp = (customFirstPerson && customFirstPerson.value) || "わたし";
  const vid = (customVoiceSelect && customVoiceSelect.value) || "";
  charLearnStatus.textContent = `🧬 全画像の顔特徴・骨格・肌トーンを『${getGenderDisplayTag(selectedCustomGender)}』モードでGPU学習し、審査用候補を生成中…（約6〜12秒）`;
  charLearnStatus.classList.remove("hidden");

  try {
    const fd = new FormData();
    fd.append("character_name", cname);
    fd.append("folder_path", folderVal);
    fd.append("gender", selectedCustomGender);
    fd.append("first_person", fp);
    fd.append("voice_id", vid);
    selectedCharFiles.forEach((f) => fd.append("files", f));

    const res = await fetch("/api/companion/characters/generate_candidates", {
      method: "POST",
      body: fd,
    });
    const payload = await res.json();
    if (!res.ok) {
      charLearnStatus.textContent = `⚠️ ${payload.detail || "候補生成に失敗しました"}`;
      return;
    }

    selectedCharFiles = [];
    charFilesLabel.innerHTML =
      "📸 ここに複数枚の顔画像をドラッグ＆ドロップ（またはクリックして選択）<br/><small>※ファイル未選択時は上のフォルダパス内の全画像から自動で顔特徴を学習します</small>";
    await refreshCharacterStudio();
    charLearnStatus.textContent = `✨ ${payload.message}`;
    charLearnStatus.classList.remove("hidden");
  } catch (_) {
    charLearnStatus.textContent = "⚠️ 通信エラーが発生しました。フォルダパスまたは画像を確認してください。";
  } finally {
    btnSubmitCharLearn.disabled = false;
  }
});

// ===== 基本スキンシップ・ツールバー・常時表示チャット送信 =====
document.getElementById("touch-head").addEventListener("click", (e) => {
  spawnFloatingFx(e.clientX, e.clientY, "💗");
  sendAction("pat_head");
});

document.getElementById("touch-cheek").addEventListener("click", (e) => {
  spawnFloatingFx(e.clientX, e.clientY, "✨");
  sendAction("poke_cheek");
});

btnToggleThought.addEventListener("click", () => {
  showThought = !showThought;
  btnToggleThought.classList.toggle("active", showThought);
  btnToggleThought.textContent = showThought ? "💭 ホンネ ON" : "💭 ホンネ OFF";
  thoughtBubble.classList.toggle("hidden", !showThought);
});

document.querySelectorAll(".scene-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    lastUserPrompt = `（シチュエーション：${btn.textContent}）`;
    sendAction("set_scene", btn.dataset.scene);
  });
});

btnGiftMenu.addEventListener("click", () => {
  giftDrawer.classList.toggle("hidden");
});

document.querySelectorAll(".gift-item-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    spawnFloatingFx(window.innerWidth * 0.5, window.innerHeight * 0.45, "🎁");
    sendAction("gift", btn.dataset.gift);
  });
});

btnDistance.addEventListener("click", () => sendAction("toggle_distance"));

freeInputForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = freeInputText.value.trim();
  if (!txt) {
    freeInputText.focus();
    return;
  }
  freeInputText.value = "";
  sendTalk(txt);
});

// ===== 👗 髪色・服・スタイル着せ替えクローゼット ＆ プレミアム課金ショップ制御 =====
let isEquippingWardrobe = false;

function renderWardrobeCards(styles, coins) {
  updateCoinDisplay(coins);
  wardrobeGrid.innerHTML = "";

  (styles || []).forEach((st) => {
    if (st.portrait_url) {
      ensureBasePortraitImage(st.portrait_url);
    }
    const isFree = st.tier === "free" || st.price_coins === 0;
    const isUnlocked = Boolean(st.unlocked);
    const isEquipped = Boolean(st.equipped);

    const card = document.createElement("div");
    card.className = `wardrobe-card ${isEquipped ? "equipped" : ""} ${!isUnlocked ? "locked" : ""}`;
    card.dataset.styleKey = st.style_key;

    let btnHtml = "";
    if (isEquipped) {
      btnHtml = `<button type="button" class="btn-equip-current">✨ 現在装着中（クリックでこの姿のまま話す）</button>`;
    } else if (isUnlocked) {
      btnHtml = `<button type="button" class="btn-equip-free">👗 この髪色・服に着替える（解放済）</button>`;
    } else {
      btnHtml = `<button type="button" class="btn-unlock-premium">💎 ${st.price_coins}コインで解放して着せ替える（💗+6）</button>`;
    }

    card.innerHTML = `
      <div class="char-img-wrap">
        <img src="${st.portrait_url}" alt="${st.short_title}" loading="lazy" />
        <span class="wardrobe-badge ${isFree ? "free" : "premium"}">${st.badge}</span>
        ${isEquipped ? `<span class="wardrobe-equipped-pill">装着中 ✨</span>` : ""}
      </div>
      <div class="char-card-body">
        <div class="char-style-title">${st.short_title}</div>
        <div class="wardrobe-tags">
          <span class="wardrobe-tag-chip">💇‍♀️ ${st.hair_tag}</span>
          <span class="wardrobe-tag-chip">👗 ${st.outfit_tag}</span>
        </div>
        <div class="char-card-btns">
          ${btnHtml}
        </div>
      </div>
    `;

    // 写真・タイトル・ボタンのどこをクリックしても確実に即お着替え反応する
    card.onclick = (ev) => {
      ev.preventDefault();
      equipOrUnlockStyle(st, card);
    };
    wardrobeGrid.appendChild(card);
  });
}

async function refreshWardrobe() {
  const res = await fetch("/api/companion/wardrobe", { cache: "no-store" });
  if (!res.ok) return;
  const payload = await res.json();
  renderWardrobeCards(payload.styles || [], payload.coins ?? 1200);
}

async function equipOrUnlockStyle(st, cardEl = null) {
  if (isEquippingWardrobe) return;
  isEquippingWardrobe = true;
  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();

  const isUnlocked = Boolean(st.unlocked);
  const price = Number(st.price_coins || 0);
  const currentCoins = Number((latestState && latestState.coins) ?? 1200);
  const canAfford = isUnlocked || st.tier === "free" || price === 0 || currentCoins >= price;

  const msg = isUnlocked
    ? `👗『${st.short_title}』にお着替え中…`
    : `💎 ${st.price_coins}コインで『${st.short_title}』を解放してお着替え中…`;

  wardrobeStatus.textContent = msg;
  wardrobeStatus.classList.remove("hidden");

  let overlay = null;
  if (cardEl) {
    overlay = document.createElement("div");
    overlay.className = "card-loading-overlay";
    overlay.innerHTML = `<div class="spinner-ring"></div><div>${msg}</div>`;
    cardEl.appendChild(overlay);
  }

  // 解放済みまたはコイン十分時は押した瞬間に背景の待機映像も先行して新衣装へ即切替！
  if (canAfford && st.portrait_url) {
    switchIdleVideo("happy", typeof st.idle_video_url === "string" ? st.idle_video_url : "", st.portrait_url);
  }

  try {
    await consumeCompanionNdjsonStream(
      "/api/companion/wardrobe/equip_stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_key: st.style_key }),
        signal,
      },
      turnId,
      turnStartPerfNow,
      {
        onHttpOk: () => {
          if (overlay) {
            overlay.remove();
            overlay = null;
          }
          isEquippingWardrobe = false;
          if (turnId === userTurnToken) {
            wardrobeStatus.classList.add("hidden");
            wardrobeModal.classList.add("hidden");
          }
        },
        onHttpError: async (_res, errBody) => {
          if (turnId === userTurnToken) {
            wardrobeStatus.textContent = `⚠️ ${(errBody && errBody.detail) || "お着替えに失敗しました"}`;
            if (latestState && latestState.portrait_url) {
              switchIdleVideo(
                latestState.emotion || "normal",
                typeof latestState.idle_video_url === "string" ? latestState.idle_video_url : "",
                latestState.portrait_url
              );
            }
          }
        },
      }
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
    wardrobeStatus.textContent = "⚠️ 通信エラーが発生しました。もう一度お試しください。";
  } finally {
    if (overlay) overlay.remove();
    isEquippingWardrobe = false;
  }
}

async function openWardrobeModal() {
  stopCurrentTalkingPlayback();
  wardrobeStatus.classList.add("hidden");
  await refreshWardrobe();
  wardrobeModal.classList.remove("hidden");
}

function closeWardrobeModal() {
  wardrobeModal.classList.add("hidden");
  if (!hasEnteredAndGreeted) {
    triggerRoomInitGreeting();
  }
}

btnOpenWardrobeModal.addEventListener("click", openWardrobeModal);
btnWardrobeBottom.addEventListener("click", openWardrobeModal);
coinPill.addEventListener("click", openWardrobeModal);
btnCloseWardrobeTop.addEventListener("click", closeWardrobeModal);
btnCloseWardrobe.addEventListener("click", closeWardrobeModal);

btnTopupCoins.addEventListener("click", async () => {
  btnTopupCoins.disabled = true;
  try {
    const res = await fetch("/api/companion/wardrobe/topup_coins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 1000 }),
    });
    if (res.ok) {
      const payload = await res.json();
      renderWardrobeCards(payload.styles || [], payload.coins ?? 1200);
      wardrobeStatus.textContent = payload.message || "💎 +1,000コインを補充しました！";
      wardrobeStatus.classList.remove("hidden");
    }
  } finally {
    btnTopupCoins.disabled = false;
  }
});

// ===== 🎙️ 実在人間肉声 ＆「話し方DNA（口癖・語尾・方言）」学習スタジオ制御 =====
function stopRawPreviewAudio() {
  if (rawPreviewAudio) {
    rawPreviewAudio.pause();
    rawPreviewAudio = null;
  }
  rawPreviewVoiceId = null;
  if (btnCustomVoiceRaw) {
    btnCustomVoiceRaw.textContent = "🔊 原音試聴";
  }
}

function renderFilteredVoiceCards() {
  voiceListEl.innerHTML = "";
  const list = (cachedVoicesList || []).filter((v) => {
    if (!currentVoiceGenderFilter || currentVoiceGenderFilter === "all") return true;
    return (v.gender || "female") === currentVoiceGenderFilter;
  });

  list.forEach((v) => {
    const card = document.createElement("div");
    card.className = `voice-card ${v.active ? "active" : ""}`;
    card.style.position = "relative";

    const fillersText = (v.fillers || []).slice(0, 3).join(" / ");
    const endingsText = (v.endings || []).slice(0, 3).join(" / ");
    const durMeta = v.is_custom && v.duration_sec ? `（${v.duration_sec}秒サンプル学習済）` : "";
    const gTag = getGenderDisplayTag(v.gender || "female");

    card.innerHTML = `
      <div class="voice-card-header">
        <div class="voice-card-title">${v.name}${durMeta}</div>
        <span class="voice-badge">${v.active ? "採用中 ✨" : gTag}</span>
      </div>
      <div class="voice-speaker-sub">${v.speaker_tag || ""} ${v.pace_desc ? `｜ ${v.pace_desc}` : ""}</div>
      <div class="voice-dna-chips">
        <span class="dna-chip">${gTag}（一人称:${v.recommended_first_person || "自動"}）</span>
        ${v.dialect ? `<span class="dna-chip">🗣️ ${v.dialect}</span>` : ""}
        ${fillersText ? `<span class="dna-chip filler">💬 口癖: ${fillersText}</span>` : ""}
        ${endingsText ? `<span class="dna-chip">🎵 語尾: ${endingsText}</span>` : ""}
      </div>
      <div class="voice-card-actions">
        <button type="button" class="btn-raw-sample">🔊 原音試聴（本人の生録音）</button>
        <button type="button" class="btn-select-voice">
          ${v.active ? "✨ この声でもう一度喋る" : "🎙️ この声＆話し方で喋る"}
        </button>
      </div>
    `;

    const rawBtn = card.querySelector(".btn-raw-sample");
    rawBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (rawPreviewAudio && rawPreviewVoiceId === v.id) {
        stopRawPreviewAudio();
        rawBtn.textContent = "🔊 原音試聴（本人の生録音）";
        return;
      }
      stopRawPreviewAudio();
      document.querySelectorAll(".btn-raw-sample").forEach((b) => {
        b.textContent = "🔊 原音試聴（本人の生録音）";
      });
      const aud = new Audio(`${v.raw_sample_url}?t=${Date.now()}`);
      rawPreviewAudio = aud;
      rawPreviewVoiceId = v.id;
      rawBtn.textContent = "⏹️ 原音再生中（停止）";
      aud.onended = () => {
        rawBtn.textContent = "🔊 原音試聴（本人の生録音）";
        stopRawPreviewAudio();
      };
      aud.play().catch(() => {
        rawBtn.textContent = "🔊 原音試聴（本人の生録音）";
        stopRawPreviewAudio();
      });
    };

    const selBtn = card.querySelector(".btn-select-voice");
    selBtn.onclick = async () => {
      stopRawPreviewAudio();
      const { turnId, signal } = beginNewUserTurn();
      const overlay = document.createElement("div");
      overlay.className = "card-loading-overlay";
      overlay.innerHTML = `<div class="spinner-ring"></div><div>🎙️『${v.name}』に切替中…</div>`;
      card.appendChild(overlay);
      voiceLearnStatus.textContent = `🎙️『${v.name}』の肉声＆話し方DNA（${v.dialect || "自然体"}）に切り替えて発話を生成中…`;
      voiceLearnStatus.classList.remove("hidden");
      try {
        const selRes = await fetch("/api/companion/voices/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: v.id }),
          signal,
        });
        if (turnId !== userTurnToken) return;
        if (selRes.ok) {
          const stateData = await selRes.json();
          voiceLearnStatus.classList.add("hidden");
          voiceModal.classList.add("hidden");
          applyCompanionState(stateData);
        }
      } catch (_) {
      } finally {
        overlay.remove();
      }
    };

    voiceListEl.appendChild(card);
  });
}

voiceFilterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentVoiceGenderFilter = tab.dataset.vfilter || "all";
    voiceFilterTabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderFilteredVoiceCards();
  });
});

async function refreshVoiceList() {
  const res = await fetch("/api/companion/voices", { cache: "no-store" });
  if (!res.ok) return;
  const payload = await res.json();
  cachedVoicesList = payload.voices || [];
  if (payload.recommended_by_gender) {
    recommendedVoicesMap = payload.recommended_by_gender;
  }
  renderFilteredVoiceCards();
}

btnOpenVoiceModal.addEventListener("click", async () => {
  stopCurrentTalkingPlayback();
  voiceLearnStatus.classList.add("hidden");
  await refreshVoiceList();
  voiceModal.classList.remove("hidden");
});

function closeVoiceModal() {
  stopRawPreviewAudio();
  voiceModal.classList.add("hidden");
}

btnCloseVoiceModal.addEventListener("click", closeVoiceModal);
btnCloseVoiceTop.addEventListener("click", closeVoiceModal);

function setSelectedVoiceMediaFiles(fileList) {
  const arr = Array.from(fileList || []).filter((f) => f && f.size > 500);
  if (arr.length === 0) return;
  selectedMediaFiles = arr;
  const totalMb = (arr.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1);
  const firstTitle = arr[0].name;
  const countLabel =
    arr.length === 1
      ? `<strong>${firstTitle}</strong>`
      : `<strong>${arr.length}個の動画・音声ファイル</strong>（${firstTitle} ほか）`;
  voiceFileLabel.innerHTML = `✅ 選択中：${countLabel}（計 ${totalMb} MB）<br/><small>下のボタンを押すと肉声マルチトーンと口癖・語尾・方言（話し方DNA）を同時学習します</small>`;
  if (!voiceLabelInput.value.trim()) {
    voiceLabelInput.value = firstTitle.replace(/\.[^.]+$/, "").slice(0, 18);
  }
}

voiceFileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    setSelectedVoiceMediaFiles(e.target.files);
  }
});

voiceDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  voiceDropzone.classList.add("dragover");
});

voiceDropzone.addEventListener("dragleave", () => {
  voiceDropzone.classList.remove("dragover");
});

voiceDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  voiceDropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    setSelectedVoiceMediaFiles(e.dataTransfer.files);
  }
});

voiceLearnForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const folderVal = voiceFolderInput.value.trim();
  if (selectedMediaFiles.length === 0 && !folderVal) {
    voiceLearnStatus.textContent =
      "⚠️ 学習させたい動画・音声ファイル（複数可）を選択するか、ローカルフォルダパスを入力してください。";
    voiceLearnStatus.classList.remove("hidden");
    return;
  }

  stopRawPreviewAudio();
  const { turnId, signal } = beginNewUserTurn();
  btnSubmitVoiceLearn.disabled = true;
  const vGender = (voiceGenderSelect && voiceGenderSelect.value) || selectedCustomGender || "female";
  voiceLearnStatus.textContent =
    "🧬 音声から本人の『肉声マルチトーン』と『口癖・相槌・語尾・方言（話し方DNA）』を解析・学習し、実写テスト発話を生成中…（約6〜14秒）";
  voiceLearnStatus.classList.remove("hidden");

  try {
    const fd = new FormData();
    selectedMediaFiles.forEach((f) => fd.append("files", f));
    fd.append("folder_path", folderVal);
    fd.append("voice_name", voiceLabelInput.value.trim() || "カスタム学習ボイス");
    fd.append("gender", vGender);

    const res = await fetch("/api/companion/voices/learn", {
      method: "POST",
      body: fd,
      signal,
    });
    const payload = await res.json();
    if (turnId !== userTurnToken) return;
    if (!res.ok) {
      voiceLearnStatus.textContent = `⚠️ ${payload.detail || "声と話し方の学習に失敗しました"}`;
      return;
    }

    selectedMediaFiles = [];
    voiceLabelInput.value = "";
    voiceFolderInput.value = "";
    voiceFileLabel.innerHTML =
      "📁 クリックまたはドラッグ＆ドロップで動画・音声を選択（複数ファイル同時学習OK）<br/><small>音声から「肉声マルチトーン」と「口癖・相槌・語尾・方言・テンポ（話し方DNA）」を自動抽出して会話に反映します</small>";
    voiceLearnStatus.classList.add("hidden");
    voiceModal.classList.add("hidden");
    applyCompanionState(payload);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    voiceLearnStatus.textContent = "⚠️ 通信エラーが発生しました。ファイルまたはフォルダパスを確認してください。";
  } finally {
    btnSubmitVoiceLearn.disabled = false;
  }
});

// ===== ハイブリッドマイク音声認識（MediaRecorder実音声録音 → ローカル faster-whisper ＋ Web Speech API 併用） =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let mediaRecorder = null;
let micStream = null;
let micChunks = [];
let micAudioCtx = null;
let micAnalyser = null;
let micVadRaf = null;
let micMaxTimer = null;
let isMicRecording = false;
let liveSpeechRecognizer = null;
let liveSpeechInterimText = "";

function resetMicUi() {
  isMicRecording = false;
  btnMic.classList.remove("listening");
  micLabel.textContent = "声で話す";
  if (micLevelWrap) micLevelWrap.classList.add("hidden");
  if (micLevelFill) micLevelFill.style.width = "8%";
  if (micVadRaf) {
    cancelAnimationFrame(micVadRaf);
    micVadRaf = null;
  }
  if (micMaxTimer) {
    clearTimeout(micMaxTimer);
    micMaxTimer = null;
  }
  if (liveSpeechRecognizer) {
    try {
      liveSpeechRecognizer.onend = null;
      liveSpeechRecognizer.stop();
    } catch (_) {}
    liveSpeechRecognizer = null;
  }
  if (micAudioCtx) {
    try {
      micAudioCtx.close();
    } catch (_) {}
    micAudioCtx = null;
    micAnalyser = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

async function sendRecordedAudioToCompanion(blob, fallbackText) {
  const { turnId, signal, turnStartPerfNow } = beginNewUserTurn();
  if (fallbackText) {
    showUserHeardText(fallbackText);
  }
  spokenSubtitle.textContent = "（……あなたの声を聞き取って、嬉しそうに返事を考えています）";

  try {
    const ext = blob.type.includes("wav")
      ? "wav"
      : blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
    const fd = new FormData();
    fd.append("audio", blob, `mic_input.${ext}`);
    fd.append("fallback_text", fallbackText || "");

    await consumeCompanionNdjsonStream(
      "/api/companion/talk_audio_stream",
      {
        method: "POST",
        body: fd,
        signal,
      },
      turnId,
      turnStartPerfNow,
      {
        preserveSubtitleOnEmptyState: true,
        preserveChoicesOnEmptyState: true,
        onNoSpeech: (pkt) => {
          showEventToast(pkt.detail || "声が聞き取れませんでした。もう一度マイクの近くで話しかけてね！");
          spokenSubtitle.textContent =
            (latestState && latestState.spoken) || "ねえ、うまく聞こえなかったかも。もう一回聞かせて？";
          freeInputText.focus();
        },
        onHttpError: async () => {
          if (fallbackText) {
            await sendTalk(fallbackText);
            return;
          }
          spokenSubtitle.textContent = "ごめんね、音声の送信に失敗しちゃった。下の入力欄からも話せるよ！";
        },
      }
    );
  } catch (err) {
    if (err && err.name === "AbortError") return;
    if (fallbackText) {
      await sendTalk(fallbackText);
    } else {
      spokenSubtitle.textContent = "音声通信エラーが起きました。下のテキスト欄からもすぐ話しかけられます！";
    }
  }
}

async function startHybridMicRecording() {
  stopCurrentTalkingPlayback();
  liveSpeechInterimText = "";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showEventToast("この環境ではマイク録音APIが無効なため、テキスト入力欄にフォーカスします");
    freeInputText.focus();
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (_) {
    showEventToast("マイクの使用が許可されていないか、マイクが見つかりません。横の入力欄からすぐ話せます！");
    freeInputText.focus();
    return;
  }

  isMicRecording = true;
  micChunks = [];
  btnMic.classList.add("listening");
  micLabel.textContent = "送信（録音中）";
  if (micLevelWrap) micLevelWrap.classList.remove("hidden");
  spokenSubtitle.textContent = "🎙️ 聞いています…そのまま話しかけてください（話し終えると自動送信／もう一度押して送信）";

  // 補助として Web Speech API が使えるブラウザではリアルタイム字幕プレビューも並列取得
  if (SpeechRecognition) {
    try {
      const rec = new SpeechRecognition();
      rec.lang = "ja-JP";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (ev) => {
        let acc = "";
        for (let i = 0; i < ev.results.length; i++) {
          acc += ev.results[i][0].transcript;
        }
        if (acc.trim()) {
          liveSpeechInterimText = acc.trim();
          showUserHeardText(`${liveSpeechInterimText} …`);
        }
      };
      rec.onerror = () => {};
      rec.start();
      liveSpeechRecognizer = rec;
    } catch (_) {}
  }

  const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  let chosenMime = "";
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    for (const m of mimeCandidates) {
      if (MediaRecorder.isTypeSupported(m)) {
        chosenMime = m;
        break;
      }
    }
  }

  mediaRecorder = chosenMime ? new MediaRecorder(micStream, { mimeType: chosenMime }) : new MediaRecorder(micStream);
  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      micChunks.push(ev.data);
    }
  };

  mediaRecorder.onstop = () => {
    const finalMime = mediaRecorder ? mediaRecorder.mimeType || "audio/webm" : "audio/webm";
    const blob = new Blob(micChunks, { type: finalMime });
    const capturedFallback = liveSpeechInterimText;
    resetMicUi();
    if (blob.size >= 400 || capturedFallback) {
      sendRecordedAudioToCompanion(blob, capturedFallback);
    } else {
      showEventToast("音声が短すぎたようです。もう一度話しかけてみてね！");
    }
  };

  mediaRecorder.start(150);

  // Web Audio API によるリアルタイム音量ゲージ＆話し終わり自動送信 (VAD)
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    micAudioCtx = new AudioCtx();
    const srcNode = micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    srcNode.connect(micAnalyser);

    const timeBuf = new Uint8Array(micAnalyser.fftSize);
    const recordStartTs = performance.now();
    let hasDetectedVoice = false;
    let lastVoiceTs = recordStartTs;

    const monitorLevel = () => {
      if (!isMicRecording || !micAnalyser) return;
      micAnalyser.getByteTimeDomainData(timeBuf);
      let sumSq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const norm = (timeBuf[i] - 128) / 128.0;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / timeBuf.length);
      const pct = Math.min(100, Math.max(8, Math.round(rms * 420)));
      if (micLevelFill) micLevelFill.style.width = `${pct}%`;

      const now = performance.now();
      if (rms > 0.024) {
        hasDetectedVoice = true;
        lastVoiceTs = now;
      }
      // 話し始めてから1.15秒以上静かになったら自動で録音完了して送信
      if (hasDetectedVoice && now - recordStartTs > 950 && now - lastVoiceTs > 1150) {
        stopHybridMicRecording();
        return;
      }
      micVadRaf = requestAnimationFrame(monitorLevel);
    };
    micVadRaf = requestAnimationFrame(monitorLevel);
  } catch (_) {}

  // 最大12秒のセーフティ自動送信タイマー
  micMaxTimer = setTimeout(() => {
    if (isMicRecording) {
      stopHybridMicRecording();
    }
  }, 12000);
}

function stopHybridMicRecording() {
  if (!isMicRecording) return;
  isMicRecording = false;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
      return;
    } catch (_) {}
  }
  resetMicUi();
}

btnMic.addEventListener("click", () => {
  if (isMicRecording) {
    stopHybridMicRecording();
  } else {
    startHybridMicRecording();
  }
});

// ===== 記憶モーダル =====
const memoryModal = document.getElementById("memory-modal");
const memoryList = document.getElementById("memory-list");

memoryPill.addEventListener("click", () => {
  memoryList.innerHTML = "";
  const mems = (latestState && latestState.latest_memories) || [];
  if (latestState && latestState.user_name) {
    const li = document.createElement("li");
    li.textContent = `👤 あなたの名前：${latestState.user_name}`;
    memoryList.appendChild(li);
  }
  if (mems.length === 0 && (!latestState || !latestState.user_name)) {
    const li = document.createElement("li");
    li.textContent = "まだ記憶がありません。名前や好きなものを教えてあげてね！";
    memoryList.appendChild(li);
  } else {
    mems.forEach((m) => {
      const li = document.createElement("li");
      li.textContent = `✨ ${m}`;
      memoryList.appendChild(li);
    });
  }
  memoryModal.classList.remove("hidden");
});

document.getElementById("btn-close-memory").addEventListener("click", () => {
  memoryModal.classList.add("hidden");
});

document.getElementById("btn-reset-memory").addEventListener("click", () => {
  memoryModal.classList.add("hidden");
  sendAction("reset_memory");
});

// ===== SNS・ショート動画用 切り抜きカードCanvas生成 =====
const clipModal = document.getElementById("clip-modal");
const clipCanvas = document.getElementById("clip-canvas");

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = Array.from(text || "");
  let line = "";
  let curY = y;
  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, curY);
      line = chars[i];
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, curY);
  return curY;
}

document.getElementById("btn-clip-share").addEventListener("click", () => {
  if (!latestState) return;
  const ctx = clipCanvas.getContext("2d");
  const W = clipCanvas.width;
  const H = clipCanvas.height;

  ctx.fillStyle = "#121016";
  ctx.fillRect(0, 0, W, H);

  const srcVid =
    roiTalkCanvas && roiTalkCanvas.classList.contains("active")
      ? roiTalkCanvas
      : talkingVideoNext.classList.contains("active")
        ? talkingVideoNext
        : talkingVideo.classList.contains("active")
          ? talkingVideo
          : activeIdleSlot === "a"
            ? idleVideoA
            : idleVideoB;
  const vw = srcVid.videoWidth || srcVid.width || 1280;
  const vh = srcVid.videoHeight || srcVid.height || 720;
  const vidRatio = vw / vh;
  const drawH = 560;
  const drawW = drawH * vidRatio;
  try {
    ctx.drawImage(srcVid, (W - drawW) / 2, 0, drawW, drawH);
  } catch (_) {}

  const grad = ctx.createLinearGradient(0, 380, 0, H);
  grad.addColorStop(0, "rgba(18,16,22,0)");
  grad.addColorStop(0.35, "rgba(18,16,22,0.95)");
  grad.addColorStop(1, "#121016");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 380, W, H - 380);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.roundRect(40, 520, W - 80, 68, 16);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("あなた：", 62, 562);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(lastUserPrompt.slice(0, 22), 148, 562);

  ctx.fillStyle = "#ff85a2";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`🗣️ ${latestState.partner_name}の言葉（表）`, 44, 632);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  wrapCanvasText(ctx, `「${latestState.spoken}」`, 44, 672, W - 88, 36);

  ctx.fillStyle = "rgba(168, 85, 247, 0.22)";
  ctx.strokeStyle = "rgba(216, 180, 254, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 760, W - 80, 145, 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e9d5ff";
  ctx.font = "bold 21px sans-serif";
  ctx.fillText(`💭 脳内のホンネ（親密度 💗${latestState.affection}）`, 62, 798);
  ctx.fillStyle = "#faf5ff";
  ctx.font = "23px sans-serif";
  wrapCanvasText(ctx, `（${latestState.inner_thought}）`, 62, 836, W - 124, 32);

  clipModal.classList.remove("hidden");
});

document.getElementById("btn-download-clip").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `partner_clip_${Date.now()}.png`;
  link.href = clipCanvas.toDataURL("image/png");
  link.click();
});

document.getElementById("btn-close-clip").addEventListener("click", () => {
  clipModal.classList.add("hidden");
});
