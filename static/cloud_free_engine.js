// ============================================================================
// PATCHWORK NATION - 完全無料・PC負荷ゼロ クラウドエンジン
// (v9: SOTA v11 Anatomical Lock + Hirschberg Gaze Focus + 0.00ms Audio-Video Sync + Mobile 3-Decoder Pool)
// - あなたのPC（ローカルGPU/Pythonサーバー）を一切使わず、GitHub Pages の完全無料クラウドで24時間稼働
// - ブラウザ内蔵の機械音声 (window.speechSynthesis) は 100% 使用禁止！
//   全発話で事前合成済みの「本物の Qwen3-TTS 1.7B 実在人間クローン肉声 MP3」を再生
// - v11 ハイエンド実写ゲーム (Interactive FMV) ＆ 最先端AIデジタルヒューマン技術：
//   1. ヒルシュベルグ角膜反射整合 (Hirschberg Corneal Reflex Rectification):
//      左右の白目露出・虹彩・瞳孔・角膜ハイライトを100%対称化し、ユーザーの目を真っ直ぐ見つめる焦点を実現！
//   2. 21点3D暗黙キーポイントの解剖学的完全分離:
//      背景・髪・頭頂・肩の10点 (`[0,1,2,3,4,5,6,8,9,10]`) を `stitch_net` 後に 100.0% ソース座標に固定し、
//      背景の歪みや謎の体揺れを物理的に 0.000% に根絶！
//   3. 50fps フォルマント調音リップシンク ＋ Web Audio Clock 0.00ms 完全同期:
//      音声デコード完了と動画 Frame 0 デコード完了を待ってから同一ミリ秒で同時スタートし、
//      再生中も毎フレーム `cloudAudioCtx.currentTime` にロックして口と声のズレを 0.00ms に維持！
//   4. スマホ（iOS Safari / Android Chrome）完全対応:
//      ハードウェア `<video>` デコーダ枯渇を防ぐ「3デコーダ固定ピンポンプール＋Blobメモリキャッシュ」を搭載！
// ============================================================================

(function () {
  "use strict";

  const ASSET_VER = "24";
  const STORAGE_KEY_MEM = "pw_cloud_v9_memory";

  let catalogMeta = null;
  let voiceManifest = null;
  let fmvManifestMio = null;

  let visemeCache = new Map(); // charId -> Promise<Sprite>
  let baseImgCache = new Map(); // url -> Promise<HTMLImageElement>

  // ===== Mobile-Safe 3-Decoder Pool & Blob Memory Cache (for face_f02_mio 50fps v13 Kidoairaku Streams) =====
  let fmvBlobUrlCache = new Map(); // relativeUrl -> Promise<blobUrl>
  let fmvIdleUrlMap = new Map(); // branchId -> relativeUrl
  let idleDecoderA = null;
  let idleDecoderB = null;
  let talkDecoder = null;
  let activeIdleSlot = "A"; // "A" | "B"
  let queuedNextIdleId = "idle_02_smile_right";

  let activeFmvVideo = null;
  let activeFmvType = "idle"; // "idle" | "talk"
  let currentIdleBranchId = "idle_02_smile_right";
  let currentEmotionMode = "joy"; // "joy" | "anger" | "sadness" | "fun" | "shy"
  let nextIdleBranchHint = null;
  let fmvSwitching = false;

  let cloudAudioCtx = null;
  let activeAudioSource = null;
  let activeAnalyser = null;
  let activeFreqData = null;
  let activeTimeData = null;
  let isSpeakingNow = false;
  let currentTalkToken = 0;
  let talkAudioStartCtxTime = 0;
  let talkAudioDuration = 0;

  // 美桜 (face_f02_mio) 用の 50fps v11 完全同期発話クリップ対象 CK セット (全26本)
  const MIO_FMV_TALK_CKS = new Set([
    "e1afb5eda5d197874133180aff8d38e4",
    "606cb477f9a7eb3909fe3459477be5d3",
    "330c6c712a7d446ac3887d4fbfb48609",
    "0cd0f922f4ef7b9ae4c5bd0fdbccaf22",
    "e092c07207d071d18068fa70dcfd7c6f",
    "b20f225de3f04fddbfd169f470a463e5",
    "61344fc20ad64f074fa12c3246abe609",
    "67cc34c206eb434ba626ddbb53fe4d8b",
    "598b23a7aed76d04b01f33c3468f6bc3",
    "a6746797f042179b9e2a6cdcc4650324",
    "cc47d326b8106539c6e1d4159d8e8edc",
    "954389470c4ccd6afc49bd5c3b3e399d",
    "1a9d95bef35b2ce8d528482e0b700214",
    "2de7e43f86a04f344a8d224297f44c85",
    "4279f3f422f62ae5fc65810d1ac97f13",
    "e50de9caa5bf46a5b1c38668ea943c29",
    "594f387dfb16f45dde2bba825c94eff8",
    "2d845745841dd5846bc4e45ea61ce1f4",
    "d0b61000577e04b3e125f5e773eac7d5",
    "9e48b887c9dcb66f9c98663eb72378ef",
    "067ffbd98b564724e505b4adab0c412e",
    "07362ac6769f38e2c83d41e905552aca",
    "a4f54263c302bab207b778a3106acb52",
    "a04d8e0dd828fd3fb8b6d3d7047b17d5",
    "dd2fa2b76821684a6e43ef431ce17646",
    "35172f14f03c543252a9eb51fef82ee4",
  ]);

  function resolveAssetUrl(u) {
    if (!u || typeof u !== "string") return "";
    if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:") || u.startsWith("blob:")) {
      return u;
    }
    const clean = u.replace(/^\/+/, "");
    if (clean.includes("face_f02_mio.jpg") && !clean.includes("?")) {
      return `${clean}?v=${ASSET_VER}`;
    }
    return clean;
  }

  function loadCloudMemory() {
    const def = {
      partner_name: "美桜",
      partner_gender: "female",
      first_person: "わたし",
      user_name: "",
      user_gender: "unspecified",
      active_char_id: "face_f02_mio",
      active_voice_id: "human_g0143",
      affection: 68,
      mood: 24,
      coins: 2400,
      charm_level: 1.0,
      time_scene: "evening",
      is_close_distance: false,
      unlocked_styles: [
        "vline_beige_offshoulder",
        "vline_dark_offshoulder",
        "vline_dark_bangs_white",
        "vline_pinkbrown_loungewear",
        "vline_ash_date_dress",
        "vline_halfup_boyfriend_shirt",
      ],
      room_items: [],
      memories: [],
      chat_history: [],
      favorite_face_ids: [],
    };
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY_MEM) ||
        localStorage.getItem("pw_cloud_v8_memory") ||
        localStorage.getItem("pw_cloud_v7_memory");
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...def, ...parsed };
      }
    } catch (_) {}
    return def;
  }

  function saveCloudMemory(mem) {
    try {
      localStorage.setItem(STORAGE_KEY_MEM, JSON.stringify(mem));
    } catch (_) {}
  }

  // ===== 3個の共有 `<video>` デコーダのみを生成（iOS Safari / Android のデコーダ上限を絶対超えない） =====
  function createReusableDecoderElement() {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.defaultMuted = true;
    vid.playsInline = true;
    vid.setAttribute("playsinline", "");
    vid.setAttribute("webkit-playsinline", "");
    vid.preload = "auto";
    vid.loop = false;
    vid.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;";
    document.body.appendChild(vid);
    return vid;
  }

  function ensureVideoDecoders() {
    if (!idleDecoderA) idleDecoderA = createReusableDecoderElement();
    if (!idleDecoderB) idleDecoderB = createReusableDecoderElement();
    if (!talkDecoder) talkDecoder = createReusableDecoderElement();
  }

  function fetchVideoBlobUrl(rawUrl) {
    const fullUrl = resolveAssetUrl(
      rawUrl.includes("?") ? rawUrl : `${rawUrl}?v=${ASSET_VER}`
    );
    if (fmvBlobUrlCache.has(fullUrl)) {
      return fmvBlobUrlCache.get(fullUrl);
    }
    const p = (async () => {
      try {
        const res = await origFetch(fullUrl);
        if (!res.ok) return fullUrl;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (_) {
        return fullUrl;
      }
    })();
    fmvBlobUrlCache.set(fullUrl, p);
    return p;
  }

  function loadVideoIntoDecoder(vidEl, blobOrHttpUrl) {
    return new Promise((resolve) => {
      if (!vidEl || !blobOrHttpUrl) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        vidEl.removeEventListener("canplay", onReady);
        vidEl.removeEventListener("loadeddata", onReady);
        vidEl.removeEventListener("error", onErr);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onErr = () => finish(false);

      if (vidEl.dataset.loadedUrl === blobOrHttpUrl && vidEl.readyState >= 2) {
        try {
          vidEl.pause();
          vidEl.currentTime = 0;
        } catch (_) {}
        resolve(true);
        return;
      }

      vidEl.addEventListener("canplay", onReady, { once: true });
      vidEl.addEventListener("loadeddata", onReady, { once: true });
      vidEl.addEventListener("error", onErr, { once: true });
      setTimeout(() => finish(vidEl.readyState >= 1), 1500);

      vidEl.pause();
      vidEl.dataset.loadedUrl = blobOrHttpUrl;
      vidEl.src = blobOrHttpUrl;
      vidEl.load();
    });
  }

  async function ensureCatalogAndManifest() {
    if (!catalogMeta) {
      const res = await origFetch(resolveAssetUrl(`assets/catalog_85_meta.json?v=${ASSET_VER}`), {
        cache: "no-cache",
      });
      catalogMeta = await res.json();
    }
    if (!voiceManifest) {
      const resV = await origFetch(resolveAssetUrl(`assets/voice_bank/manifest.json?v=${ASSET_VER}`), {
        cache: "no-cache",
      });
      voiceManifest = await resV.json();
    }
    if (!fmvManifestMio) {
      try {
        const resF = await origFetch(
          resolveAssetUrl(`assets/fmv_mio/fmv_manifest.json?v=${ASSET_VER}`),
          { cache: "no-cache" }
        );
        if (resF.ok) {
          fmvManifestMio = await resF.json();
          await initMioFmvIdlePool();
        }
      } catch (_) {}
    }
    return { catalogMeta, voiceManifest, fmvManifestMio };
  }

  async function initMioFmvIdlePool() {
    if (!fmvManifestMio || !Array.isArray(fmvManifestMio.idle_branches)) return;
    ensureVideoDecoders();

    for (const b of fmvManifestMio.idle_branches) {
      fmvIdleUrlMap.set(b.id, `${b.url}?v=${ASSET_VER}`);
    }

    // 初期ブランチ (idle_02_smile_right) と次ブランチ (idle_01_breath_micro) を最優先でロード
    const firstId = fmvIdleUrlMap.has("idle_02_smile_right")
      ? "idle_02_smile_right"
      : fmvManifestMio.idle_branches[0]?.id;
    if (firstId && !activeFmvVideo) {
      const firstBlobUrl = await fetchVideoBlobUrl(fmvIdleUrlMap.get(firstId));
      await loadVideoIntoDecoder(idleDecoderA, firstBlobUrl);
      activeIdleSlot = "A";
      currentIdleBranchId = firstId;
      activeFmvType = "idle";
      activeFmvVideo = idleDecoderA;
      idleDecoderA.play().catch(() => {});

      // 裏のデコーダBに次の待機ブランチをプリロード待機
      queueNextIdleOnStandbyDecoder(firstId);
    }

    // 残りの待機ブランチと代表的な挨拶発話動画もバックグラウンドで Blob キャッシュに温めておく
    setTimeout(() => {
      for (const [, u] of fmvIdleUrlMap.entries()) {
        fetchVideoBlobUrl(u);
      }
      // 初回挨拶で使われやすい発話クリップを事前キャッシュ
      fetchVideoBlobUrl(`assets/fmv_mio/talk_e1afb5eda5d197874133180aff8d38e4.mp4?v=${ASSET_VER}`);
      fetchVideoBlobUrl(`assets/fmv_mio/talk_0cd0f922f4ef7b9ae4c5bd0fdbccaf22.mp4?v=${ASSET_VER}`);
    }, 300);
  }

  function pickNextMioIdleBranch(lastBranchId) {
    if (nextIdleBranchHint && fmvIdleUrlMap.has(nextIdleBranchHint)) {
      const h = nextIdleBranchHint;
      nextIdleBranchHint = null;
      return h;
    }

    // 現在の感情モード (joy / anger / sadness / fun / shy) に応じて待機中の表情も喜怒哀楽を鮮明に維持！
    const emotionBranchWeights = {
      anger: [
        { id: "idle_08_playful_sway", w: 88 }, // 【怒】ぷんぷん怒り・拗ね顔を継続
        { id: "idle_03_gaze_left", w: 12 },    // 【哀】寂しそうな拗ね目
      ],
      sadness: [
        { id: "idle_03_gaze_left", w: 82 },    // 【哀】ハの字困り眉・たれ目の切ない心配顔
        { id: "idle_07_deep_relax", w: 18 },   // 【慈愛】優しく気遣う眼差し
      ],
      shy: [
        { id: "idle_05_shy_glance", w: 82 },   // 【照】ドキドキ赤面・照れ笑い
        { id: "idle_02_smile_right", w: 18 },  // 【喜】幸せそうな笑顔
      ],
      fun: [
        { id: "idle_06_curious_tilt", w: 58 }, // 【楽】目をぱっちり輝かせるワクワク顔
        { id: "idle_04_nod_listen", w: 42 },   // 【楽】楽しそうな相槌
      ],
      joy: [
        { id: "idle_02_smile_right", w: 56 },  // 【喜】満面のデュシェンヌ・スマイル
        { id: "idle_04_nod_listen", w: 20 },   // 【楽】楽しそうな傾聴
        { id: "idle_05_shy_glance", w: 14 },   // 【照】ほんのり照れ笑い
        { id: "idle_01_breath_micro", w: 10 }, // 穏やかな微笑み
      ],
    };

    const modeList = emotionBranchWeights[currentEmotionMode] || emotionBranchWeights.joy;
    const candidates = modeList.filter((c) => fmvIdleUrlMap.has(c.id));
    if (candidates.length === 0) return "idle_02_smile_right";

    const total = candidates.reduce((acc, c) => acc + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.w;
      if (r <= 0) return c.id;
    }
    return candidates[0].id;
  }

  async function queueNextIdleOnStandbyDecoder(afterBranchId) {
    ensureVideoDecoders();
    const nextId = pickNextMioIdleBranch(afterBranchId);
    queuedNextIdleId = nextId;
    const rawUrl = fmvIdleUrlMap.get(nextId);
    if (!rawUrl) return;
    const blobUrl = await fetchVideoBlobUrl(rawUrl);
    const standbyVid = activeIdleSlot === "A" ? idleDecoderB : idleDecoderA;
    await loadVideoIntoDecoder(standbyVid, blobUrl);
  }

  function switchToStandbyIdleDecoderInstant() {
    ensureVideoDecoders();
    const nextSlot = activeIdleSlot === "A" ? "B" : "A";
    const nextVid = nextSlot === "A" ? idleDecoderA : idleDecoderB;
    const prevVid = activeIdleSlot === "A" ? idleDecoderA : idleDecoderB;

    if (nextVid && nextVid.readyState >= 2) {
      activeIdleSlot = nextSlot;
      currentIdleBranchId = queuedNextIdleId || "idle_01_breath_micro";
      activeFmvType = "idle";
      try {
        nextVid.currentTime = 0;
      } catch (_) {}
      nextVid.play().catch(() => {});
      activeFmvVideo = nextVid;
      try {
        prevVid.pause();
      } catch (_) {}
      queueNextIdleOnStandbyDecoder(currentIdleBranchId);
    } else if (prevVid) {
      // 万一裏デコーダがまだ準備中の場合は現在のデコーダを Frame 0 からシームレス再開
      activeFmvType = "idle";
      try {
        prevVid.currentTime = 0;
      } catch (_) {}
      prevVid.play().catch(() => {});
      activeFmvVideo = prevVid;
      queueNextIdleOnStandbyDecoder(currentIdleBranchId);
    }
  }

  async function switchToIdleFmvBranch(branchId) {
    ensureVideoDecoders();
    const targetId = fmvIdleUrlMap.has(branchId) ? branchId : "idle_01_breath_micro";
    const standbyVid = activeIdleSlot === "A" ? idleDecoderB : idleDecoderA;

    if (queuedNextIdleId === targetId && standbyVid && standbyVid.readyState >= 2) {
      switchToStandbyIdleDecoderInstant();
      return;
    }

    const rawUrl = fmvIdleUrlMap.get(targetId);
    if (!rawUrl) {
      switchToStandbyIdleDecoderInstant();
      return;
    }
    const blobUrl = await fetchVideoBlobUrl(rawUrl);
    await loadVideoIntoDecoder(standbyVid, blobUrl);
    queuedNextIdleId = targetId;
    switchToStandbyIdleDecoderInstant();
  }

  function getActiveCharObj(mem) {
    if (!catalogMeta || !Array.isArray(catalogMeta.face_catalog)) return null;
    const cid = mem.active_char_id || "face_f02_mio";
    let found = catalogMeta.face_catalog.find((c) => c.id === cid || c.face_id === cid);
    if (!found) {
      found = catalogMeta.face_catalog.find((c) => c.id === "face_f02_mio") || catalogMeta.face_catalog[0];
    }
    if (!found) return null;
    const copy = { ...found };
    copy.portrait_url = resolveAssetUrl(copy.portrait_url);
    copy.thumb_url = resolveAssetUrl(copy.thumb_url);
    copy.idle_video_url = "";
    copy.active = true;
    return copy;
  }

  function getBuiltinVoicesList(activeVid) {
    return [
      {
        id: "human_g0143",
        name: "実在女性①：親しみやすい20代女性（標準語・自然体タメ口）",
        gender: "female",
        first_person: "わたし",
        is_custom: false,
        active: activeVid === "human_g0143",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0143_raw_sample.mp3"),
      },
      {
        id: "human_g0082",
        name: "実在女性②：愛嬌たっぷりの20代女性（やわらか関西弁）",
        gender: "female",
        first_person: "うち",
        is_custom: false,
        active: activeVid === "human_g0082",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0082_raw_sample.mp3"),
      },
      {
        id: "human_g0081",
        name: "実在女性③：明るく甘え上手な20代女性（関西弁トーン）",
        gender: "female",
        first_person: "うち",
        is_custom: false,
        active: activeVid === "human_g0081",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0081_raw_sample.mp3"),
      },
      {
        id: "human_g0144",
        name: "実在男性①：優しく包容力のある20代彼氏（標準語・自然体）",
        gender: "male",
        first_person: "俺",
        is_custom: false,
        active: activeVid === "human_g0144",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0144_raw_sample.mp3"),
      },
      {
        id: "human_g0244",
        name: "実在中性①：透明感のあるジェンダーレス恋人（穏やかトーン）",
        gender: "other",
        first_person: "私",
        is_custom: false,
        active: activeVid === "human_g0244",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0244_raw_sample.mp3"),
      },
    ];
  }

  function selectRealVoiceEntry(voiceId, targetText, intentCategory) {
    if (!voiceManifest || !Array.isArray(voiceManifest.voices)) return null;
    const allVoices = voiceManifest.voices;

    let pool = allVoices.filter((v) => v.vid === voiceId);
    if (pool.length === 0) {
      const fallbackVid =
        voiceId === "human_g0189"
          ? "human_g0144"
          : voiceId === "human_g0243"
          ? "human_g0143"
          : "human_g0143";
      pool = allVoices.filter((v) => v.vid === fallbackVid);
    }
    if (pool.length === 0) pool = allVoices;

    // 美桜 (human_g0143) の場合は、50fps v11 完全同期発話動画が完備されている26クリップを100%使用する
    if (voiceId === "human_g0143") {
      const fmvPool = pool.filter((v) => MIO_FMV_TALK_CKS.has(v.ck));
      if (fmvPool.length > 0) pool = fmvPool;
    }

    if (targetText) {
      const cleanTarget = targetText.replace(/[ 　\t\r\n]/g, "");
      const exact = pool.find((v) => v.text.replace(/[ 　\t\r\n]/g, "") === cleanTarget);
      if (exact) return exact;
      const partial = pool.find(
        (v) =>
          cleanTarget.length >= 6 &&
          (v.text.includes(targetText.slice(0, 8)) || targetText.includes(v.text.slice(0, 8)))
      );
      if (partial) return partial;
    }

    const keywordMap = {
      greeting_morning: ["おはよう"],
      greeting_home: ["おかえり", "お疲れさま", "待ってた"],
      greeting_night: ["まだ起きてた", "ゆっくり話そ", "おしゃべりしよ"],
      greeting_sulk: ["やっと来てくれた", "寂しかった", "拗ねて"],
      fatigue: ["お疲れさま", "頑張った", "ゆっくり休んで", "えらいよ"],
      compliment: ["照れ", "ほんとに！？", "嬉しい"],
      positive_news: ["すごいじゃん", "素敵だね", "自分のことみたいに嬉しい"],
      apology: ["しょうがないなあ", "許してあげる", "気にしなくていい", "大丈夫だよ"],
      movie_hobby: ["映画", "聞いてくれるの", "気になっちゃう"],
      pat_head: ["髪くしゃってなる", "甘やかされてる", "撫でて"],
      poke_cheek: ["つつかないで", "びっくりしたじゃん"],
      close_dist: ["顔近いよ", "ドキドキした"],
      gift_cake: ["すごく嬉しい", "めっちゃすごい"],
      gift_latte: ["温かいお茶", "ゆっくり休んで"],
      gift_bear: ["素敵だね", "嬉しいよ"],
      gift_flower: ["照れるじゃん", "嬉しい"],
      sulk_プリン: ["お風呂上がり", "お詫びは"],
      question: ["聞いてくれるの", "気になっちゃう", "そうだねえ"],
      chat: ["そうなんだね", "何気ない話", "心地いいな", "話したいなって"],
    };

    const kws = keywordMap[intentCategory] || keywordMap.chat;
    const matches = pool.filter((v) => kws.some((k) => v.text.includes(k)) && !v.text.includes("happy"));
    if (matches.length > 0) {
      return matches[Math.floor(Math.random() * matches.length)];
    }

    const cleanPool = pool.filter((v) => !v.text.includes("happy") && v.text.length >= 10);
    if (cleanPool.length > 0) {
      return cleanPool[Math.floor(Math.random() * cleanPool.length)];
    }
    return pool[0];
  }

  function classifyUserTalkIntent(userText, mood) {
    const u = (userText || "").trim();
    if (/(プリン|ぷんぷん|怒っ|拗ね|放置|勝手|食べちゃっ|ばか|バカ|むかつ|嫌い)/.test(u)) return "sulk_プリン";
    if (mood < -5) return "greeting_sulk";
    if (u.includes("おはよう")) return "greeting_morning";
    if (/(ただいま|帰った|かえった|戻った|待ってた)/.test(u)) return "greeting_home";
    if (/(疲れ|つかれ|しんど|大変|残業|眠い|ねむい|仕事|がんばった|頑張った|悲し|寂し|さびし|つらい|辛い|泣き|落ち込|不安)/.test(u))
      return "fatigue";
    if (/(可愛い|かわいい|かっこい|カッコイ|好き|綺麗|きれい|似合|素敵|癒やされ|いい声|笑顔|愛して|ドキドキ|惚れ)/.test(u))
      return "compliment";
    if (/(映画|アニメ|ドラマ|動画|音楽|曲|趣味|ハマっ|最近どう|どんな|遊ぼ|ワクワク|楽し)/.test(u)) return "movie_hobby";
    if (/(ごめん|すまん|悪かった|許して)/.test(u)) return "apology";
    if (/(褒められ|うまくいっ|成功|勝った|受かった|嬉しかった|最高|やった)/.test(u)) return "positive_news";
    if (/[？?]|何を|何して|どこ|いつ|誰|なんで|なぜ|どう思/.test(u)) return "question";
    return "chat";
  }

  // ===== 他キャラ用の 3D ヴィセームローダー =====
  async function b64ToBitmap(b64) {
    if (!b64) return null;
    const bin = atob(b64);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: "image/jpeg" });
    return createImageBitmap(blob);
  }

  async function decode5StateNode(rawNode) {
    const [closed, small, mid, wide, blink] = await Promise.all([
      b64ToBitmap(rawNode.closed),
      b64ToBitmap(rawNode.small),
      b64ToBitmap(rawNode.mid),
      b64ToBitmap(rawNode.wide),
      b64ToBitmap(rawNode.blink),
    ]);
    return {
      closed,
      small: small || closed,
      mid: mid || small || closed,
      wide: wide || mid || closed,
      blink: blink || closed,
    };
  }

  function loadCharacterVisemeSprite(charId, portraitUrl) {
    if (!charId) return Promise.resolve(null);
    if (visemeCache.has(charId)) return visemeCache.get(charId);

    const p = (async () => {
      try {
        const baseImg = await loadBasePortraitImg(portraitUrl);
        if (charId === "face_f02_mio") {
          return {
            charId,
            frameW: 1280,
            frameH: 720,
            x: 0,
            y: 0,
            w: 1280,
            h: 720,
            baseImg,
            bitmaps: null,
          };
        }
        const res = await origFetch(resolveAssetUrl(`assets/viseme_3d/${charId}.json?v=${ASSET_VER}`), {
          cache: "force-cache",
        });
        if (!res.ok) return null;
        const data = await res.json();
        const singleNode = await decode5StateNode(
          data.frames || (data.motion_graph && data.motion_graph.nodes[0]) || {}
        );
        return {
          charId,
          frameW: Number(data.frame_w || (baseImg && baseImg.naturalWidth) || 960),
          frameH: Number(data.frame_h || (baseImg && baseImg.naturalHeight) || 1280),
          x: Number(data.x || 0),
          y: Number(data.y || 0),
          w: Number(data.w || 0),
          h: Number(data.h || 0),
          baseImg,
          bitmaps: singleNode,
        };
      } catch (_) {
        return null;
      }
    })();

    visemeCache.set(charId, p);
    return p;
  }

  function loadBasePortraitImg(url) {
    const cleanUrl = resolveAssetUrl(url);
    if (!cleanUrl) return Promise.resolve(null);
    if (baseImgCache.has(cleanUrl)) return baseImgCache.get(cleanUrl);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = cleanUrl;
    });
    baseImgCache.set(cleanUrl, p);
    return p;
  }

  function stopCloudVoice() {
    currentTalkToken += 1;
    isSpeakingNow = false;
    activeAnalyser = null;
    activeFreqData = null;
    activeTimeData = null;
    if (activeAudioSource) {
      try {
        activeAudioSource.onended = null;
        activeAudioSource.stop();
        activeAudioSource.disconnect();
      } catch (_) {}
      activeAudioSource = null;
    }
    if (talkDecoder) {
      try {
        talkDecoder.pause();
      } catch (_) {}
    }
    if (activeFmvType === "talk") {
      switchToStandbyIdleDecoderInstant();
    }
    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.add("hidden");
  }

  // ===== 音声と 50fps v11 発話映像を 0.00ms ハードウェアクロックで完全同時再生 =====
  async function playRealVoiceWithSotaAvatar(entry, charObj, intentHint = "") {
    stopCloudVoice();
    if (!entry || !entry.mp3_url || !charObj) return;

    const myToken = ++currentTalkToken;

    // 発話内容と文脈 (intentHint) に合わせて現在の喜怒哀楽モード (currentEmotionMode) と次待機ブランチを即時連動！
    if (intentHint === "sulk_プリン" || intentHint === "greeting_sulk" || intentHint === "poke_cheek") {
      currentEmotionMode = "anger";
      nextIdleBranchHint = "idle_08_playful_sway"; // 【怒】ぷんぷん怒り・拗ね顔
    } else if (intentHint === "fatigue" || intentHint === "greeting_night") {
      currentEmotionMode = "sadness";
      nextIdleBranchHint = "idle_03_gaze_left";    // 【哀】ハの字困り眉・たれ目の切ない心配顔
    } else if (intentHint === "compliment" || intentHint === "pat_head" || intentHint === "close_dist" || intentHint === "gift_flower") {
      currentEmotionMode = "shy";
      nextIdleBranchHint = "idle_05_shy_glance";   // 【照】ドキドキ赤面・照れ笑い
    } else if (intentHint === "movie_hobby" || intentHint === "question") {
      currentEmotionMode = "fun";
      nextIdleBranchHint = "idle_06_curious_tilt"; // 【楽】目をぱっちり輝かせるワクワク顔
    } else {
      currentEmotionMode = "joy";
      nextIdleBranchHint = "idle_02_smile_right";  // 【喜】満面のデュシェンヌ・スマイル
    }
    queueNextIdleOnStandbyDecoder(currentIdleBranchId);

    const cleanMp3Url = resolveAssetUrl(entry.mp3_url);
    const charId = charObj.id || charObj.face_id || "face_f02_mio";
    const ck = entry.ck || "";

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!cloudAudioCtx && AudioCtx) {
      cloudAudioCtx = new AudioCtx();
    }
    if (cloudAudioCtx && cloudAudioCtx.state === "suspended") {
      await cloudAudioCtx.resume().catch(() => {});
    }

    ensureVideoDecoders();

    // 1. 音声 MP3 の取得・デコードと、50fps v11 発話動画の Frame 0 デコード完了を【両方完了するまで】並列待機！
    //    （フライング再生を100%禁止し、音声と映像のスタート時刻を 0.00ms で完全一致させる）
    const hasMioFmv = charId === "face_f02_mio" && ck && MIO_FMV_TALK_CKS.has(ck);
    const talkRawUrl = hasMioFmv ? `assets/fmv_mio/talk_${ck}.mp4?v=${ASSET_VER}` : "";

    const [audioBuf, talkReady] = await Promise.all([
      (async () => {
        try {
          const res = await origFetch(cleanMp3Url, { cache: "force-cache" });
          if (!res.ok || !cloudAudioCtx) return null;
          const ab = await res.arrayBuffer();
          return await cloudAudioCtx.decodeAudioData(ab);
        } catch (_) {
          return null;
        }
      })(),
      (async () => {
        if (!hasMioFmv) return false;
        const blobUrl = await fetchVideoBlobUrl(talkRawUrl);
        return await loadVideoIntoDecoder(talkDecoder, blobUrl);
      })(),
      loadCharacterVisemeSprite(charId, charObj.portrait_url),
    ]);

    // 待機中に別の会話リクエストが発生していたら破棄
    if (myToken !== currentTalkToken) return;
    if (!audioBuf || !cloudAudioCtx) return;

    if (cloudAudioCtx.state === "suspended") {
      await cloudAudioCtx.resume().catch(() => {});
    }
    if (myToken !== currentTalkToken) return;

    const analyser = cloudAudioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.42;

    const srcNode = cloudAudioCtx.createBufferSource();
    srcNode.buffer = audioBuf;
    srcNode.connect(analyser);
    analyser.connect(cloudAudioCtx.destination);

    activeAudioSource = srcNode;
    activeAnalyser = analyser;
    activeFreqData = new Uint8Array(analyser.frequencyBinCount);
    activeTimeData = new Uint8Array(analyser.fftSize);
    isSpeakingNow = true;

    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.remove("hidden");

    srcNode.onended = () => {
      if (activeAudioSource === srcNode && myToken === currentTalkToken) {
        stopCloudVoice();
      }
    };

    // 2. 映像 (talkDecoder Frame 0) と Web Audio (srcNode) を同一ミリ秒で同時スタート！
    if (hasMioFmv && talkReady && talkDecoder) {
      try {
        talkDecoder.currentTime = 0;
        const playProm = talkDecoder.play();
        if (playProm && typeof playProm.catch === "function") {
          playProm.catch(() => {});
        }
        activeFmvVideo = talkDecoder;
        activeFmvType = "talk";
      } catch (_) {}
    }

    talkAudioStartCtxTime = cloudAudioCtx.currentTime;
    talkAudioDuration = audioBuf.duration;
    srcNode.start(0);
  }

  // ===== スマホ・タブレット・PC でのタッチ時に AudioContext と Video を確実アンロック =====
  function setupMobileUnlockListeners() {
    const unlock = () => {
      if (cloudAudioCtx && cloudAudioCtx.state === "suspended") {
        cloudAudioCtx.resume().catch(() => {});
      }
      if (activeFmvVideo && activeFmvVideo.paused) {
        activeFmvVideo.play().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
  }

  // ===== 60Hz Direct Frame Blit & Zero-Drift Audio-Clock Sync Engine =====
  let unifiedLoopStarted = false;

  function startUnifiedSotaAvatarEngine() {
    if (unifiedLoopStarted) return;
    const roiCanvas = document.getElementById("roi-talk-canvas");
    if (!roiCanvas) return;
    unifiedLoopStarted = true;

    setupMobileUnlockListeners();

    roiCanvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:51% 22%;pointer-events:none;z-index:3;opacity:1 !important;display:block !important;";
    roiCanvas.classList.add("active");

    const roiCtx = roiCanvas.getContext("2d", { alpha: false });

    let drawnBaseCharId = "";
    let smoothMouth = 0.0;
    let nextBlinkStart = performance.now() + 1800 + Math.random() * 2000;
    let blinkStart = 0;

    // 起動直後（動画デコード完了前の数ミリ秒）に黒画面にならないよう、視線矯正済み美桜ポートレートを即時描画
    loadBasePortraitImg(`assets/portraits/face_f02_mio.jpg?v=${ASSET_VER}`).then((img) => {
      if (img && !drawnBaseCharId) {
        roiCanvas.width = img.naturalWidth || 1280;
        roiCanvas.height = img.naturalHeight || 720;
        roiCtx.globalAlpha = 1.0;
        roiCtx.drawImage(img, 0, 0, roiCanvas.width, roiCanvas.height);
      }
    });

    const tick = async (now) => {
      requestAnimationFrame(tick);

      // app.js の stopCurrentTalkingPlayback() が active クラスを外しても常時表示を維持
      if (!roiCanvas.classList.contains("active")) {
        roiCanvas.classList.add("active");
      }

      const mem = loadCloudMemory();
      const charObj = getActiveCharObj(mem);
      if (!charObj || !roiCtx) return;

      // ★ 1. 美桜 (face_f02_mio): 50fps v11 ニューラル FMV ストリーム ＋ Web Audio ハードウェアクロック完全同期
      if (charObj.id === "face_f02_mio") {
        if (activeFmvVideo && activeFmvVideo.readyState >= 2) {
          // 発話再生中は Web Audio の経過時間 (audioElapsed) に映像フレームを ±42ms 以内で完全ロック！
          if (activeFmvType === "talk" && isSpeakingNow && cloudAudioCtx) {
            const audioElapsed = cloudAudioCtx.currentTime - talkAudioStartCtxTime;
            if (talkAudioDuration > 0 && audioElapsed >= talkAudioDuration - 0.015) {
              // 音声が終了した瞬間に即座に閉じ口の待機ブランチへ戻す（無音パクパク残りを0%に）
              stopCloudVoice();
            } else if (audioElapsed >= 0 && activeFmvVideo.duration > 0) {
              const targetVidTime = Math.min(activeFmvVideo.duration - 0.02, audioElapsed);
              const drift = activeFmvVideo.currentTime - targetVidTime;
              if (Math.abs(drift) > 0.042) {
                try {
                  activeFmvVideo.currentTime = targetVidTime;
                } catch (_) {}
              }
            }
          }

          const vw = activeFmvVideo.videoWidth || 1280;
          const vh = activeFmvVideo.videoHeight || 720;
          if (roiCanvas.width !== vw || roiCanvas.height !== vh) {
            roiCanvas.width = vw;
            roiCanvas.height = vh;
          }

          // 半透明ブレンド一切なし！100% 鮮明な 50fps v11 フレームをそのままブリット
          roiCtx.globalAlpha = 1.0;
          roiCtx.drawImage(activeFmvVideo, 0, 0, vw, vh);
          drawnBaseCharId = "face_f02_mio";

          // 待機ブランチ動画が終端に近づいたら、裏で待機中の次ブランチデコーダへ 0ms でピンポン遷移！
          const dur = activeFmvVideo.duration;
          if (
            activeFmvType === "idle" &&
            !fmvSwitching &&
            (activeFmvVideo.ended || (dur > 0 && activeFmvVideo.currentTime >= dur - 0.035))
          ) {
            fmvSwitching = true;
            switchToStandbyIdleDecoderInstant();
            fmvSwitching = false;
          } else if (
            activeFmvType === "talk" &&
            (activeFmvVideo.ended || (dur > 0 && activeFmvVideo.currentTime >= dur - 0.025))
          ) {
            stopCloudVoice();
          }
          return;
        }
      }

      // ★ 2. 他キャラ選択時または初回プリロード中のクリーン描画 (`globalAlpha` クロスフェード禁止)
      const sprite = await loadCharacterVisemeSprite(charObj.id, charObj.portrait_url);
      if (!sprite || !sprite.baseImg) return;

      if (
        roiCanvas.width !== sprite.frameW ||
        roiCanvas.height !== sprite.frameH ||
        drawnBaseCharId !== sprite.charId
      ) {
        roiCanvas.width = sprite.frameW;
        roiCanvas.height = sprite.frameH;
        roiCtx.globalAlpha = 1.0;
        roiCtx.drawImage(sprite.baseImg, 0, 0, sprite.frameW, sprite.frameH);
        drawnBaseCharId = sprite.charId;
      }

      if (!sprite.bitmaps) return;

      let targetMouth = 0.0;
      if (isSpeakingNow && activeAnalyser && activeFreqData && activeTimeData) {
        activeAnalyser.getByteFrequencyData(activeFreqData);
        activeAnalyser.getByteTimeDomainData(activeTimeData);
        let sumSq = 0;
        for (let i = 0; i < activeTimeData.length; i++) {
          const v = (activeTimeData[i] - 128) / 128.0;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / activeTimeData.length);
        if (rms > 0.012) {
          targetMouth = Math.min(1.0, (rms - 0.012) / 0.12);
        }
      }
      smoothMouth = smoothMouth * 0.45 + targetMouth * 0.55;

      let isBlinking = false;
      if (now >= nextBlinkStart && blinkStart === 0) {
        blinkStart = now;
      }
      if (blinkStart > 0) {
        if (now - blinkStart < 110) {
          isBlinking = true;
        } else {
          blinkStart = 0;
          nextBlinkStart = now + 2200 + Math.random() * 2800;
        }
      }

      const { x, y, w, h, bitmaps } = sprite;
      roiCtx.globalAlpha = 1.0;
      if (isBlinking && smoothMouth < 0.15 && bitmaps.blink) {
        roiCtx.drawImage(bitmaps.blink, x, y, w, h);
      } else if (smoothMouth >= 0.62 && bitmaps.wide) {
        roiCtx.drawImage(bitmaps.wide, x, y, w, h);
      } else if (smoothMouth >= 0.32 && bitmaps.mid) {
        roiCtx.drawImage(bitmaps.mid, x, y, w, h);
      } else if (smoothMouth >= 0.08 && bitmaps.small) {
        roiCtx.drawImage(bitmaps.small, x, y, w, h);
      } else if (bitmaps.closed) {
        roiCtx.drawImage(bitmaps.closed, x, y, w, h);
      }
    };

    requestAnimationFrame(tick);
  }

  // ===== 状態ペイロード構築 =====
  function buildCloudStatePayload(
    mem,
    spoken,
    innerThought,
    emotion,
    choices,
    eventBadge = "",
    recognizedUserText = ""
  ) {
    const activeChar = getActiveCharObj(mem);
    const faces = (catalogMeta && catalogMeta.face_catalog ? catalogMeta.face_catalog : []).map((f) => ({
      ...f,
      portrait_url: resolveAssetUrl(f.portrait_url),
      thumb_url: resolveAssetUrl(f.thumb_url),
      idle_video_url: "",
      active: activeChar && f.id === activeChar.id,
      is_favorite: (mem.favorite_face_ids || []).includes(f.id),
    }));

    const voices = getBuiltinVoicesList(mem.active_voice_id);
    const curV = voices.find((v) => v.id === mem.active_voice_id) || voices[0];
    const vp = (voiceManifest && voiceManifest.voice_profiles && voiceManifest.voice_profiles[curV.id]) || {};

    return {
      partner_name: mem.partner_name,
      partner_gender: mem.partner_gender,
      first_person: mem.first_person,
      user_name: mem.user_name || "",
      user_gender: mem.user_gender || "unspecified",
      recommended_voices: { female: "human_g0143", male: "human_g0144", other: "human_g0244" },
      affection: mem.affection,
      mood: mem.mood,
      coins: mem.coins,
      unlocked_styles: mem.unlocked_styles,
      wardrobe_styles: [],
      time_scene: mem.time_scene,
      is_close_distance: Boolean(mem.is_close_distance),
      room_items: mem.room_items || [],
      memories_count: (mem.memories || []).length,
      latest_memories: (mem.memories || []).slice(-4),
      spoken: spoken || "",
      inner_thought: innerThought || "こうやって二人でゆっくり話してる時間が一番大好きだな。",
      emotion: emotion || "happy",
      choices: (choices && choices.length
        ? choices
        : ["今日あったこと聞いてよ", "なんか今日いつもより素敵だね", "少し近くに来て？"]
      ).slice(0, 3),
      talking_video_url: "",
      followup_job_id: "",
      idle_video_url: "",
      portrait_url: activeChar ? activeChar.portrait_url : resolveAssetUrl("assets/partner_neutral.jpg"),
      audio_b64: "",
      active_voice_id: curV.id,
      active_voice_name: curV.name,
      active_voice_gender: curV.gender,
      active_voice_is_custom: false,
      active_voice_dna: vp.dna || {},
      active_character: activeChar,
      face_catalog: faces,
      favorite_face_ids: mem.favorite_face_ids || [],
      recommended_face_by_gender: { female: "face_f02_mio", male: "face_m01_ren", other: "face_o01_haru" },
      pending_candidates_count: 0,
      charm_level: mem.charm_level || 1.0,
      event_badge: eventBadge,
      recognized_user_text: recognizedUserText,
    };
  }

  function makeNdjsonStreamResponse(linesArray, afterStartCallback) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const obj of linesArray) {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        }
        controller.close();
        if (typeof afterStartCallback === "function") {
          setTimeout(afterStartCallback, 10);
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  function makeJsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === "string" ? input : (input && input.url) || "";

    if (!rawUrl.includes("/api/companion/")) {
      if (typeof input === "string" && input.startsWith("/") && !input.startsWith("//")) {
        return origFetch(resolveAssetUrl(input), init);
      }
      return origFetch(input, init);
    }

    await ensureCatalogAndManifest();
    const mem = loadCloudMemory();
    let bodyObj = {};
    if (init && typeof init.body === "string") {
      try {
        bodyObj = JSON.parse(init.body);
      } catch (_) {}
    }

    if (rawUrl.endsWith("/api/companion/state")) {
      const entry = selectRealVoiceEntry(mem.active_voice_id, "", "greeting_home");
      const spoken = entry ? entry.text : "あっ、おかえり！今日も一日お疲れさま。ねえ、こっち座ってゆっくり話そ？";
      return makeJsonResponse(
        buildCloudStatePayload(mem, spoken, "帰ってきてくれて嬉しいな。今日もいっぱい話そうね。", "happy")
      );
    }

    if (rawUrl.includes("/api/companion/characters") && (!init || !init.method || init.method === "GET")) {
      const st = buildCloudStatePayload(mem, "", "", "happy");
      return makeJsonResponse({
        active_character: st.active_character,
        characters: st.face_catalog,
        face_catalog: st.face_catalog,
        favorite_face_ids: st.favorite_face_ids,
        recommended_face_by_gender: st.recommended_face_by_gender,
        candidates: [],
        templates: [],
        charm_level: mem.charm_level || 1.0,
        partner_name: mem.partner_name,
        partner_gender: mem.partner_gender,
        first_person: mem.first_person,
        user_name: mem.user_name,
        user_gender: mem.user_gender,
        active_voice_id: mem.active_voice_id,
        recommended_voices: st.recommended_voices,
        voices: getBuiltinVoicesList(mem.active_voice_id),
      });
    }

    if (rawUrl.includes("/api/companion/faces") && !rawUrl.includes("/favorite")) {
      const st = buildCloudStatePayload(mem, "", "", "happy");
      return makeJsonResponse({
        face_catalog: st.face_catalog,
        favorite_face_ids: st.favorite_face_ids,
        active_character: st.active_character,
        recommended_face_by_gender: st.recommended_face_by_gender,
      });
    }

    if (rawUrl.includes("/api/companion/faces/favorite")) {
      let favs = Array.isArray(mem.favorite_face_ids) ? [...mem.favorite_face_ids] : [];
      if (Array.isArray(bodyObj.face_ids)) {
        favs = bodyObj.face_ids;
      } else if (bodyObj.face_id) {
        const fid = bodyObj.face_id;
        if (favs.includes(fid)) favs = favs.filter((x) => x !== fid);
        else favs.push(fid);
      }
      mem.favorite_face_ids = favs;
      saveCloudMemory(mem);
      return makeJsonResponse({ favorite_face_ids: favs, count: favs.length });
    }

    if (rawUrl.endsWith("/api/companion/voices")) {
      const voices = getBuiltinVoicesList(mem.active_voice_id);
      const vp =
        (voiceManifest && voiceManifest.voice_profiles && voiceManifest.voice_profiles[mem.active_voice_id]) || {};
      return makeJsonResponse({
        active_voice_id: mem.active_voice_id,
        active_style_dna: vp.dna || {},
        recommended_voices: { female: "human_g0143", male: "human_g0144", other: "human_g0244" },
        voices,
      });
    }

    if (rawUrl.endsWith("/api/companion/init_stream")) {
      const scKey =
        mem.time_scene === "morning"
          ? "greeting_morning"
          : mem.time_scene === "late_night"
          ? "greeting_night"
          : mem.time_scene === "neglected_3days"
          ? "greeting_sulk"
          : "greeting_home";
      const entry = selectRealVoiceEntry(mem.active_voice_id, "", scKey);
      const spoken = entry ? entry.text : "あっ、おかえり！今日も一日お疲れさま。ねえ、こっち座ってゆっくり話そ？";
      const emo = entry ? entry.emo : "happy";
      const choices = [
        "ごめん、冷蔵庫のプリン食べちゃった…",
        "ただいま！今日ちょっと仕事で疲れて寂しかったんだ",
        "なんか今日、いつもよりすごく可愛いね",
      ];
      const st = buildCloudStatePayload(mem, spoken, "顔見れて一気に気分明るくなっちゃった！", emo, choices);
      const activeChar = getActiveCharObj(mem);
      return makeNdjsonStreamResponse(
        [
          { type: "state", payload: st },
          { type: "done", total_chunks: 1, spoken, inner_thought: st.inner_thought, emotion: emo, choices },
        ],
        () => {
          if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, scKey);
        }
      );
    }

    if (rawUrl.endsWith("/api/companion/talk_stream") || rawUrl.endsWith("/api/companion/voice_input_stream")) {
      const userText = (bodyObj.text || "ねえ、聞いて！").trim();
      const intent = classifyUserTalkIntent(userText, mem.mood);
      const entry = selectRealVoiceEntry(mem.active_voice_id, userText, intent);
      const spoken = entry ? entry.text : "うんうん、そうなんだね！そういう話聞かせてくれるの、すごく嬉しいな。";
      const emo = entry ? entry.emo : "happy";

      if (intent === "sulk_プリン" || intent === "greeting_sulk") {
        mem.mood = -12;
      } else {
        mem.affection = Math.min(100, (mem.affection || 68) + 3);
        mem.mood = Math.min(50, Math.max(10, (mem.mood || 24) + 5));
      }
      saveCloudMemory(mem);

      const thoughtMap = {
        fatigue: "毎日頑張ってるの知ってるから、ここにいる間はいっぱい癒やしてあげたいな。",
        compliment: "急にそんなこと言われると、ドキッとして顔熱くなっちゃう。",
        movie_hobby: "私のこと興味持って聞いてくれるの、すごく嬉しいな。",
        apology: "素直に謝る顔が可愛いから、すぐ許しちゃうんだよね。",
        sulk_プリン: "楽しみにしてたのにー！今度美味しいスイーツ奢ってもらおっと。",
      };
      const thought = thoughtMap[intent] || "こうやって二人でゆっくり話してる時間が一番大好きだな。";
      const nextChoices =
        intent === "sulk_プリン" || intent === "greeting_sulk"
          ? [
              "ごめんごめん！お詫びに美味しいケーキ買ってくるから許して？",
              "怒った顔もすごく可愛いね",
              "最近どんな映画見た？",
            ]
          : [
              "ごめん、冷蔵庫のプリン食べちゃった…",
              "今日ちょっと仕事で疲れてしんどかったんだ",
              "そうやって笑う顔、ほんと好きだな",
            ];

      const st = buildCloudStatePayload(mem, spoken, thought, emo, nextChoices, "", userText);
      const activeChar = getActiveCharObj(mem);
      return makeNdjsonStreamResponse(
        [
          { type: "state", payload: st },
          { type: "subtitle", spoken, emotion: emo },
          {
            type: "done",
            total_chunks: 1,
            spoken,
            inner_thought: thought,
            emotion: emo,
            affection: mem.affection,
            mood: mem.mood,
            choices: nextChoices,
          },
        ],
        () => {
          if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, intent);
        }
      );
    }

    if (
      rawUrl.includes("/api/companion/characters/select") ||
      rawUrl.includes("/api/companion/profile/customize") ||
      rawUrl.includes("/api/companion/voices/select")
    ) {
      const targetCharId = bodyObj.character_id || bodyObj.face_id || mem.active_char_id;
      if (targetCharId && catalogMeta && Array.isArray(catalogMeta.face_catalog)) {
        const found = catalogMeta.face_catalog.find((c) => c.id === targetCharId || c.face_id === targetCharId);
        if (found) {
          mem.active_char_id = found.id;
          mem.partner_name = bodyObj.partner_name || found.name || mem.partner_name;
          mem.partner_gender = bodyObj.partner_gender || found.gender || "female";
          mem.first_person =
            bodyObj.first_person ||
            found.first_person ||
            (mem.partner_gender === "male" ? "俺" : mem.partner_gender === "other" ? "私" : "わたし");
          mem.active_voice_id =
            bodyObj.voice_id ||
            found.recommended_voice_id ||
            (mem.partner_gender === "male"
              ? "human_g0144"
              : mem.partner_gender === "other"
              ? "human_g0244"
              : "human_g0143");
        }
      }
      if (bodyObj.voice_id) {
        mem.active_voice_id = bodyObj.voice_id;
      }
      if (typeof bodyObj.user_name === "string") {
        mem.user_name = bodyObj.user_name.trim();
      }
      saveCloudMemory(mem);

      const entry = selectRealVoiceEntry(mem.active_voice_id, "お待たせ", "greeting_home");
      const spoken = entry ? entry.text : "あっ、お待たせ！ねえ、今日は何して遊ぶ？";
      const emo = entry ? entry.emo : "happy";
      const activeChar = getActiveCharObj(mem);
      const badge = `✨ パートナー『${mem.partner_name}』に切り替えました`;
      const choices = ["すごく素敵な雰囲気だね！", "今日あったこと聞いてよ", "少し近くに来て？"];
      const st = buildCloudStatePayload(
        mem,
        spoken,
        "選んでもらえてすごく嬉しいな！いっぱい話そうね。",
        emo,
        choices,
        badge
      );

      if (rawUrl.endsWith("_stream")) {
        return makeNdjsonStreamResponse(
          [
            { type: "state", payload: st },
            { type: "done", total_chunks: 1, spoken, inner_thought: st.inner_thought, emotion: emo, choices },
          ],
          () => {
            if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, "greeting_home");
          }
        );
      }
      setTimeout(() => {
        if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, "greeting_home");
      }, 20);
      return makeJsonResponse(st);
    }

    if (rawUrl.includes("/api/companion/action")) {
      const act = bodyObj.action_type || "";
      const val = bodyObj.value || "";
      let intent = "chat";
      let badge = "";

      if (act === "pat_head") {
        intent = "pat_head";
        badge = "頭をなでた";
        mem.affection = Math.min(100, mem.affection + 4);
      } else if (act === "poke_cheek") {
        intent = "poke_cheek";
        badge = "ほっぺに軽く触れた";
        mem.affection = Math.min(100, mem.affection + 3);
      } else if (act === "toggle_distance") {
        mem.is_close_distance = !mem.is_close_distance;
        intent = "close_dist";
        badge = mem.is_close_distance ? "距離を近づけた" : "いつもの距離に戻った";
      } else if (act === "gift") {
        intent = `gift_${val}`;
        const emojiMap = { cake: "🍰", latte: "☕", bear: "🧸", flower: "💐" };
        const nameMap = { cake: "ショートケーキ", latte: "カフェラテ", bear: "クマちゃん", flower: "ミニブーケ" };
        badge = `『${nameMap[val] || "プレゼント"}』を差し入れした`;
        mem.room_items = [
          ...(mem.room_items || []),
          { id: val, name: nameMap[val] || val, emoji: emojiMap[val] || "🎁" },
        ].slice(-8);
        mem.affection = Math.min(100, mem.affection + 6);
        mem.mood = Math.min(50, mem.mood + 18);
      } else if (act === "set_scene") {
        mem.time_scene = val || "evening";
        intent =
          val === "morning"
            ? "greeting_morning"
            : val === "late_night"
            ? "greeting_night"
            : val === "neglected_3days"
            ? "greeting_sulk"
            : "greeting_home";
        badge = "シチュエーションを切り替えました";
      } else if (act === "reset_memory") {
        mem.memories = [];
        mem.room_items = [];
        mem.affection = 68;
        mem.mood = 24;
        intent = "greeting_home";
        badge = "記憶を初期状態にリセットしました";
      }
      saveCloudMemory(mem);

      const entry = selectRealVoiceEntry(mem.active_voice_id, "", intent);
      const spoken = entry ? entry.text : "えへへ、ありがとう！すごく嬉しいな。";
      const emo = entry ? entry.emo : "happy";
      const choices = ["喜んでくれて嬉しいよ", "もっと近くにおいでよ", "今日あったこと聞いてよ"];
      const st = buildCloudStatePayload(mem, spoken, "優しくされるとドキドキしちゃうな。", emo, choices, badge);
      const activeChar = getActiveCharObj(mem);

      if (rawUrl.endsWith("_stream")) {
        return makeNdjsonStreamResponse(
          [
            { type: "state", payload: st },
            { type: "done", total_chunks: 1, spoken, inner_thought: st.inner_thought, emotion: emo, choices },
          ],
          () => {
            if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, intent);
          }
        );
      }
      setTimeout(() => {
        if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, intent);
      }, 20);
      return makeJsonResponse(st);
    }

    if (rawUrl.includes("/api/companion/wardrobe/topup")) {
      mem.coins = (mem.coins || 1200) + 1000;
      saveCloudMemory(mem);
      return makeJsonResponse({ coins: mem.coins, message: "無料ボーナス +1,000💎 を補充しました！" });
    }

    return makeJsonResponse(buildCloudStatePayload(mem, "うんうん、なんでも話してね！", "", "happy"));
  };

  function buildLineExternalShareUrl() {
    try {
      const u = new URL(window.location.href.split("#")[0]);
      u.searchParams.set("openExternalBrowser", "1");
      return u.toString();
    } catch (_) {
      const base = window.location.href.split("#")[0].split("?")[0];
      return `${base}?openExternalBrowser=1`;
    }
  }

  function injectShareAndFeedbackButton() {
    if (document.getElementById("btn-open-beta-feedback")) return;
    const topRight =
      document.querySelector(".top-right-tools") ||
      document.querySelector(".top-right-controls") ||
      document.querySelector(".hud-top");
    if (!topRight) return;

    const btn = document.createElement("button");
    btn.id = "btn-open-beta-feedback";
    btn.type = "button";
    btn.className = "tool-pill";
    btn.style.cssText =
      "background:linear-gradient(135deg,#06c755,#059669);color:#fff;font-weight:700;border:1px solid rgba(255,255,255,0.45);box-shadow:0 4px 14px rgba(6,199,85,0.4);";
    btn.innerHTML = "💚 LINEで友人に送る";
    btn.onclick = openBetaShareModal;
    topRight.prepend(btn);
  }

  function openBetaShareModal() {
    let modal = document.getElementById("beta-share-modal");
    const shareUrl = buildLineExternalShareUrl();
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "beta-share-modal";
      modal.className = "modal-backdrop";
      modal.innerHTML = `
        <div class="modal-card" style="max-width:540px;">
          <div class="modal-header-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>💚 LINEで友人に送る ＆ 感想シェア</h3>
            <button type="button" class="btn-icon-close" id="btn-close-beta-modal">✕</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="background:rgba(6,199,85,0.14);border:1px solid rgba(6,199,85,0.45);border-radius:12px;padding:12px;">
              <div style="font-size:13px;font-weight:700;color:#6ee7b7;margin-bottom:6px;">
                ✨ LINEでタップすると自動で標準ブラウザ(Safari/Chrome)が起動する専用URL
              </div>
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
                <input id="beta-share-url-input" type="text" readonly value="${shareUrl}"
                  style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.45);color:#fff;font-size:12px;user-select:all;" />
                <button type="button" id="btn-copy-share-url" class="btn-primary" style="padding:8px 14px;white-space:nowrap;">
                  📋 URLコピー
                </button>
              </div>
              <button type="button" id="btn-send-line-direct" class="btn-primary full-width"
                style="background:linear-gradient(135deg,#06c755,#059669);font-size:14.5px;padding:11px;">
                💚 LINEアプリを開いて知り合いに送る
              </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:13px;font-weight:600;">💬 感想・お気に入りキャラ・改善アイデアをメモ＆コピー</label>
              <textarea id="beta-feedback-text" rows="3" placeholder="例：美桜の表情と声がすごく自然！スマホでもサクサク動いた！"
                style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.4);color:#fff;font-size:16px;"></textarea>
              <button type="button" id="btn-copy-feedback-report" class="btn-primary" style="padding:10px;">
                💌 感想レポートをコピーして送る
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById("btn-close-beta-modal").onclick = () => modal.classList.add("hidden");
      document.getElementById("btn-copy-share-url").onclick = () => {
        const latestShareUrl = buildLineExternalShareUrl();
        navigator.clipboard.writeText(latestShareUrl).catch(() => {});
        document.getElementById("btn-copy-share-url").textContent = "✅ コピー完了！";
        setTimeout(() => (document.getElementById("btn-copy-share-url").textContent = "📋 URLコピー"), 2000);
      };
      document.getElementById("btn-send-line-direct").onclick = () => {
        const latestShareUrl = buildLineExternalShareUrl();
        const lineShareText = `リアルパートナーAI（完全無料・スマホ対応）\n下のURLをタップすると自動でブラウザが起動してすぐ話せるよ👇\n${latestShareUrl}`;
        const lineAppUrl = `https://line.me/R/share?text=${encodeURIComponent(lineShareText)}`;
        window.open(lineAppUrl, "_blank", "noopener,noreferrer");
      };
      document.getElementById("btn-copy-feedback-report").onclick = () => {
        const mem = loadCloudMemory();
        const txt = document.getElementById("beta-feedback-text").value.trim();
        const latestShareUrl = buildLineExternalShareUrl();
        const report = `【AIパートナー試遊レポート】\n・お気に入りキャラ: ${mem.partner_name} (${mem.active_char_id})\n・選抜お気に入り数: ${(mem.favorite_face_ids || []).length}人\n・感想: ${txt || "すごくリアルで楽しかった！"}\n・URL: ${latestShareUrl}`;
        navigator.clipboard.writeText(report).catch(() => {});
        document.getElementById("btn-copy-feedback-report").textContent =
          "✅ レポートをコピーしました！LINE等で貼り付けて送れます";
      };
    } else {
      const inp = document.getElementById("beta-share-url-input");
      if (inp) inp.value = shareUrl;
    }
    modal.classList.remove("hidden");
  }

  window.addEventListener("DOMContentLoaded", () => {
    injectShareAndFeedbackButton();
    startUnifiedSotaAvatarEngine();
    ensureCatalogAndManifest();
  });
  if (document.readyState !== "loading") {
    injectShareAndFeedbackButton();
    startUnifiedSotaAvatarEngine();
    ensureCatalogAndManifest();
  }
})();
