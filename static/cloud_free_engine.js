// ============================================================================
// PATCHWORK NATION - 完全無料・PC負荷ゼロ クラウドエンジン (v6 Head-Locked Ditto 3D Edition)
// - あなたのPC（ローカルGPU/Pythonサーバー）を一切使わず、GitHub Pages 等の完全無料クラウドで24時間稼働
// - ブラウザ内蔵の機械音声 (window.speechSynthesis) は 100% 使用禁止！
//   全発話で事前合成済みの「本物の Qwen3-TTS 1.7B 実在人間クローン肉声 MP3 (assets/voice_bank/*.mp3)」を再生
// - 手書き2Dワープや雑な図形描画は 100% 使用禁止！
//   全85キャラ＋6衣装すべてで「本物の Ditto 3D (stitch_net + warp_net + SPADEDecoder) 頭蓋完全固定キーフレーム」
//   (assets/viseme_3d/*.json) を使用し、待機中から発話中まで単一の60fps 3Dキャンバスでシームレスに描画
// ============================================================================

(function () {
  "use strict";

  const STORAGE_KEY_MEM = "pw_cloud_v6_memory";

  let catalogMeta = null;
  let voiceManifest = null;
  let visemeCache = new Map(); // charId -> Promise<Sprite>
  let baseImgCache = new Map(); // url -> Promise<HTMLImageElement>

  let cloudAudioCtx = null;
  let activeAudioSource = null;
  let activeAnalyser = null;
  let activeFreqData = null;
  let activeTimeData = null;
  let isSpeakingNow = false;

  // 相対パス解決（GitHub Pages の /patchwork-companion/ 等のサブディレクトリでも100%動作保証）
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
      const raw = localStorage.getItem(STORAGE_KEY_MEM) || localStorage.getItem("pw_cloud_v5_memory");
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
    return { catalogMeta, voiceManifest };
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
    // 待機動画と発話キャンバスの切り替えによる首のカクつき・顔ズレを100%防ぐため、
    // 常に統合 3D ヴィセームキャンバスで待機まばたき〜発話リップシンクを連続描画する
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

  // ===== 本物の Qwen3-TTS 1.7B 肉声バンクから最適な音声MP3と完全一致セリフを選択 =====
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
      fatigue: ["お疲れさま", "頑張った", "ゆっくり休んで", "息抜き"],
      compliment: ["照れ", "ほんとに！？", "ほんまに！？", "嬉しい", "ほんとかよ"],
      positive_news: ["すごいじゃん", "すごいやん", "素敵だね", "嬉しいな", "がんばろう"],
      apology: ["しょうがないなあ", "許してあげる", "許したる", "気にしなくていい", "大丈夫だよ"],
      movie_hobby: ["映画", "聞いてくれるの", "思い浮かんだ", "気になる"],
      pat_head: ["髪くしゃってなる", "甘やかされてる", "撫でて"],
      poke_cheek: ["つつかないで", "びっくりしたじゃん"],
      close_dist: ["顔近いよ", "ドキドキした"],
      gift_cake: ["ショートケーキ", "甘いもの"],
      gift_latte: ["温かいラテ", "一息つきたかった"],
      gift_bear: ["ふわふわですごく可愛い", "ぬいぐるみ"],
      gift_flower: ["お花", "反則だよ"],
      sulk_プリン: ["プリン", "お風呂上がり"],
      question: ["聞いてくれるの", "気になっちゃう", "気になる", "そうだねえ", "そうだなあ"],
      chat: ["そうなんだね", "そうなんやね", "なるほどな", "話聞かせてくれるの", "嬉しいな"],
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

  // ===== 91スタイル全員対応：頭蓋完全固定の本物 Ditto 3D ヴィセームスプライトローダー =====
  function loadCharacterVisemeSprite(charId, portraitUrl) {
    if (!charId) return Promise.resolve(null);
    if (visemeCache.has(charId)) return visemeCache.get(charId);

    const p = (async () => {
      try {
        const res = await origFetch(resolveAssetUrl(`assets/viseme_3d/${charId}.json?v=6`), { cache: "no-cache" });
        if (!res.ok) return null;
        const data = await res.json();
        const frames = data.frames || {};

        async function b64ToBitmap(b64) {
          if (!b64) return null;
          const bin = atob(b64);
          const len = bin.length;
          const u8 = new Uint8Array(len);
          for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
          const blob = new Blob([u8], { type: "image/jpeg" });
          return createImageBitmap(blob);
        }

        const [closedBmp, smallBmp, midBmp, wideBmp, blinkBmp, baseImg] = await Promise.all([
          b64ToBitmap(frames.closed),
          b64ToBitmap(frames.small),
          b64ToBitmap(frames.mid),
          b64ToBitmap(frames.wide),
          b64ToBitmap(frames.blink),
          loadBasePortraitImg(portraitUrl),
        ]);

        return {
          charId,
          frameW: Number(data.frame_w || (baseImg && baseImg.naturalWidth) || 960),
          frameH: Number(data.frame_h || (baseImg && baseImg.naturalHeight) || 1280),
          x: Number(data.x || 0),
          y: Number(data.y || 0),
          w: Number(data.w || 0),
          h: Number(data.h || 0),
          baseImg,
          bitmaps: {
            closed: closedBmp,
            small: smallBmp || closedBmp,
            mid: midBmp || smallBmp || closedBmp,
            wide: wideBmp || midBmp || closedBmp,
            blink: blinkBmp || closedBmp,
          },
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

  // ===== WebAudio 音声再生制御 =====
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
    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.add("hidden");
  }

  async function playRealVoiceWith3DViseme(mp3Url, charObj) {
    stopCloudVoice();
    if (!mp3Url || !charObj) return;

    const cleanMp3Url = resolveAssetUrl(mp3Url);
    const charId = charObj.id || charObj.face_id || "face_f02_mio";

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!cloudAudioCtx && AudioCtx) {
      cloudAudioCtx = new AudioCtx();
    }
    if (cloudAudioCtx && cloudAudioCtx.state === "suspended") {
      await cloudAudioCtx.resume().catch(() => {});
    }

    const [audioRes] = await Promise.all([
      origFetch(cleanMp3Url, { cache: "force-cache" }),
      loadCharacterVisemeSprite(charId, charObj.portrait_url),
    ]);

    if (!audioRes.ok || !cloudAudioCtx) return;
    const arrayBuf = await audioRes.arrayBuffer();
    const audioBuf = await cloudAudioCtx.decodeAudioData(arrayBuf);

    const analyser = cloudAudioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.45;

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
      if (activeAudioSource === srcNode) {
        stopCloudVoice();
      }
    };

    srcNode.start(0);
  }

  // ===== 統合 60fps Head-Locked Ditto 3D レンダリングエンジン =====
  // 待機中（非周期生体まばたき＋呼吸スウェイ）から発話中（音素フォルマント同期3Dリップシンク）まで
  // 単一の #roi-talk-canvas 上で 100% 連続描画し、レイヤー切り替え時の首飛びや顔ズレを物理的にゼロにする
  let unifiedLoopStarted = false;

  function startUnified3DAvatarEngine() {
    if (unifiedLoopStarted) return;
    const roiCanvas = document.getElementById("roi-talk-canvas");
    if (!roiCanvas) return;
    unifiedLoopStarted = true;

    // app.js 側が .active を外しても絶対に消えないよう常時表示スタイルを固定
    roiCanvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:3;opacity:1 !important;display:block !important;will-change:transform;";
    roiCanvas.classList.add("active");

    const roiCtx = roiCanvas.getContext("2d", { alpha: false });

    let drawnBaseCharId = "";
    let smoothMouth = 0.0;
    let nextBlinkStart = performance.now() + 1400 + Math.random() * 1800;
    let blinkStart = 0;
    const BLINK_DURATION = 165; // 閉じ70ms + 開き95ms

    const tick = async (now) => {
      requestAnimationFrame(tick);

      const mem = loadCloudMemory();
      const charObj = getActiveCharObj(mem);
      if (!charObj || !roiCtx) return;

      const sprite = await loadCharacterVisemeSprite(charObj.id, charObj.portrait_url);
      if (!sprite || !sprite.baseImg) return;

      // 1. キャラクター切替時またはサイズ変更時にベース高精細ポートレートを全面描画
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

      // 2. 音声解析による口開き量 (smoothMouth: 0.0 〜 1.0) の算出
      let targetMouth = 0.0;
      if (isSpeakingNow && activeAnalyser && activeFreqData && activeTimeData) {
        activeAnalyser.getByteFrequencyData(activeFreqData);
        activeAnalyser.getByteTimeDomainData(activeTimeData);

        // 時間領域のRMS振幅（子音の区切りでしっかり口が閉じるようにする）
        let sumSq = 0;
        for (let i = 0; i < activeTimeData.length; i++) {
          const v = (activeTimeData[i] - 128) / 128.0;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / activeTimeData.length);

        // 母音フォルマント帯域（約200Hz〜2600Hz）のエネルギー
        let fSum = 0;
        const binStart = 2;
        const binEnd = Math.min(32, activeFreqData.length);
        for (let i = binStart; i < binEnd; i++) {
          fSum += activeFreqData[i];
        }
        const fAvg = fSum / Math.max(1, binEnd - binStart);

        if (rms > 0.012 && fAvg > 16) {
          const rmsNorm = Math.min(1.0, (rms - 0.012) / 0.14);
          const fNorm = Math.min(1.0, (fAvg - 16) / 88);
          targetMouth = Math.max(0.0, Math.min(1.0, rmsNorm * 0.55 + fNorm * 0.45));
        }
      }

      // 開くときは素早く、閉じるときも音節ごとに自然に締まるダンピング
      smoothMouth =
        targetMouth > smoothMouth
          ? smoothMouth * 0.35 + targetMouth * 0.65
          : smoothMouth * 0.58 + targetMouth * 0.42;
      if (smoothMouth < 0.025) smoothMouth = 0.0;

      // 3. 非周期の生体まばたきカーブ算出 (blinkAlpha: 0.0 〜 1.0)
      let blinkAlpha = 0.0;
      if (now >= nextBlinkStart && blinkStart === 0) {
        blinkStart = now;
      }
      if (blinkStart > 0) {
        const elapsed = now - blinkStart;
        if (elapsed < BLINK_DURATION) {
          // 閉じるときは速く(70ms)、開くときは少しゆっくり(95ms)
          if (elapsed < 70) {
            blinkAlpha = Math.sin((elapsed / 70) * (Math.PI / 2));
          } else {
            blinkAlpha = Math.cos(((elapsed - 70) / 95) * (Math.PI / 2));
          }
          blinkAlpha = Math.max(0.0, Math.min(1.0, blinkAlpha));
        } else {
          blinkStart = 0;
          // 24%の確率で自然なダブルブリンク
          nextBlinkStart = now + (Math.random() < 0.24 ? 140 : 2000 + Math.random() * 2800);
        }
      }

      // 4. Head-Locked 3D キーフレームの描画（頭・目・輪郭は 0.000px 完全一致！）
      const { x, y, w, h, bitmaps } = sprite;
      if (w > 0 && h > 0 && bitmaps.closed) {
        // まず基準の closed を不透明で描画
        roiCtx.globalAlpha = 1.0;
        roiCtx.drawImage(bitmaps.closed, x, y, w, h);

        // 発話中で口が開いている場合：段階キーフレーム (small / mid / wide) を連続補間描画
        if (smoothMouth > 0.025) {
          let lowerBmp = bitmaps.closed;
          let upperBmp = bitmaps.small;
          let blend = 0.0;

          if (smoothMouth < 0.34) {
            lowerBmp = bitmaps.closed;
            upperBmp = bitmaps.small;
            blend = smoothMouth / 0.34;
          } else if (smoothMouth < 0.68) {
            lowerBmp = bitmaps.small;
            upperBmp = bitmaps.mid;
            blend = (smoothMouth - 0.34) / 0.34;
          } else {
            lowerBmp = bitmaps.mid;
            upperBmp = bitmaps.wide;
            blend = Math.min(1.0, (smoothMouth - 0.68) / 0.32);
          }

          if (lowerBmp && lowerBmp !== bitmaps.closed) {
            roiCtx.globalAlpha = 1.0;
            roiCtx.drawImage(lowerBmp, x, y, w, h);
          }
          if (upperBmp && blend > 0.01) {
            roiCtx.globalAlpha = blend;
            roiCtx.drawImage(upperBmp, x, y, w, h);
          }
        }

        // まばたき中かつ大きく口を開けていない時は blink キーフレームを目元領域（上部58%）に合成
        // （口が大きく開いている最中でも目元だけ自然にまばたきできるよう上部クリップ合成！）
        if (blinkAlpha > 0.02 && bitmaps.blink) {
          const eyeClipH = Math.round(h * 0.56);
          roiCtx.save();
          roiCtx.beginPath();
          roiCtx.rect(x, y, w, eyeClipH);
          roiCtx.clip();
          roiCtx.globalAlpha = blinkAlpha;
          roiCtx.drawImage(bitmaps.blink, x, y, w, h);
          roiCtx.restore();
        }
        roiCtx.globalAlpha = 1.0;
      }

      // 5. 生身の人間らしい微細な生体呼吸＆発話リズムうなずき（画像の歪みゼロ）
      const tSec = now * 0.001;
      const breathY = Math.sin(tSec * 1.65) * 1.4;
      const swayX = Math.sin(tSec * 0.85 + 0.7) * 1.1;
      const swayRot = Math.sin(tSec * 0.92) * 0.18 + (smoothMouth > 0.15 ? Math.sin(tSec * 5.2) * 0.16 : 0.0);
      const scale = 1.004 + Math.sin(tSec * 1.65) * 0.0018;
      roiCanvas.style.transform = `translate3d(${swayX.toFixed(2)}px, ${breathY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${swayRot.toFixed(3)}deg)`;
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

  // ===== fetch インターセプタ（PCサーバー不要で全APIを0.05秒処理＋本物のQwen3-TTS肉声＆3Dヴィセーム再生） =====
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

    // 1. /api/companion/state
    if (rawUrl.endsWith("/api/companion/state")) {
      const entry = selectRealVoiceEntry(mem.active_voice_id, "", "greeting_home");
      const spoken = entry ? entry.text : "あっ、おかえり！今日も一日お疲れさま。ねえ、こっち座ってゆっくり話そ？";
      return makeJsonResponse(buildCloudStatePayload(mem, spoken, "帰ってきてくれて嬉しいな。今日もいっぱい話そうね。", "happy"));
    }

    // 2. /api/companion/characters & /api/companion/faces
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

    // 3. /api/companion/voices
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

    // 4. /api/companion/init_stream（入室挨拶）
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
          if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
        }
      );
    }

    // 5. /api/companion/talk_stream（選択肢＆自由会話＆音声入力）
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
          if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
        }
      );
    }

    // 6. /api/companion/characters/select & /api/companion/profile/customize_stream
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
            if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
          }
        );
      }
      setTimeout(() => {
        if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
      }, 20);
      return makeJsonResponse(st);
    }

    // 7. /api/companion/action_stream & /api/companion/action
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
            if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
          }
        );
      }
      setTimeout(() => {
        if (entry && entry.mp3_url) playRealVoiceWith3DViseme(entry.mp3_url, activeChar);
      }, 20);
      return makeJsonResponse(st);
    }

    // 8. /api/companion/wardrobe/topup
    if (rawUrl.includes("/api/companion/wardrobe/topup")) {
      mem.coins = (mem.coins || 1200) + 1000;
      saveCloudMemory(mem);
      return makeJsonResponse({ coins: mem.coins, message: "無料ボーナス +1,000💎 を補充しました！" });
    }

    return makeJsonResponse(buildCloudStatePayload(mem, "うんうん、なんでも話してね！", "", "happy"));
  };

  // ===== 🧪 友人シェア＆感想フィードバックモーダル UI =====
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
    startUnified3DAvatarEngine();
  });
  if (document.readyState !== "loading") {
    injectShareAndFeedbackButton();
    startUnified3DAvatarEngine();
  }
})();
