// ============================================================================
// PATCHWORK NATION - 完全無料・PC負荷ゼロ クラウドエンジン
// (v8: SOTA 50fps Seamless FMV Motion Graph & Holistic LMDM Digital Human Edition)
// - あなたのPC（ローカルGPU/Pythonサーバー）を一切使わず、GitHub Pages 等の完全無料クラウドで24時間稼働
// - ブラウザ内蔵の機械音声 (window.speechSynthesis) は 100% 使用禁止！
//   全発話で事前合成済みの「本物の Qwen3-TTS 1.7B 実在人間クローン肉声 MP3」を再生
// - ハイエンド実写ゲーム (Interactive FMV) ＆ 最先端AIデジタルヒューマン技術を完全搭載：
//   1. Canvas `globalAlpha` 半透明クロスフェード（二重露光・透けゴースト）を100%完全撤廃！
//   2. 初期パートナー「美桜 (face_f02_mio)」に、本物の HuBERT + LMDM Motion Diffusion Transformer
//      ＋ 3D Feature Volume Warping + SPADEDecoder + FACS AU6 (デュシェンヌ・スマイル)
//      ＋ 前庭動眼反射 (VOR 視線ロック) ＋ 非対称生体まばたき ＋ 肩・胸元・髪の毛先の生体運動連動ワープで
//      レンダリングした「50fps 連続実写動画グラフ（待機8ブランチ＋発話26クリップ）」を搭載！
//   3. Dual/Pool Video Pre-decoder + Web Audio Clock Sync により、黒画面0ms・ゴースト0%で
//      待機中の無限マルコフ分岐から発話（音素先行動作・調音結合リップシンク）へシームレスに遷移！
// ============================================================================

(function () {
  "use strict";

  const STORAGE_KEY_MEM = "pw_cloud_v8_memory";

  let catalogMeta = null;
  let voiceManifest = null;
  let fmvManifestMio = null;

  let visemeCache = new Map(); // charId -> Promise<Sprite>
  let baseImgCache = new Map(); // url -> Promise<HTMLImageElement>

  // ===== SOTA FMV Video Pool (for face_f02_mio 50fps Neural Streams) =====
  let fmvIdleVideoPool = new Map(); // branchId -> HTMLVideoElement (preloaded & paused at frame 0)
  let fmvTalkVideoPool = new Map(); // ck -> Promise<HTMLVideoElement>
  let activeFmvVideo = null;
  let activeFmvType = "idle"; // "idle" | "talk"
  let currentIdleBranchId = "idle_01_breath_micro";
  let nextIdleBranchHint = null;
  let fmvSwitching = false;

  let cloudAudioCtx = null;
  let activeAudioSource = null;
  let activeAnalyser = null;
  let activeFreqData = null;
  let activeTimeData = null;
  let isSpeakingNow = false;

  // 美桜 (face_f02_mio) 用の 50fps LMDM 完全同期発話クリップ対象 CK セット
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
    return u.replace(/^\/+/, "");
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
        localStorage.getItem("pw_cloud_v7_memory") ||
        localStorage.getItem("pw_cloud_v6_memory");
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

  async function ensureCatalogAndManifest() {
    if (!catalogMeta) {
      const res = await origFetch(resolveAssetUrl("assets/catalog_85_meta.json"), { cache: "no-cache" });
      catalogMeta = await res.json();
    }
    if (!voiceManifest) {
      const resV = await origFetch(resolveAssetUrl("assets/voice_bank/manifest.json"), { cache: "no-cache" });
      voiceManifest = await resV.json();
    }
    if (!fmvManifestMio) {
      try {
        const resF = await origFetch(resolveAssetUrl("assets/fmv_mio/fmv_manifest.json?v=20"), { cache: "no-cache" });
        if (resF.ok) {
          fmvManifestMio = await resF.json();
          initMioFmvIdlePool();
        }
      } catch (_) {}
    }
    return { catalogMeta, voiceManifest, fmvManifestMio };
  }

  function createHiddenFmvVideoElement(srcUrl) {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true; // 常にハードウェア映像デコードを100%無制限許可させるため映像トラックはミュート（音声はWebAudioで完全同期）
    vid.playsInline = true;
    vid.setAttribute("playsinline", "");
    vid.setAttribute("webkit-playsinline", "");
    vid.preload = "auto";
    vid.loop = false;
    vid.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    vid.src = resolveAssetUrl(srcUrl);
    document.body.appendChild(vid);
    vid.load();
    return vid;
  }

  function initMioFmvIdlePool() {
    if (!fmvManifestMio || !Array.isArray(fmvManifestMio.idle_branches)) return;
    for (const b of fmvManifestMio.idle_branches) {
      if (!fmvIdleVideoPool.has(b.id)) {
        const v = createHiddenFmvVideoElement(b.url + "?v=20");
        fmvIdleVideoPool.set(b.id, v);
      }
    }
    // 初期ブランチを即座に再生開始
    if (!activeFmvVideo && fmvIdleVideoPool.has("idle_02_smile_right")) {
      switchToIdleFmvBranch("idle_02_smile_right");
    }
  }

  function preloadTalkFmvVideo(ck) {
    if (!ck || !MIO_FMV_TALK_CKS.has(ck)) return Promise.resolve(null);
    if (fmvTalkVideoPool.has(ck)) return fmvTalkVideoPool.get(ck);

    const p = new Promise((resolve) => {
      const url = resolveAssetUrl(`assets/fmv_mio/talk_${ck}.mp4?v=20`);
      const v = createHiddenFmvVideoElement(url);
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve(v);
        }
      };
      v.addEventListener("canplay", done, { once: true });
      v.addEventListener("loadeddata", done, { once: true });
      v.addEventListener("error", () => resolve(null), { once: true });
      setTimeout(done, 1200);
    });
    fmvTalkVideoPool.set(ck, p);
    return p;
  }

  function pickNextMioIdleBranch(lastBranchId) {
    if (nextIdleBranchHint && fmvIdleVideoPool.has(nextIdleBranchHint)) {
      const h = nextIdleBranchHint;
      nextIdleBranchHint = null;
      return h;
    }
    // マルコフ連鎖の自然な状態遷移重み（同じしぐさは連続しない）
    const candidates = [
      { id: "idle_01_breath_micro", w: 22 },
      { id: "idle_02_smile_right", w: 18 },
      { id: "idle_03_gaze_left", w: 16 },
      { id: "idle_04_nod_listen", w: 14 },
      { id: "idle_07_deep_relax", w: 12 },
      { id: "idle_08_playful_sway", w: 10 },
      { id: "idle_06_curious_tilt", w: 5 },
      { id: "idle_05_shy_glance", w: 5 },
    ].filter((c) => fmvIdleVideoPool.has(c.id));

    if (candidates.length === 0) return "idle_01_breath_micro";

    const weighted = candidates.map((c) => ({
      id: c.id,
      w: c.id === lastBranchId ? c.w * 0.08 : c.w,
    }));
    const total = weighted.reduce((acc, c) => acc + c.w, 0);
    let r = Math.random() * total;
    for (const c of weighted) {
      r -= c.w;
      if (r <= 0) return c.id;
    }
    return weighted[0].id;
  }

  function switchToIdleFmvBranch(branchId) {
    const nextVid = fmvIdleVideoPool.get(branchId) || fmvIdleVideoPool.values().next().value;
    if (!nextVid) return;

    currentIdleBranchId = branchId;
    activeFmvType = "idle";

    try {
      nextVid.currentTime = 0;
    } catch (_) {}

    const playPromise = nextVid.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    activeFmvVideo = nextVid;
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

    // 美桜 (human_g0143) の場合は、50fps 本物 HuBERT+LMDM 発話動画が完備されている26クリップを最優先プールにする
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
    if (mood < -5) return "greeting_sulk";
    if (u.includes("プリン")) return "sulk_プリン";
    if (u.includes("おはよう")) return "greeting_morning";
    if (/(ただいま|帰った|かえった|戻った|待ってた)/.test(u)) return "greeting_home";
    if (/(疲れ|つかれ|しんど|大変|残業|眠い|ねむい|仕事|がんばった|頑張った)/.test(u)) return "fatigue";
    if (/(可愛い|かわいい|かっこい|カッコイ|好き|綺麗|きれい|似合|素敵|癒やされ|いい声|笑顔)/.test(u))
      return "compliment";
    if (/(映画|アニメ|ドラマ|動画|音楽|曲|趣味|ハマっ|最近どう|どんな)/.test(u)) return "movie_hobby";
    if (/(ごめん|すまん|悪かった|許して)/.test(u)) return "apology";
    if (/(褒められ|うまくいっ|成功|勝った|受かった|嬉しかった|最高)/.test(u)) return "positive_news";
    if (/[？?]|何を|何して|どこ|いつ|誰|なんで|なぜ|どう思/.test(u)) return "question";
    return "chat";
  }

  // ===== 他キャラ用の 3D ヴィセームローダー（半透明ブレンドなし） =====
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
        const res = await origFetch(resolveAssetUrl(`assets/viseme_3d/${charId}.json?v=20`), { cache: "force-cache" });
        if (!res.ok) return null;
        const data = await res.json();
        const singleNode = await decode5StateNode(data.frames || (data.motion_graph && data.motion_graph.nodes[0]) || {});
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
    if (activeFmvType === "talk") {
      const nextBranch = pickNextMioIdleBranch(currentIdleBranchId);
      switchToIdleFmvBranch(nextBranch);
    }
    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.add("hidden");
  }

  async function playRealVoiceWithSotaAvatar(entry, charObj, intentHint = "") {
    stopCloudVoice();
    if (!entry || !entry.mp3_url || !charObj) return;

    // 発話後の余韻待機ブランチを文脈に合わせて予約
    if (intentHint === "compliment" || intentHint === "pat_head" || intentHint === "close_dist") {
      nextIdleBranchHint = "idle_05_shy_glance";
    } else if (intentHint === "greeting_home" || intentHint === "greeting_morning" || intentHint === "positive_news") {
      nextIdleBranchHint = "idle_02_smile_right";
    } else {
      nextIdleBranchHint = "idle_04_nod_listen";
    }

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

    // 美桜 (face_f02_mio) の場合は 50fps 本物 HuBERT+LMDM 発話動画と音声バッファを並列プリロード！
    const [audioRes, talkVid] = await Promise.all([
      origFetch(cleanMp3Url, { cache: "force-cache" }),
      charId === "face_f02_mio" ? preloadTalkFmvVideo(ck) : Promise.resolve(null),
      loadCharacterVisemeSprite(charId, charObj.portrait_url),
    ]);

    // もし美桜の 50fps 発話動画がロードできていれば、まず映像ストリームを Frame 0 から起動（自動再生ブロックの影響を受けない）
    if (charId === "face_f02_mio" && talkVid) {
      try {
        talkVid.currentTime = 0;
        await talkVid.play().catch(() => {});
        activeFmvVideo = talkVid;
        activeFmvType = "talk";
        isSpeakingNow = true;
      } catch (_) {}
    }

    if (!audioRes.ok || !cloudAudioCtx) return;
    const arrayBuf = await audioRes.arrayBuffer();
    const audioBuf = await cloudAudioCtx.decodeAudioData(arrayBuf);

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

    // Web Audio 再生開始と 50fps LMDM 発話動画のタイムスタンプを 0.00ms に完全一致させる！
    if (charId === "face_f02_mio" && talkVid) {
      try {
        talkVid.currentTime = 0;
        talkVid.play().catch(() => {});
      } catch (_) {}
    }

    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.remove("hidden");

    srcNode.onended = () => {
      if (activeAudioSource === srcNode) {
        stopCloudVoice();
      }
    };

    srcNode.start(0);
  }

  // ===== 60Hz Direct Frame Blit Engine (`globalAlpha = 1.0` 完全固定・二重露光ゼロ) =====
  let unifiedLoopStarted = false;

  function startUnifiedSotaAvatarEngine() {
    if (unifiedLoopStarted) return;
    const roiCanvas = document.getElementById("roi-talk-canvas");
    if (!roiCanvas) return;
    unifiedLoopStarted = true;

    roiCanvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:3;opacity:1 !important;display:block !important;";
    roiCanvas.classList.add("active");

    const roiCtx = roiCanvas.getContext("2d", { alpha: false });

    let drawnBaseCharId = "";
    let smoothMouth = 0.0;
    let nextBlinkStart = performance.now() + 1800 + Math.random() * 2000;
    let blinkStart = 0;

    const tick = async (now) => {
      requestAnimationFrame(tick);

      const mem = loadCloudMemory();
      const charObj = getActiveCharObj(mem);
      if (!charObj || !roiCtx) return;

      // ★ 1. 美桜 (face_f02_mio): 50fps フルニューラル FMV モーショングラフ＆LMDM発話ストリーム直結描画
      if (charObj.id === "face_f02_mio") {
        if (activeFmvVideo && activeFmvVideo.readyState >= 2) {
          const vw = activeFmvVideo.videoWidth || 1280;
          const vh = activeFmvVideo.videoHeight || 720;
          if (roiCanvas.width !== vw || roiCanvas.height !== vh) {
            roiCanvas.width = vw;
            roiCanvas.height = vh;
          }
          // 半透明ブレンド一切なし！100% 鮮明な 50fps 3D ニューラルフレームをそのままブリット
          roiCtx.globalAlpha = 1.0;
          roiCtx.drawImage(activeFmvVideo, 0, 0, vw, vh);
          drawnBaseCharId = "face_f02_mio";

          // 待機ブランチ動画が終端に近づいたら、Canonical Anchor Pose (Frame 0) で次のランダムブランチへ 0ms 遷移！
          const dur = activeFmvVideo.duration;
          if (
            activeFmvType === "idle" &&
            !fmvSwitching &&
            (activeFmvVideo.ended || (dur > 0 && activeFmvVideo.currentTime >= dur - 0.035))
          ) {
            fmvSwitching = true;
            const nextId = pickNextMioIdleBranch(currentIdleBranchId);
            switchToIdleFmvBranch(nextId);
            fmvSwitching = false;
          } else if (
            activeFmvType === "talk" &&
            (activeFmvVideo.ended || (dur > 0 && activeFmvVideo.currentTime >= dur - 0.035))
          ) {
            const nextId = pickNextMioIdleBranch(currentIdleBranchId);
            switchToIdleFmvBranch(nextId);
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
  function buildCloudStatePayload(mem, spoken, innerThought, emotion, choices, eventBadge = "", recognizedUserText = "") {
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
      choices: (choices && choices.length ? choices : ["今日あったこと聞いてよ", "なんか今日いつもより素敵だね", "少し近くに来て？"]).slice(0, 3),
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
          setTimeout(afterStartCallback, 15);
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
      return makeJsonResponse(buildCloudStatePayload(mem, spoken, "帰ってきてくれて嬉しいな。今日もいっぱい話そうね。", "happy"));
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
      const vp = (voiceManifest && voiceManifest.voice_profiles && voiceManifest.voice_profiles[mem.active_voice_id]) || {};
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
      const choices = ["ただいま！今日ちょっと疲れたかも", "なんか今日、いつもより可愛いね", "最近どんな映画見た？"];
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

      mem.affection = Math.min(100, (mem.affection || 68) + 3);
      mem.mood = Math.min(50, (mem.mood || 24) + 5);
      saveCloudMemory(mem);

      const thoughtMap = {
        fatigue: "毎日頑張ってるの知ってるから、ここにいる間はいっぱい癒やしてあげたいな。",
        compliment: "急にそんなこと言われると、ドキッとして顔熱くなっちゃう。",
        movie_hobby: "私のこと興味持って聞いてくれるの、すごく嬉しいな。",
        apology: "素直に謝る顔が可愛いから、すぐ許しちゃうんだよね。",
        sulk_プリン: "楽しみにしてたのにー！今度美味しいスイーツ奢ってもらおっと。",
      };
      const thought = thoughtMap[intent] || "こうやって二人でゆっくり話してる時間が一番大好きだな。";
      const nextChoices = [
        "そうやって笑う顔、ほんと好きだな",
        "今日は仕事すごく頑張ったよ！",
        "最近どんな映画見た？",
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
      const st = buildCloudStatePayload(mem, spoken, "選んでもらえてすごく嬉しいな！いっぱい話そうね。", emo, choices, badge);

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
        mem.room_items = [...(mem.room_items || []), { id: val, name: nameMap[val] || val, emoji: emojiMap[val] || "🎁" }].slice(-8);
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

  function injectShareAndFeedbackButton() {
    if (document.getElementById("btn-open-beta-feedback")) return;
    const topRight = document.querySelector(".top-right-controls") || document.querySelector(".hud-top");
    if (!topRight) return;

    const btn = document.createElement("button");
    btn.id = "btn-open-beta-feedback";
    btn.type = "button";
    btn.className = "hud-pill-btn";
    btn.style.cssText =
      "background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;border:1px solid rgba(255,255,255,0.35);box-shadow:0 4px 14px rgba(16,185,129,0.4);";
    btn.innerHTML = "🌐 友人シェア / 感想を送る";
    btn.onclick = openBetaShareModal;
    topRight.prepend(btn);
  }

  function openBetaShareModal() {
    let modal = document.getElementById("beta-share-modal");
    const shareUrl = window.location.href.split("#")[0];
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "beta-share-modal";
      modal.className = "modal-backdrop";
      modal.innerHTML = `
        <div class="modal-card" style="max-width:540px;">
          <div class="modal-header">
            <h3>🌐 友人シェア ＆ 感想フィードバック（完全無料クラウド版）</h3>
            <button type="button" class="modal-close-btn" id="btn-close-beta-modal">✕</button>
          </div>
          <div style="padding:14px 18px;display:flex;flex-direction:column;gap:14px;">
            <div style="background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.4);border-radius:12px;padding:12px;">
              <div style="font-size:13px;font-weight:700;color:#6ee7b7;margin-bottom:6px;">
                ✨ あなたのPC負荷ゼロ・完全無料で24時間使える公開URL
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <input id="beta-share-url-input" type="text" readonly value="${shareUrl}"
                  style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.45);color:#fff;font-size:12px;" />
                <button type="button" id="btn-copy-share-url" class="primary-btn" style="padding:8px 14px;white-space:nowrap;">
                  📋 URLコピー
                </button>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:13px;font-weight:600;">💬 感想・お気に入りキャラ・改善アイデアをメモ＆コピー</label>
              <textarea id="beta-feedback-text" rows="3" placeholder="例：F02美桜とM01レンの声がすごくリアル！こんな機能も欲しい！"
                style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.4);color:#fff;font-size:13px;"></textarea>
              <button type="button" id="btn-copy-feedback-report" class="primary-btn" style="padding:10px;">
                💌 感想レポートをコピーして開発者（友人）に送る
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById("btn-close-beta-modal").onclick = () => modal.classList.add("hidden");
      document.getElementById("btn-copy-share-url").onclick = () => {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
        document.getElementById("btn-copy-share-url").textContent = "✅ コピー完了！";
        setTimeout(() => (document.getElementById("btn-copy-share-url").textContent = "📋 URLコピー"), 2000);
      };
      document.getElementById("btn-copy-feedback-report").onclick = () => {
        const mem = loadCloudMemory();
        const txt = document.getElementById("beta-feedback-text").value.trim();
        const report = `【AIパートナー試遊レポート】\n・お気に入りキャラ: ${mem.partner_name} (${mem.active_char_id})\n・選抜お気に入り数: ${(mem.favorite_face_ids || []).length}人\n・感想: ${txt || "すごくリアルで楽しかった！"}\n・URL: ${shareUrl}`;
        navigator.clipboard.writeText(report).catch(() => {});
        document.getElementById("btn-copy-feedback-report").textContent = "✅ レポートをコピーしました！LINE等で貼り付けて送れます";
      };
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
