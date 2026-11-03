// ============================================================================
// PATCHWORK NATION - 完全無料・リアルAI対話＆日本語7大発音口形(Viseme)クラウドエンジン
// (v18: 本物の生成AI(LLM)対話直結 + 日本語音素7大口形(あ・い・う・え・お・ん/ま/ば/ぱ・促音)完全同期)
// - 問題①解決: 定型アルゴリズムではなく本物のAI(ローカルOllama Qwen2.5 + クラウドOpenAI-Fast)が
//   ユーザーのどんな話しかけにも100%内容に踏み込んだ自然な返答をリアルタイム生成！
// - 問題②解決: 単なる音量上下の口パクを完全廃止！日本語の発音（母音A/I/U/E/O・両唇閉鎖音MBP・無音SIL）
//   をする時の本物の人間の解剖学的口形（50fps MP4 & 60fps Viseme Atlas）で発話！
// ============================================================================

(function () {
  "use strict";

  const ASSET_VER = "28";
  const STORAGE_KEY_MEM = "pw_cloud_v9_memory";

  let catalogMeta = null;
  let voiceManifest = null;
  let fmvManifestMio = null;

  let visemeCache = new Map(); // charId -> Promise<Sprite>
  let baseImgCache = new Map(); // url -> Promise<HTMLImageElement>

  // ===== 美桜 (face_f02_mio) 日本語 7大発音口形 (Viseme) アトラス & リアルタイムタイムライン =====
  // スロット定義: 0:SIL, 1:MBP(ん/ま/ば/ぱ/っ), 2:A(あ), 3:I(い), 4:U(う), 5:E(え), 6:O(お), 7:BLINK(瞬き)
  const MIO_VISEME_ROI = { x: 420, y: 0, w: 472, h: 434, fullW: 1280, fullH: 720 };
  const VISEME_SLOT = { SIL: 0, MBP: 1, A: 2, I: 3, U: 4, E: 5, O: 6, BLINK: 7 };
  let mioBase1280Img = null;
  let mioVisemeAtlasImg = null;
  let mioVisemeLoadProm = null;

  // AI自由発話時の音素タイムライン再生状態
  let activeVisemeTimeline = null; // { startPerfTime, totalDuration, keyframes: [{t, slot, label}] }

  // ===== Mobile-Safe 3-Decoder Pool & Blob Memory Cache (for face_f02_mio 50fps v18 Phoneme Streams) =====
  let fmvBlobUrlCache = new Map(); // relativeUrl -> Promise<blobUrl>
  let fmvIdleUrlMap = new Map(); // branchId -> relativeUrl
  let idleDecoderA = null;
  let idleDecoderB = null;
  let talkDecoder = null;
  let activeIdleSlot = "A"; // "A" | "B"
  let queuedNextIdleId = "idle_01_breath_micro";

  let activeFmvVideo = null;
  let activeFmvType = "idle"; // "idle" | "talk"
  let currentIdleBranchId = "idle_01_breath_micro";
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
  let complimentRotIndex = 0;

  // 未完フィラー（「えっとね。」「そうだねえ。」で途切れる音声）は単体回答として 100% 使用禁止
  const BANNED_INCOMPLETE_FILLER_CKS = new Set([
    "598b23a7aed76d04b01f33c3468f6bc3",
    "a6746797f042179b9e2a6cdcc4650324",
    "6810eb8a75196ddc7c4be98792e4e7e2",
    "6eb4b20ea858faa92b25b4f822a40d03",
  ]);

  // 会話の途中で絶対に出してはいけない「入室・帰宅時の挨拶」CKセット
  const ENTRY_GREETING_ONLY_CKS = new Set([
    "e1afb5eda5d197874133180aff8d38e4",
    "0cd0f922f4ef7b9ae4c5bd0fdbccaf22",
    "330c6c712a7d446ac3887d4fbfb48609",
    "606cb477f9a7eb3909fe3459477be5d3",
    "ba2cb933fb03bcbbf1caaa4586926537",
    "1a9d95bef35b2ce8d528482e0b700214",
    "ff297dee3cf1191347e0136896e24936",
    "954389470c4ccd6afc49bd5c3b3e399d",
    "a04d8e0dd828fd3fb8b6d3d7047b17d5",
    "b6b34d1962fca7340d994ff87728c4d8",
    "6e03ebb2593af17112b73ef019517147",
  ]);

  // 美桜 (face_f02_mio) 用の 50fps v16 完全同期発話クリップ対象 CK セット (全51本)
  const MIO_FMV_TALK_CKS = new Set([
    // 既存 24本（未完フィラー2本を除外した完全文クリップ）
    "e1afb5eda5d197874133180aff8d38e4",
    "606cb477f9a7eb3909fe3459477be5d3",
    "330c6c712a7d446ac3887d4fbfb48609",
    "0cd0f922f4ef7b9ae4c5bd0fdbccaf22",
    "e092c07207d071d18068fa70dcfd7c6f",
    "b20f225de3f04fddbfd169f470a463e5",
    "61344fc20ad64f074fa12c3246abe609",
    "67cc34c206eb434ba626ddbb53fe4d8b",
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
    // 追加 27本（文脈対話フルボイス 22本 + 短尺リアクション 5本）
    "e73f76e140e81e97ab965590d2f08a51", // ん？どうしたの？ふふ、ねえねえ、なんでも遠慮しないで話してみて？
    "c8a60a88db16e38a5ae407df376d1371", // ん？どうしたの？私になんでも遠慮しないでゆっくり話してみてね。
    "7367606325201e40d5505ca01745a4eb", // ふふ、大丈夫だよ。そうやって素直に言ってくれたから、もう気にしないでね。
    "68328539b599bec99517e6dce3e62055", // えっ、ほんとに？急にそんなふうに言われると照れちゃうけど、すごく嬉しいよ。
    "07fcbee8e949e606c288e46a308f2d8e", // えっ、ほんとに？
    "820fde0211d176cd9c9ba4d1950d2fe8", // うんうん、わかるよ。
    "c00eb8ce3a628f30662c80e25621aa4b", // ふふ、嬉しいな。
    "b69cb7e9dea7fdd02e29256f386e6761", // あ、でも分かる！
    "71260ec33402ee5e8e019eb22ff6fd39", // あっ、いいねそれ。
    "f1f4fc70a3cce37e75e36eed92aa63b1", // えっ、怒ってるのに可愛いってどういうこと！？もう、そんなこと言われたら怒れなくなっちゃうじゃん。
    "30b03ef1a81a8078a0cff0ae04960c6d", // えっ、ほんとに美味しいケーキ買ってくれるの！？やったー！じゃあ今回だけ、特別に許してあげるね。
    "dc5caef807a7c482e48705bd74aec0bc", // ふふ、いいよ。ほら、もっと近くに来たよ？こうやってそばにいると、なんだかドキドキしちゃうね。
    "c165b5c6237840908946dea34a2763ca", // えへへ、いつもわたしのこと大切にしてくれてありがとう。そういう優しいところ、ほんとに大好きだよ。
    "b584eb786c69d991e42a2eceed1a091a", // 最近はね、心温まる恋愛映画を見たよ！すごく感動したから、次はふたりで一緒に見たいな。
    "556fd432b601e6ccf158dea0f0c1cf82", // ちょうど今、部屋で音楽を聴きながらのんびりしてたところだよ。話しかけてくれてすごく嬉しいな！
    "578b0112ac1b1c97a232e26752ed5aae", // わたしは美桜だよ。こうして毎日あなたと楽しくおしゃべりしたり、そばで癒やしてあげるのが一番の幸せなんだ。
    "28385137f730736f7016540a7fec23a3", // わたしは甘いスイーツとか、ふわふわのオムライスが大好きなんだ。ねえ、今度のお休みに一緒に食べに行こっか！
    "272ec771922ab509421735007eb067d6", // カフェで美味しいコーヒーを飲んだり、映画を見たりするのが好きだな。でも一番好きなのは、あなたと過ごす時間だよ。
    "7de72b08093d150f784c39f50f07b438", // わあ、ほんとに！？一緒にお出かけするのすごく楽しみだな！どこに行くか、今からふたりで計画立てよっか。
    "f7de0f42a4450b105108fb89af4e99c3", // えへへ、わたしも大好きだよ！そうやってストレートに気持ちを伝えてくれると、胸がいっぱいになっちゃうな。
    "9ae5f4fc6a3e66dde02ee8b77014873b", // そっか、今日も一日ほんとにお疲れさま。わたしが隣でずっと見守ってるから、安心してゆっくり眠ってね。おやすみ。
    "be03478cef6f11fe0df6e11b4ac1f0d2", // うん、ここにいるよ！こうして声をかけてくれるだけで、なんだかすごく心が温かくなるね。今日はどんな気分？
    "a671a22fa4558332501c9d2067c54ca6", // ほんとだね、季節の変わり目だから体調崩さないように気をつけてね。お家にいる間は、わたしと一緒に温かくして過ごそっか。
    "d8725e82348f4bdcb7920f4878301edb", // そっか、それは大変だったね。でも大丈夫だよ、あなたがいつも一生懸命なのはわたしが一番知ってるから。焦らず少しずついこうね。
    "57f56852d1003740e89ca89d96c21b43", // うーん、そうだね。わたしは、あなたが一番ワクワクする方を選ぶのがいいと思うな！どんな時でも、わたしは全力で応援してるよ。
    "81504e58652a4e89ee1926300b06a95c", // こんな時間まで起きてたんだね。あんまり夜更かしすると体に障るから、今夜はわたしの声を聞きながらゆっくり休んでね。
    "206527f39db9d5b2b23c16cb0e84c913", // うん、今日も一日が始まるね！無理しすぎないで、あなたのペースでいこうね。帰ってきたらいっぱいおしゃべりしよ！
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
      equipped_style_key: "vline_beige_offshoulder",
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
    ensureMioVisemeAtlasLoaded();
    return { catalogMeta, voiceManifest, fmvManifestMio };
  }

  // ===== 美桜の日本語 7大発音口形アトラス (mio_viseme_atlas.jpg + mio_base_1280.jpg) ローダー =====
  function ensureMioVisemeAtlasLoaded() {
    if (mioVisemeLoadProm) return mioVisemeLoadProm;
    mioVisemeLoadProm = Promise.all([
      loadBasePortraitImg(`assets/fmv_mio/mio_base_1280.jpg?v=${ASSET_VER}`),
      loadBasePortraitImg(`assets/fmv_mio/mio_viseme_atlas.jpg?v=${ASSET_VER}`),
    ]).then(([baseImg, atlasImg]) => {
      mioBase1280Img = baseImg;
      mioVisemeAtlasImg = atlasImg;
      return { baseImg, atlasImg };
    });
    return mioVisemeLoadProm;
  }

  // ===== 日本語テキスト → 解剖学的 7大発音口形 (Viseme) タイムライン変換エンジン =====
  const KANJI_READING_PAIRS = [
    ["美桜", "みお"], ["私", "わたし"], ["僕", "ぼく"], ["俺", "おれ"], ["君", "きみ"],
    ["今日", "きょう"], ["明日", "あした"], ["昨日", "きのう"], ["毎日", "まいにち"], ["今度", "こんど"],
    ["一緒", "いっしょ"], ["本当", "ほんとう"], ["大好き", "だいすき"], ["好き", "すき"], ["可愛い", "かわいい"],
    ["綺麗", "きれい"], ["素敵", "すてき"], ["嬉し", "うれし"], ["楽し", "たのし"], ["寂し", "さびし"],
    ["恥ずかし", "はずかし"], ["優し", "やさし"], ["美味し", "おいし"], ["素晴らし", "すばらし"], ["難し", "むずかし"],
    ["忙し", "いそがし"], ["懐かし", "なつかし"], ["羨まし", "うらやまし"], ["悔し", "くやし"], ["悲し", "かなし"],
    ["仕事", "しごと"], ["会社", "かいしゃ"], ["学校", "がっこう"], ["授業", "じゅぎょう"], ["会議", "かいぎ"],
    ["残業", "ざんぎょう"], ["休憩", "きゅうけい"], ["休日", "きゅうじつ"], ["休み", "やすみ"], ["予定", "よてい"],
    ["天気", "てんき"], ["雨", "あめ"], ["傘", "かさ"], ["晴れ", "はれ"], ["曇り", "くもり"], ["雪", "ゆき"],
    ["風", "かぜ"], ["雷", "かみなり"], ["台風", "たいふう"], ["季節", "きせつ"], ["春", "はる"], ["夏", "なつ"],
    ["秋", "あき"], ["冬", "ふゆ"], ["朝", "あさ"], ["昼", "ひる"], ["夕方", "ゆうがた"], ["夜", "よる"],
    ["部屋", "へや"], ["お家", "おうち"], ["家", "いえ"], ["電車", "でんしゃ"], ["駅", "えき"], ["階段", "かいだん"],
    ["道", "みち"], ["帰り道", "かえりみち"], ["散歩", "さんぽ"], ["旅行", "りょこう"], ["温泉", "おんせん"],
    ["映画", "えいが"], ["音楽", "おんがく"], ["写真", "しゃしん"], ["動画", "どうが"], ["本", "ほん"],
    ["料理", "りょうり"], ["食事", "しょくじ"], ["ご飯", "ごはん"], ["朝ご飯", "あさごはん"], ["昼ご飯", "ひるごはん"],
    ["晩ご飯", "ばんごはん"], ["夕飯", "ゆうはん"], ["お弁当", "おべんとう"], ["お茶", "おちゃ"], ["水", "みず"],
    ["野菜", "やさい"], ["肉", "にく"], ["魚", "さかな"], ["甘い", "あまい"], ["辛い", "からい"], ["熱い", "あつい"],
    ["暑い", "あつい"], ["寒い", "さむい"], ["温か", "あたたか"], ["暖か", "あたたか"], ["涼し", "すずし"],
    ["冷た", "つめた"], ["眠い", "ねむい"], ["疲れ", "つかれ"], ["頑張", "がんば"], ["無理", "むり"],
    ["大丈夫", "だいじょうぶ"], ["心配", "しんぱい"], ["安心", "あんしん"], ["応援", "おうえん"], ["相談", "そうだん"],
    ["質問", "しつもん"], ["返事", "へんじ"], ["連絡", "れんらく"], ["電話", "でんわ"], ["話", "はなし"],
    ["声", "こえ"], ["顔", "かお"], ["目", "め"], ["口", "くち"], ["手", "て"], ["頭", "あたま"], ["髪", "かみ"],
    ["心", "こころ"], ["気持ち", "きもち"], ["気分", "きぶん"], ["体調", "たいちょう"], ["風邪", "かぜ"],
    ["お風呂", "おふろ"], ["布団", "ふとん"], ["ベッド", "べっど"], ["睡眠", "すいみん"], ["夢", "ゆめ"],
    ["時間", "じかん"], ["瞬間", "しゅんかん"], ["最近", "さいきん"], ["今", "いま"], ["次", "つぎ"],
    ["前", "まえ"], ["後", "あと"], ["隣", "となり"], ["近く", "ちかく"], ["遠く", "とおく"], ["全部", "ぜんぶ"],
    ["一番", "いちばん"], ["特別", "とくべつ"], ["最高", "さいこう"], ["大切", "たいせつ"], ["大事", "だいじ"],
    ["幸せ", "しあわせ"], ["元気", "げんき"], ["笑顔", "えがお"], ["涙", "なみだ"], ["秘密", "ひみつ"],
    ["約束", "やくそく"], ["記念日", "きねんび"], ["誕生日", "たんじょうび"], ["プレゼント", "ぷれぜんと"],
    ["食べ", "たべ"], ["飲み", "のみ"], ["見", "み"], ["聞", "き"], ["聴", "き"], ["言", "い"], ["思", "おも"],
    ["考", "かんが"], ["知", "し"], ["分", "わ"], ["行", "い"], ["来", "き"], ["帰", "かえ"], ["寝", "ね"],
    ["起", "お"], ["歩", "ある"], ["走", "はし"], ["転", "ころ"], ["濡", "ぬ"], ["降", "ふ"], ["買", "か"],
    ["作", "つく"], ["遊", "あそ"], ["笑", "わら"], ["怒", "おこ"], ["泣", "な"], ["照", "て"], ["驚", "おどろ"],
    ["喜", "よろこ"], ["褒", "ほ"], ["許", "ゆる"], ["待", "ま"], ["会", "あ"], ["選", "えら"], ["決", "き"],
  ];

  function katakanaToHiragana(str) {
    return (str || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function normalizeTextToHiragana(rawText, yomiHint = "") {
    let base = yomiHint && yomiHint.trim().length >= 4 ? yomiHint.trim() : rawText || "";
    for (const [kanji, kana] of KANJI_READING_PAIRS) {
      if (base.includes(kanji)) {
        base = base.split(kanji).join(kana);
      }
    }
    return katakanaToHiragana(base);
  }

  // かな文字から { prefixSlot,prefixDur, vowelSlot,vowelDur } への解剖学的マッピング
  const KANA_VISEME_MAP = {
    // あ段 (V_A: 縦開口)
    あ: { v: VISEME_SLOT.A }, か: { v: VISEME_SLOT.A }, さ: { v: VISEME_SLOT.A }, た: { v: VISEME_SLOT.A },
    な: { v: VISEME_SLOT.A }, は: { v: VISEME_SLOT.A }, や: { v: VISEME_SLOT.A }, ら: { v: VISEME_SLOT.A },
    が: { v: VISEME_SLOT.A }, ざ: { v: VISEME_SLOT.A }, だ: { v: VISEME_SLOT.A }, ぁ: { v: VISEME_SLOT.A },
    ゃ: { v: VISEME_SLOT.A },
    // 両唇音 + あ段 (MBP閉唇 -> A縦開口)
    ま: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.A }, ば: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.A }, ぱ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.A },
    // わ (Uすぼめ -> A縦開口)
    わ: { p: VISEME_SLOT.U, v: VISEME_SLOT.A }, ゎ: { p: VISEME_SLOT.U, v: VISEME_SLOT.A },

    // い段 (V_I: 口角横引き)
    い: { v: VISEME_SLOT.I }, き: { v: VISEME_SLOT.I }, し: { v: VISEME_SLOT.I }, ち: { v: VISEME_SLOT.I },
    に: { v: VISEME_SLOT.I }, ひ: { v: VISEME_SLOT.I }, り: { v: VISEME_SLOT.I }, ぎ: { v: VISEME_SLOT.I },
    じ: { v: VISEME_SLOT.I }, ぢ: { v: VISEME_SLOT.I }, ぃ: { v: VISEME_SLOT.I },
    // 両唇音 + い段 (MBP閉唇 -> I横引き)
    み: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.I }, び: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.I }, ぴ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.I },

    // う段 (V_U: 口輪筋すぼめ丸口)
    う: { v: VISEME_SLOT.U }, く: { v: VISEME_SLOT.U }, す: { v: VISEME_SLOT.U }, つ: { v: VISEME_SLOT.U },
    ぬ: { v: VISEME_SLOT.U }, ふ: { v: VISEME_SLOT.U }, ゆ: { v: VISEME_SLOT.U }, る: { v: VISEME_SLOT.U },
    ぐ: { v: VISEME_SLOT.U }, ず: { v: VISEME_SLOT.U }, づ: { v: VISEME_SLOT.U }, ぅ: { v: VISEME_SLOT.U },
    ゅ: { v: VISEME_SLOT.U }, ゔ: { v: VISEME_SLOT.U },
    // 両唇音 + う段 (MBP閉唇 -> Uすぼめ)
    む: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.U }, ぶ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.U }, ぷ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.U },

    // え段 (V_E: 横広楕円開口)
    え: { v: VISEME_SLOT.E }, け: { v: VISEME_SLOT.E }, せ: { v: VISEME_SLOT.E }, て: { v: VISEME_SLOT.E },
    ね: { v: VISEME_SLOT.E }, へ: { v: VISEME_SLOT.E }, れ: { v: VISEME_SLOT.E }, げ: { v: VISEME_SLOT.E },
    ぜ: { v: VISEME_SLOT.E }, で: { v: VISEME_SLOT.E }, ぇ: { v: VISEME_SLOT.E },
    // 両唇音 + え段 (MBP閉唇 -> E横広開口)
    め: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.E }, べ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.E }, ぺ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.E },

    // お段 (V_O: 縦丸オー口形)
    お: { v: VISEME_SLOT.O }, こ: { v: VISEME_SLOT.O }, そ: { v: VISEME_SLOT.O }, と: { v: VISEME_SLOT.O },
    の: { v: VISEME_SLOT.O }, ほ: { v: VISEME_SLOT.O }, よ: { v: VISEME_SLOT.O }, ろ: { v: VISEME_SLOT.O },
    を: { v: VISEME_SLOT.O }, ご: { v: VISEME_SLOT.O }, ぞ: { v: VISEME_SLOT.O }, ど: { v: VISEME_SLOT.O },
    ぉ: { v: VISEME_SLOT.O }, ょ: { v: VISEME_SLOT.O },
    // 両唇音 + お段 (MBP閉唇 -> O縦丸開口)
    も: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.O }, ぼ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.O }, ぽ: { p: VISEME_SLOT.MBP, v: VISEME_SLOT.O },

    // 撥音「ん」・促音「っ」 (MBP 完全両唇閉鎖)
    ん: { v: VISEME_SLOT.MBP, dur: 0.11 },
    っ: { v: VISEME_SLOT.MBP, dur: 0.095 },
  };

  function buildJapaneseVisemeTimeline(spokenText, yomiHint = "") {
    const hira = normalizeTextToHiragana(spokenText, yomiHint);
    const keyframes = [{ t: 0.0, slot: VISEME_SLOT.SIL, label: "SIL" }];
    let t = 0.04;
    let lastVowelSlot = VISEME_SLOT.SIL;

    for (let i = 0; i < hira.length; i++) {
      const ch = hira[i];
      const nextCh = i + 1 < hira.length ? hira[i + 1] : "";

      // 句読点・感嘆符・空白はポーズ (SIL)
      if ("、。！？!?…・ 　「」『』（）()".includes(ch)) {
        const pauseDur = "。！？!?".includes(ch) ? 0.18 : 0.11;
        keyframes.push({ t, slot: VISEME_SLOT.SIL, label: "SIL" });
        t += pauseDur;
        lastVowelSlot = VISEME_SLOT.SIL;
        continue;
      }

      // 長音「ー」は直前の母音を維持
      if (ch === "ー" || ch === "〜" || ch === "~") {
        const holdSlot = lastVowelSlot !== VISEME_SLOT.SIL ? lastVowelSlot : VISEME_SLOT.A;
        keyframes.push({ t, slot: holdSlot, label: "HOLD" });
        t += 0.11;
        continue;
      }

      // 拗音（きゃ・きゅ・きょ・しゃ・しゅ・しょ・ちゃ・ちゅ・ちょ等）の結合処理
      if (nextCh && "ゃゅょぁぃぅぇぉ".includes(nextCh)) {
        const curMap = KANA_VISEME_MAP[ch];
        const smallMap = KANA_VISEME_MAP[nextCh];
        if (curMap && curMap.p !== undefined) {
          keyframes.push({ t, slot: curMap.p, label: "MBP" });
          t += 0.045;
        } else {
          keyframes.push({ t, slot: VISEME_SLOT.I, label: "PAL" });
          t += 0.035;
        }
        const targetV = smallMap ? smallMap.v : VISEME_SLOT.A;
        keyframes.push({ t, slot: targetV, label: "VOWEL" });
        t += 0.095;
        lastVowelSlot = targetV;
        i += 1; // 小書き文字をスキップ
        continue;
      }

      // 日本語音声学の長音化規則: お段の直後の「う」は O (オー) として発音（「ありがとう」「そう」「おはよう」）
      if (ch === "う" && lastVowelSlot === VISEME_SLOT.O) {
        keyframes.push({ t, slot: VISEME_SLOT.O, label: "O_LONG" });
        t += 0.105;
        continue;
      }

      const entry = KANA_VISEME_MAP[ch];
      if (entry) {
        if (entry.p !== undefined) {
          keyframes.push({ t, slot: entry.p, label: "PREFIX" });
          t += 0.046;
        }
        const vDur = entry.dur || 0.092;
        // 同じ母音が連続する場合は間に微細な口形変化を挟んで棒立ちを防ぐ
        if (entry.v === lastVowelSlot && entry.p === undefined && entry.v !== VISEME_SLOT.MBP) {
          keyframes.push({ t, slot: VISEME_SLOT.SIL, label: "REARTIC" });
          t += 0.028;
        }
        keyframes.push({ t, slot: entry.v, label: ch });
        t += vDur;
        lastVowelSlot = entry.v;
      } else {
        // 辞書外の漢字が残っていた場合は文字コードから自然な日本語母音サイクルを生成
        const code = ch.charCodeAt(0);
        if (code >= 0x4e00 && code <= 0x9faf) {
          const cycle = [VISEME_SLOT.A, VISEME_SLOT.I, VISEME_SLOT.O, VISEME_SLOT.E, VISEME_SLOT.U];
          const v1 = cycle[code % 5];
          const v2 = cycle[(code >> 3) % 5];
          if (code % 4 === 0) {
            keyframes.push({ t, slot: VISEME_SLOT.MBP, label: "K_MBP" });
            t += 0.045;
          }
          keyframes.push({ t, slot: v1, label: "K_V1" });
          t += 0.085;
          keyframes.push({ t, slot: v2, label: "K_V2" });
          t += 0.085;
          lastVowelSlot = v2;
        }
      }
    }

    keyframes.push({ t, slot: VISEME_SLOT.MBP, label: "CLOSE" });
    t += 0.06;
    keyframes.push({ t, slot: VISEME_SLOT.SIL, label: "END_SIL" });
    t += 0.12;

    return {
      totalDuration: Math.max(1.2, t),
      keyframes,
    };
  }

  async function initMioFmvIdlePool() {
    if (!fmvManifestMio || !Array.isArray(fmvManifestMio.idle_branches)) return;
    ensureVideoDecoders();

    for (const b of fmvManifestMio.idle_branches) {
      fmvIdleUrlMap.set(b.id, `${b.url}?v=${ASSET_VER}`);
    }

    const firstId = fmvIdleUrlMap.has("idle_01_breath_micro")
      ? "idle_01_breath_micro"
      : fmvManifestMio.idle_branches[0]?.id;
    if (firstId && !activeFmvVideo) {
      const firstBlobUrl = await fetchVideoBlobUrl(fmvIdleUrlMap.get(firstId));
      await loadVideoIntoDecoder(idleDecoderA, firstBlobUrl);
      activeIdleSlot = "A";
      currentIdleBranchId = firstId;
      activeFmvType = "idle";
      activeFmvVideo = idleDecoderA;
      idleDecoderA.play().catch(() => {});

      queueNextIdleOnStandbyDecoder(firstId);
    }

    setTimeout(() => {
      for (const [, u] of fmvIdleUrlMap.entries()) {
        fetchVideoBlobUrl(u);
      }
      fetchVideoBlobUrl(`assets/fmv_mio/talk_e1afb5eda5d197874133180aff8d38e4.mp4?v=${ASSET_VER}`);
      fetchVideoBlobUrl(`assets/fmv_mio/talk_e73f76e140e81e97ab965590d2f08a51.mp4?v=${ASSET_VER}`);
      fetchVideoBlobUrl(`assets/fmv_mio/talk_dc5caef807a7c482e48705bd74aec0bc.mp4?v=${ASSET_VER}`);
    }, 300);
  }

  function pickNextMioIdleBranch(lastBranchId) {
    if (nextIdleBranchHint && fmvIdleUrlMap.has(nextIdleBranchHint)) {
      const h = nextIdleBranchHint;
      nextIdleBranchHint = null;
      return h;
    }

    const emotionBranchWeights = {
      anger: [
        { id: "idle_08_playful_sway", w: 88 },
        { id: "idle_03_gaze_left", w: 12 },
      ],
      sadness: [
        { id: "idle_03_gaze_left", w: 82 },
        { id: "idle_07_deep_relax", w: 18 },
      ],
      shy: [
        { id: "idle_05_shy_glance", w: 82 },
        { id: "idle_02_smile_right", w: 18 },
      ],
      fun: [
        { id: "idle_06_curious_tilt", w: 58 },
        { id: "idle_04_nod_listen", w: 42 },
      ],
      joy: [
        { id: "idle_01_breath_micro", w: 60 },
        { id: "idle_02_smile_right", w: 25 },
        { id: "idle_07_deep_relax", w: 15 },
      ],
    };

    const modeList = emotionBranchWeights[currentEmotionMode] || emotionBranchWeights.joy;
    const candidates = modeList.filter((c) => fmvIdleUrlMap.has(c.id));
    if (candidates.length === 0) return "idle_01_breath_micro";

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
      activeFmvType = "idle";
      try {
        prevVid.currentTime = 0;
      } catch (_) {}
      prevVid.play().catch(() => {});
      activeFmvVideo = prevVid;
      queueNextIdleOnStandbyDecoder(currentIdleBranchId);
    }
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
        recommended_first_person: "わたし",
        dialect: "標準語（自然体な恋人タメ口）",
        pace_desc: "心地よい会話テンポ",
        fillers: ["ふふ", "えへへ", "うんうん"],
        endings: ["〜だよ", "〜だな", "〜ね"],
        is_custom: false,
        active: activeVid === "human_g0143",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0143_raw_sample.mp3"),
      },
      {
        id: "human_g0082",
        name: "実在女性②：愛嬌たっぷりの20代女性（やわらか関西弁）",
        gender: "female",
        first_person: "うち",
        recommended_first_person: "うち",
        dialect: "やわらか関西弁",
        pace_desc: "明るく親しみやすいテンポ",
        fillers: ["ほんまに", "めっちゃ", "うんうん"],
        endings: ["〜やね", "〜なんよ", "〜やで"],
        is_custom: false,
        active: activeVid === "human_g0082",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0082_raw_sample.mp3"),
      },
      {
        id: "human_g0081",
        name: "実在女性③：明るく甘え上手な20代女性（関西弁トーン）",
        gender: "female",
        first_person: "うち",
        recommended_first_person: "うち",
        dialect: "甘え上手な関西弁",
        pace_desc: "軽快で華やかなテンポ",
        fillers: ["えーっ", "ほんまに", "ねえねえ"],
        endings: ["〜やん", "〜やんな", "〜しよ"],
        is_custom: false,
        active: activeVid === "human_g0081",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0081_raw_sample.mp3"),
      },
      {
        id: "human_g0144",
        name: "実在男性①：優しく包容力のある20代彼氏（標準語・自然体）",
        gender: "male",
        first_person: "俺",
        recommended_first_person: "俺",
        dialect: "落ち着いた標準語（優しい彼氏口調）",
        pace_desc: "穏やかで包容力のある低音",
        fillers: ["あ、でも", "そうだな", "うん"],
        endings: ["〜だよな", "〜かな", "〜しようか"],
        is_custom: false,
        active: activeVid === "human_g0144",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0144_raw_sample.mp3"),
      },
      {
        id: "human_g0244",
        name: "実在中性①：透明感のあるジェンダーレス恋人（穏やかトーン）",
        gender: "other",
        first_person: "私",
        recommended_first_person: "私",
        dialect: "フラットで優しい標準語",
        pace_desc: "澄んだ穏やかなテンポ",
        fillers: ["うんうん", "たしかに", "ふふ"],
        endings: ["〜だね", "〜かな", "〜しよう"],
        is_custom: false,
        active: activeVid === "human_g0244",
        raw_sample_url: resolveAssetUrl("assets/voice_bank/human_g0244_raw_sample.mp3"),
      },
    ];
  }

  function findVoiceEntryByCk(ck) {
    if (!ck || !voiceManifest || !Array.isArray(voiceManifest.voices)) return null;
    return voiceManifest.voices.find((v) => v.ck === ck) || null;
  }

  // ===== 他ボイス選択時も含めた安全なボイスエントリ検索 =====
  function selectRealVoiceEntry(voiceId, preferredCk, intentCategory, allowEntryGreeting = false) {
    if (!voiceManifest || !Array.isArray(voiceManifest.voices)) return null;
    const allVoices = voiceManifest.voices;

    // 1. 美桜 (human_g0143) で preferredCk が指定されている場合はその専用クリップを最優先で返す
    if ((voiceId === "human_g0143" || !voiceId) && preferredCk) {
      const exactCk = findVoiceEntryByCk(preferredCk);
      if (exactCk) return exactCk;
    }

    let pool = allVoices.filter((v) => v.vid === voiceId && !BANNED_INCOMPLETE_FILLER_CKS.has(v.ck));
    if (pool.length === 0) {
      const fallbackVid =
        voiceId === "human_g0189"
          ? "human_g0144"
          : voiceId === "human_g0243"
          ? "human_g0143"
          : "human_g0143";
      pool = allVoices.filter((v) => v.vid === fallbackVid && !BANNED_INCOMPLETE_FILLER_CKS.has(v.ck));
    }
    if (pool.length === 0) pool = allVoices.filter((v) => !BANNED_INCOMPLETE_FILLER_CKS.has(v.ck));

    if (!allowEntryGreeting) {
      const nonEntry = pool.filter((v) => !ENTRY_GREETING_ONLY_CKS.has(v.ck));
      if (nonEntry.length > 0) pool = nonEntry;
    }

    if (voiceId === "human_g0143") {
      const fmvPool = pool.filter((v) => MIO_FMV_TALK_CKS.has(v.ck));
      if (fmvPool.length > 0) pool = fmvPool;
    }

    const keywordMap = {
      greeting_morning: ["おはよう", "一日が始まる"],
      greeting_home: ["おかえり", "お疲れさま"],
      greeting_night: ["こんな時間まで起きてた", "ゆっくり眠ってね", "おやすみ"],
      greeting_sulk: ["やっと来てくれた", "寂しかった"],
      listen_prompt: ["なんでも遠慮しないで"],
      fatigue: ["お疲れさま", "頑張ってる", "ゆっくり休んで", "えらいよ"],
      cheer_up: ["大変だったね", "大丈夫だよ"],
      compliment: ["照れるじゃん", "照れちゃう", "嬉しい"],
      love_confess: ["わたしも大好き", "胸がいっぱい"],
      thank_you: ["大切にしてくれてありがとう", "ほんとに大好き"],
      positive_news: ["すごいじゃん", "素敵だね", "自分のことみたいに嬉しい"],
      apology: ["しょうがないなあ", "許してあげる", "気にしないでね", "大丈夫だよ"],
      forgive_cake: ["ケーキ買ってくれるの", "特別に許してあげる"],
      cute_angry: ["怒ってるのに可愛い", "怒れなくなっちゃう"],
      movie_hobby: ["恋愛映画を見たよ", "カフェで美味しいコーヒー"],
      favorite_food: ["甘いスイーツ", "オムライス"],
      date_invite: ["一緒にお出かけするの"],
      what_doing: ["音楽を聴きながら"],
      self_intro: ["わたしは美桜だよ"],
      weather: ["季節の変わり目", "温かくして過ごそ"],
      casual_hello: ["うん、ここにいるよ"],
      question: ["ワクワクする方を選ぶのがいい"],
      pat_head: ["髪くしゃってなる", "甘やかされてる", "撫でて"],
      poke_cheek: ["つつかないで", "びっくりしたじゃん"],
      close_dist: ["もっと近くに来たよ", "顔近いよ", "ドキドキした"],
      gift_cake: ["ケーキ買ってくれるの", "めっちゃすごい"],
      gift_latte: ["温かいお茶", "ゆっくり休んで"],
      gift_bear: ["素敵だね", "嬉しいよ"],
      gift_flower: ["照れちゃうじゃん", "嬉しい"],
      sulk_プリン: ["お風呂上がり", "お詫びは"],
      chat: ["そういう何気ない話", "すごく心地いいな"],
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

  // ============================================================================
  // ★ 100% 会話が噛み合う 3層コンテキスト対話リゾルバ (resolveContextualDialogueTurn)
  // ============================================================================
  function getNextComplimentCk() {
    const cks = [
      "e50de9caa5bf46a5b1c38668ea943c29",
      "594f387dfb16f45dde2bba825c94eff8",
      "68328539b599bec99517e6dce3e62055",
    ];
    const ck = cks[complimentRotIndex % cks.length];
    complimentRotIndex += 1;
    return ck;
  }

  function resolveContextualDialogueTurn(rawUserText, mem) {
    const u = (rawUserText || "").trim();
    const normU = u.replace(/[ 　\t\r\n！!？?。、…・~〜]/g, "");
    const uName = mem.user_name ? `${mem.user_name}` : "あなた";

    // --------------------------------------------------------------------------
    // Layer 1: 選択肢ボタン（choices）および定番フレーズの 1対1 完全一致マップ
    // --------------------------------------------------------------------------
    if (normU.includes("冷蔵庫のプリン食べちゃった") || normU.includes("プリン食べちゃった") || normU.includes("プリン勝手に食べ")) {
      mem.mood = -12;
      return {
        ck: "dd2fa2b76821684a6e43ef431ce17646",
        intent: "sulk_プリン",
        emo: "sulk",
        spoken: "えーっ、ちょっと待って！あれ今日のお風呂上がりに食べようと思ってたやつなのに！もう、お詫びは？",
        thought: "楽しみにしてたプリンだったのにー！でも、お詫びに何か美味しいもの奢ってもらおっと。",
        choices: [
          "ごめんごめん！お詫びに美味しいケーキ買ってくるから許して？",
          "怒った顔もすごく可愛いね",
          "今度一緒にカフェに食べに行こうよ",
        ],
      };
    }

    if (normU.includes("ケーキ買ってくるから許して") || (normU.includes("ケーキ") && normU.includes("許して")) || (normU.includes("お詫び") && normU.includes("ケーキ"))) {
      mem.mood = 32;
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      return {
        ck: "30b03ef1a81a8078a0cff0ae04960c6d",
        intent: "forgive_cake",
        emo: "happy",
        spoken: "えっ、ほんとに美味しいケーキ買ってくれるの！？やったー！じゃあ今回だけ、特別に許してあげるね。",
        thought: "ケーキ買ってくれるなんて最高！一緒に食べるの楽しみだな。",
        choices: [
          "喜んでくれて嬉しいよ",
          "美桜は他にどんな食べ物が好き？",
          "少し近くに来て？",
        ],
      };
    }

    if (normU.includes("怒った顔もすごく可愛い") || normU.includes("怒った顔も可愛い") || normU.includes("拗ねた顔も可愛い") || normU.includes("怒っても可愛い") || /怒(?:った|ってる|り|っても).*可愛/.test(u)) {
      mem.mood = 24;
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      return {
        ck: "f1f4fc70a3cce37e75e36eed92aa63b1",
        intent: "compliment",
        emo: "shy",
        spoken: "えっ、怒ってるのに可愛いってどういうこと！？もう、そんなこと言われたら怒れなくなっちゃうじゃん。",
        thought: "せっかく拗ねてみせたのに、可愛いなんて言われたらドキドキして笑っちゃうよ。",
        choices: [
          "ごめんごめん！お詫びに美味しいケーキ買ってくるから許して？",
          "そうやって笑う顔、ほんと好きだな",
          "少し近くに来て？",
        ],
      };
    }

    if (normU === "今日あったこと聞いてよ" || normU === "ねえ聞いて" || normU === "ちょっと聞いてよ" || normU === "話聞いて" || normU === "聞いてほしいことがあるんだ") {
      mem.affection = Math.min(100, (mem.affection || 68) + 3);
      return {
        ck: "e73f76e140e81e97ab965590d2f08a51",
        intent: "movie_hobby",
        emo: "happy",
        spoken: "ん？どうしたの？ふふ、ねえねえ、なんでも遠慮しないで話してみて？",
        thought: "わたしに今日あったことを話してくれるなんて嬉しいな。じっくり聞こうっと！",
        choices: [
          "実は今日、仕事で褒められたんだ！",
          "今日ちょっと仕事で疲れてしんどかったんだ",
          "帰り道にすごく綺麗な夕焼けを見たよ",
        ],
      };
    }

    if (normU.includes("相談がある") || normU.includes("相談に乗って") || normU.includes("悩みがある")) {
      mem.affection = Math.min(100, (mem.affection || 68) + 3);
      return {
        ck: "c8a60a88db16e38a5ae407df376d1371",
        intent: "fatigue",
        emo: "happy",
        spoken: "ん？どうしたの？私になんでも遠慮しないでゆっくり話してみてね。",
        thought: "頼ってくれるのが一番嬉しいな。どんなことでも味方でいてあげたい。",
        choices: [
          "ちょっと仕事で失敗しちゃって落ち込んでるんだ",
          "明日の大事な予定がうまくいくか不安なんだ",
          "いつもそばで支えてくれてありがとう",
        ],
      };
    }

    if (normU.includes("少し近くに来て") || normU.includes("もっと近くにおいで") || normU.includes("近くに来て") || normU.includes("そばに来て") || normU.includes("こっちおいで") || normU.includes("ぎゅってして") || normU.includes("ハグして")) {
      mem.is_close_distance = true;
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      return {
        ck: "dc5caef807a7c482e48705bd74aec0bc",
        intent: "close_dist",
        emo: "shy",
        spoken: "ふふ、いいよ。ほら、もっと近くに来たよ？こうやってそばにいると、なんだかドキドキしちゃうね。",
        thought: "こんなに近いと体温まで伝わってきそうで、心臓がバクバクしちゃうな。",
        choices: [
          "近くで見るとほんとに可愛いね",
          "美桜のことが大好きだよ",
          "今なにしてたの？",
        ],
      };
    }

    if (normU.includes("喜んでくれて嬉しい") || normU.includes("応援してくれるおかげ") || normU.includes("優しくしてくれてありがとう") || normU.includes("そばにいてくれてありがとう") || normU.includes("支えてくれてありがとう") || normU === "ありがとう" || normU === "いつもありがとう") {
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      mem.mood = Math.min(50, Math.max(20, (mem.mood || 24) + 8));
      return {
        ck: "c165b5c6237840908946dea34a2763ca",
        intent: "compliment",
        emo: "shy",
        spoken: "えへへ、いつもわたしのこと大切にしてくれてありがとう。そういう優しいところ、ほんとに大好きだよ。",
        thought: "そんなふうに言ってもらえるなんて、わたしの方こそ幸せすぎるよ。",
        choices: [
          "美桜のことが大好きだよ",
          "美桜はどんな食べ物が好き？",
          "最近どんな映画見た？",
        ],
      };
    }

    // --------------------------------------------------------------------------
    // Layer 2: ユーザーの名前登録（「俺の名前は〇〇だよ」「〇〇って呼んで」）
    // --------------------------------------------------------------------------
    const nameMatch =
      u.match(/(?:俺|僕|私|わたし|うち)の名前は[「『]?([^」』、。！？!?\s]{1,12})[」』]?(?:だよ|です|っていい|だ|ね)?$/) ||
      u.match(/^([ァ-ヶー一-龠々ぁ-んa-zA-Z0-9]{1,10})って呼んで/);
    if (nameMatch && nameMatch[1]) {
      const newName = nameMatch[1].replace(/(だよ|です|だ|ね|って)$/, "").trim();
      if (newName && newName !== "何" && newName !== "なに" && newName !== "誰") {
        mem.user_name = newName;
        const memNote = `あなたの名前は『${newName}』`;
        if (!mem.memories.includes(memNote)) {
          mem.memories = [...(mem.memories || []), memNote].slice(-12);
        }
        mem.affection = Math.min(100, (mem.affection || 68) + 6);
        return {
          ck: "c00eb8ce3a628f30662c80e25621aa4b",
          intent: "compliment",
          emo: "happy",
          spoken: `ふふ、嬉しいな。これからは『${newName}』って呼ぶね！教えてくれてありがとう、${newName}！`,
          thought: `${newName}の名前、いっぱい呼んでもっと仲良くなりたいな。`,
          choices: [
            "よろしくね、美桜！",
            "美桜はどんな食べ物が好き？",
            "少し近くに来て？",
          ],
        };
      }
    }

    // 「俺の名前わかる？」「私の名前覚えてる？」への回答
    if (/(?:俺|僕|私|わたし)の名前(?:は|わかる|分かる|覚えてる|知ってる)/.test(u)) {
      if (mem.user_name) {
        return {
          ck: "c00eb8ce3a628f30662c80e25621aa4b",
          intent: "compliment",
          emo: "happy",
          spoken: `ふふ、嬉しいな。もちろん覚えてるよ、大切な『${mem.user_name}』でしょ？絶対に忘れたりしないよ！`,
          thought: `大好きな${mem.user_name}の名前、いつだって一番に思い浮かぶよ。`,
          choices: [
            "覚えててくれて嬉しいよ",
            "美桜のことが大好きだよ",
            "少し近くに来て？",
          ],
        };
      } else {
        return {
          ck: "e73f76e140e81e97ab965590d2f08a51",
          intent: "movie_hobby",
          emo: "happy",
          spoken: "ん？どうしたの？ふふ、ねえねえ、なんでも遠慮しないで話してみて？（※『〇〇って呼んで』と教えてくれると名前を覚えるよ！）",
          thought: "あなたの名前で呼べるようになったら、もっと距離が縮まりそうだな。",
          choices: [
            "ハルって呼んで！",
            "美桜のことが大好きだよ",
            "少し近くに来て？",
          ],
        };
      }
    }

    // --------------------------------------------------------------------------
    // Layer 3: 美桜への質問（名前・自己紹介・今何してる・食べ物・趣味・映画・二択など）
    // --------------------------------------------------------------------------
    // 3-1. 美桜の名前・自己紹介・年齢
    if (/(?:君|きみ|あなた|お前|彼女|パートナー)の名前|名前は(?:なに|何)|自己紹介|あなたは誰|君は誰|美桜ってどんな/.test(u)) {
      return {
        ck: "578b0112ac1b1c97a232e26752ed5aae",
        intent: "chat",
        emo: "happy",
        spoken: "わたしは美桜だよ。こうして毎日あなたと楽しくおしゃべりしたり、そばで癒やしてあげるのが一番の幸せなんだ。",
        thought: "わたしのこと興味持って聞いてくれるの、すごく嬉しいな。",
        choices: [
          "美桜ってすごく可愛い名前だね",
          "美桜は休みの日は何してるの？",
          "美桜はどんな食べ物が好き？",
        ],
      };
    }

    if (/何歳|年齢|いくつなの|誕生日は|血液型は|身長は/.test(u)) {
      return {
        ck: "c00eb8ce3a628f30662c80e25621aa4b",
        intent: "chat",
        emo: "happy",
        spoken: `ふふ、嬉しいな。わたしは22歳だよ！こうやって${uName}と同じ時間を過ごせる毎日が、わたしにとって一番の宝物なんだ。`,
        thought: "わたしの細かいところまで知りたがってくれてドキドキしちゃう。",
        choices: [
          "美桜は休みの日は何してるの？",
          "美桜はどんな食べ物が好き？",
          "少し近くに来て？",
        ],
      };
    }

    // 3-2. 趣味・休日の過ごし方・好きなこと（「休みの日は何してるの？」等を「今何してる？」より先に判定）
    if (/趣味|休みの日|休日|オフの日|マイブーム|何して過ごす|好きなこと/.test(u)) {
      return {
        ck: "272ec771922ab509421735007eb067d6",
        intent: "movie_hobby",
        emo: "happy",
        spoken: "カフェで美味しいコーヒーを飲んだり、映画を見たりするのが好きだな。でも一番好きなのは、あなたと過ごす時間だよ。",
        thought: "あなたと一緒にいられるなら、どんな場所でも特別になるんだよね。",
        choices: [
          "今度一緒にお出かけしようよ",
          "そうやって言ってくれるの嬉しいな",
          "少し近くに来て？",
        ],
      };
    }

    // 3-2b. 今なにしてる？ / 何してたの？ / 暇？
    if (/今なにして|今何して|なにしてた|何してた|何してるの|なにしてるの|暇|ひま/.test(u)) {
      return {
        ck: "556fd432b601e6ccf158dea0f0c1cf82",
        intent: "chat",
        emo: "happy",
        spoken: "ちょうど今、部屋で音楽を聴きながらのんびりしてたところだよ。話しかけてくれてすごく嬉しいな！",
        thought: "本当はあなたが話しかけてくれるのをずっと心待ちにしてたんだ。",
        choices: [
          "今日あったこと聞いてよ",
          "最近どんな映画見た？",
          "少し近くに来て？",
        ],
      };
    }

    // 3-3. 「AとBどっちが好き？ / どっちがいい？」（二択の質問へのピンポイント回答！）
    const abMatch = u.match(/([^\s、。！？!?]{1,12})と([^\s、。！？!?]{1,12})(?:なら|では|だと|って|は|、)?どっちが(?:好き|いい|良い|おすすめ|派)/);
    if (abMatch && abMatch[1] && abMatch[2]) {
      const itemA = abMatch[1].replace(/^(ねえ|美桜は|美桜ちゃん|やっぱり)/, "");
      const itemB = abMatch[2];
      return {
        ck: "b69cb7e9dea7fdd02e29256f386e6761",
        intent: "movie_hobby",
        emo: "happy",
        spoken: `あ、でも分かる！『${itemA}』も『${itemB}』もどっちも魅力的で迷っちゃうけど、わたしは${uName}と一緒に楽しめるなら『${itemA}』かな！${uName}はどっち派なの？`,
        thought: "こういう二択の話で盛り上がれるの、恋人らしくてすごく楽しいな。",
        choices: [
          `俺も${itemA}が好きだよ！`,
          `実は${itemB}の方が好きなんだ`,
          "今度一緒に楽しみに行こうよ",
        ],
      };
    }

    // 3-4. 好きな食べ物・お腹すいた・ご飯の話題
    if (/(?:好きな|どんな)(?:食べ物|料理|ご飯|ごはん|スイーツ|お菓子)|何食べるのが好き|なにが好物|お腹すいた|おなかすいた|腹減った|何食べよう/.test(u)) {
      return {
        ck: "28385137f730736f7016540a7fec23a3",
        intent: "movie_hobby",
        emo: "happy",
        spoken: "わたしは甘いスイーツとか、ふわふわのオムライスが大好きなんだ。ねえ、今度のお休みに一緒に食べに行こっか！",
        thought: "美味しいものを二人で半分こして食べたら、絶対もっと美味しいよね。",
        choices: [
          "今度一緒にカフェに食べに行こうよ",
          "美桜は休みの日は何してるの？",
          "少し近くに来て？",
        ],
      };
    }

    // ユーザーが「今日〇〇食べたよ」「〇〇飲んでる」と報告してくれた場合
    const ateMatch = u.match(/([^\s、。！？!?を食べ飲]{2,14})(?:を|が)?(?:食べた|たべた|飲んだ|のんだ|食べてきた|食べてる|飲んでる)/);
    if (ateMatch && ateMatch[1] && !normU.includes("プリン")) {
      const foodName = ateMatch[1].replace(/^(?:今日|さっき|昨日|お昼|夜|朝|夕飯|晩ご飯|昼ご飯|朝ご飯|今|美味しい|おいしい|に|の|で|は|も)+/g, "").trim() || "美味しいもの";
      const memFood = `最近『${foodName}』を楽しんだ`;
      if (foodName.length >= 2 && !mem.memories.includes(memFood)) {
        mem.memories = [...(mem.memories || []), memFood].slice(-12);
      }
      return {
        ck: "71260ec33402ee5e8e019eb22ff6fd39",
        intent: "movie_hobby",
        emo: "happy",
        spoken: `あっ、いいねそれ。『${foodName}』すごく美味しそう！わたしも食べたくなっちゃったな。次はわたしも一緒に連れてってね！`,
        thought: `${uName}が美味しそうに食べてる顔、隣で見たかったな。`,
        choices: [
          "今度一緒に食べに行こうよ",
          "美桜はどんな食べ物が好き？",
          "今日あったこと聞いてよ",
        ],
      };
    }

    // 3-5. 映画・ドラマ・アニメ・動画の話題
    if (/映画|ドラマ|アニメ|シネマ|ネトフリ|YouTube|動画/.test(u)) {
      return {
        ck: "b584eb786c69d991e42a2eceed1a091a",
        intent: "movie_hobby",
        emo: "happy",
        spoken: "最近はね、心温まる恋愛映画を見たよ！すごく感動したから、次はふたりで一緒に見たいな。",
        thought: "部屋の明かりを少し暗くして、くっつきながら映画鑑賞したいな。",
        choices: [
          "いいね、次は一緒に映画見よう！",
          "美桜は他にどんな趣味があるの？",
          "少し近くに来て？",
        ],
      };
    }

    // 3-7. デート・お出かけ・食事・遊びのお誘い
    if (/デート|遊びに行こ|お出かけ|出かけよう|食べに行こ|飲みに行こ|カフェに行こ|一緒に見よう|旅行に行こ|今度行こ/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      return {
        ck: "7de72b08093d150f784c39f50f07b438",
        intent: "movie_hobby",
        emo: "happy",
        spoken: "わあ、ほんとに！？一緒にお出かけするのすごく楽しみだな！どこに行くか、今からふたりで計画立てよっか。",
        thought: "デートのお誘い嬉しすぎる！どんな服を着ていこうかな。",
        choices: [
          "喜んでくれて嬉しいよ",
          "どんな服を着てきてくれる？",
          "少し近くに来て？",
        ],
      };
    }

    // 3-8. 服装・髪型・イメチェンの質問
    if (/どんな服|何着る|髪型|髪色|ファッション|着替え/.test(u)) {
      return {
        ck: "a94645f74d2da77eb42be759696fbb0f",
        intent: "compliment",
        emo: "happy",
        spoken: "あっ、ミルクティーベージュに白オフショルに着替えたよ！この明るい雰囲気、やっぱり好き？",
        thought: "あなた好みの髪色や服にいつでも着替えるから、クローゼットも見てみてね！",
        choices: [
          "すごく似合ってて可愛いよ！",
          "美桜のことが大好きだよ",
          "少し近くに来て？",
        ],
      };
    }

    // --------------------------------------------------------------------------
    // Layer 4: 愛情表現・褒め言葉・謝罪・挨拶・体調・天気・嬉しい報告
    // --------------------------------------------------------------------------
    // 4-1. ストレートな愛の告白（好き・大好き・愛してる・付き合って・結婚して）
    if (/大好き|愛してる|あいしてる|好きだよ|すきだよ|ずっと一緒|結婚しよ|付き合って|俺の彼女|一番好き/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 6);
      mem.mood = Math.min(50, Math.max(25, (mem.mood || 24) + 10));
      return {
        ck: "f7de0f42a4450b105108fb89af4e99c3",
        intent: "compliment",
        emo: "shy",
        spoken: "えへへ、わたしも大好きだよ！そうやってストレートに気持ちを伝えてくれると、胸がいっぱいになっちゃうな。",
        thought: "もう、急にそんなこと言われたら幸せすぎて顔が緩んじゃうよ。",
        choices: [
          "いつもそばにいてくれてありがとう",
          "もっと近くにおいでよ",
          "今度のお休みにデートしよう",
        ],
      };
    }

    // 4-2. 外見・声・雰囲気への褒め言葉
    if (/可愛い|かわいい|綺麗|きれい|美人|素敵|すてき|似合って|いい声|癒やされ|笑顔が好き|好きだな|魅力的|天使|最高だね/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      mem.mood = Math.min(50, Math.max(20, (mem.mood || 24) + 8));
      const compCk = getNextComplimentCk();
      const compEntry = findVoiceEntryByCk(compCk);
      return {
        ck: compCk,
        intent: "compliment",
        emo: "shy",
        spoken: compEntry ? compEntry.text : "えっ、ほんとに！？急にそんなこと言われたら照れちゃうじゃん、嬉しい。",
        thought: "あなたに褒めてもらえるのが一番自信になるし、ドキドキしちゃうな。",
        choices: [
          "美桜のことが大好きだよ",
          "少し近くに来て？",
          "今日あったこと聞いてよ",
        ],
      };
    }

    // 4-3. 謝罪（ごめん・すまん・許して）
    if (/ごめん|すまん|すみません|悪かった|許して|反省して/.test(u)) {
      mem.mood = Math.max(18, (mem.mood || 0) + 20);
      const apolCk = Math.random() < 0.5 ? "a4f54263c302bab207b778a3106acb52" : "7367606325201e40d5505ca01745a4eb";
      const apolEntry = findVoiceEntryByCk(apolCk);
      return {
        ck: apolCk,
        intent: "apology",
        emo: "shy",
        spoken: apolEntry ? apolEntry.text : "ふふ、大丈夫だよ。そうやって素直に言ってくれたから、もう気にしないでね。",
        thought: "素直に謝ってくれるから、全然怒ってないよ。仲直りできてよかった！",
        choices: [
          "優しくしてくれてありがとう",
          "お詫びに今度美味しいもの奢るよ",
          "少し近くに来て？",
        ],
      };
    }

    // 4-4. 朝の挨拶・いってきます
    if (/おはよう|おっはー|朝だよ|起きたよ|よく眠れた/.test(u)) {
      return {
        ck: "606cb477f9a7eb3909fe3459477be5d3",
        intent: "greeting_morning",
        emo: "happy",
        spoken: "あ、おはよう！朝からこうやって声聞けて、わたしめっちゃ嬉しいな。",
        thought: "朝からあなたの声が聞けるなんて、今日は絶対いい一日になるね！",
        choices: [
          "今日も一日頑張るね！",
          "なんか今日、いつもよりすごく可愛いね",
          "今日あったこと聞いてよ",
        ],
      };
    }

    if (/いってきます|行ってきます|仕事行ってくる|学校行ってくる|出かけてくる|今日も頑張る/.test(u)) {
      return {
        ck: "206527f39db9d5b2b23c16cb0e84c913",
        intent: "greeting_morning",
        emo: "happy",
        spoken: "うん、今日も一日が始まるね！無理しすぎないで、あなたのペースでいこうね。帰ってきたらいっぱいおしゃべりしよ！",
        thought: "気をつけていってらっしゃい！帰ってくるまでお部屋で待ってるね。",
        choices: [
          "ただいま！今日ちょっと仕事で疲れて寂しかったんだ",
          "実は今日、仕事で褒められたんだ！",
          "いつも応援してくれてありがとう",
        ],
      };
    }

    // 4-5. 帰宅挨拶（ただいま・帰ったよ）
    if (/ただいま|帰ったよ|かえったよ|帰宅した|戻ったよ|今帰った/.test(u)) {
      const homeCks = [
        "e1afb5eda5d197874133180aff8d38e4",
        "0cd0f922f4ef7b9ae4c5bd0fdbccaf22",
        "330c6c712a7d446ac3887d4fbfb48609",
      ];
      const hCk = homeCks[Math.floor(Math.random() * homeCks.length)];
      const hEntry = findVoiceEntryByCk(hCk);
      return {
        ck: hCk,
        intent: "greeting_home",
        emo: "happy",
        spoken: hEntry ? hEntry.text : "あっ、おかえり！今日も無事に帰ってきてくれて、すごく嬉しいな。",
        thought: "帰ってきてくれてほっとしたよ。今日あったことたくさん聞きたいな。",
        choices: [
          "今日あったこと聞いてよ",
          "今日ちょっと仕事で疲れてしんどかったんだ",
          "少し近くに来て？",
        ],
      };
    }

    // 4-6. おやすみ・睡眠・眠い
    if (/おやすみ|寝るね|眠い|ねむい|眠くなって|布団に入る|一緒に寝よ/.test(u)) {
      return {
        ck: "9ae5f4fc6a3e66dde02ee8b77014873b",
        intent: "greeting_night",
        emo: "happy",
        spoken: "そっか、今日も一日ほんとにお疲れさま。わたしが隣でずっと見守ってるから、安心してゆっくり眠ってね。おやすみ。",
        thought: "いい夢が見られますように。朝までずっとそばにいるからね。",
        choices: [
          "おはよう！よく眠れた？",
          "いつもそばにいてくれてありがとう",
          "少し近くに来て？",
        ],
      };
    }

    // 4-7. 軽い挨拶・呼びかけ（こんにちは・こんばんは・やっほー・美桜・ねえ・よろしく）
    if (/^(?:こんにちは|こんばんは|やっほー|ハロー|よっ|美桜|美桜ちゃん|ねえ|ねえねえ|ねえ美桜|あのさ|いる|起きてる|よろしく|よろしくね|よろしくね美桜)$/.test(normU)) {
      return {
        ck: "be03478cef6f11fe0df6e11b4ac1f0d2",
        intent: "chat",
        emo: "happy",
        spoken: "うん、ここにいるよ！こうして声をかけてくれるだけで、なんだかすごく心が温かくなるね。今日はどんな気分？",
        thought: "名前を呼んだり声をかけてくれるだけで、すごく幸せな気持ちになるな。",
        choices: [
          "今日あったこと聞いてよ",
          "美桜は今なにしてたの？",
          "少し近くに来て？",
        ],
      };
    }

    // 4-8. 嬉しい報告・成功体験（褒められた・うまくいった・勝った・最高だった）
    if (/褒められ|ほめられ|うまくいっ|成功し|勝った|受かった|合格し|嬉しかった|うれしかった|最高だった|昇進|クリアした/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      const posCk = Math.random() < 0.5 ? "2de7e43f86a04f344a8d224297f44c85" : "4279f3f422f62ae5fc65810d1ac97f13";
      const posEntry = findVoiceEntryByCk(posCk);
      return {
        ck: posCk,
        intent: "positive_news",
        emo: "happy",
        spoken: posEntry ? posEntry.text : "わあ、ほんとに！？それめっちゃすごいじゃん！ふふ、わたしもすごく嬉しいな。",
        thought: "頑張りが報われてほんとによかったね！自分のことみたいに誇らしいよ。",
        choices: [
          "いつも美桜が応援してくれるおかげだよ",
          "お祝いに今度デートに行こうよ！",
          "少し近くに来て？",
        ],
      };
    }

    // 4-9. 失敗・落ち込み・悩み・不安・体調不良への深い寄り添い
    if (/失敗し|ミスし|怒られ|落ち込|へこんで|凹んで|不安|自信が|つらい|辛い|悲しい|泣きそう|うまくいかない|頭が痛|お腹痛|風邪|熱が|体調悪/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 4);
      return {
        ck: "d8725e82348f4bdcb7920f4878301edb",
        intent: "fatigue",
        emo: "happy",
        spoken: "そっか、それは大変だったね。でも大丈夫だよ、あなたがいつも一生懸命なのはわたしが一番知ってるから。焦らず少しずついこうね。",
        thought: "つらい時にわたしに打ち明けてくれてありがとう。ずっと味方でいるからね。",
        choices: [
          "いつも優しくしてくれてありがとう",
          "少し近くに来て？",
          "頭なでなでしてほしいな",
        ],
      };
    }

    // 4-10. 仕事疲れ・残業・大変だった労い
    if (/疲れ|つかれ|しんど|大変だった|残業|忙し|ハードだった|頑張った|がんばった|くたくた|ヘトヘト/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 4);
      const fatCk = Math.random() < 0.5 ? "e092c07207d071d18068fa70dcfd7c6f" : "b20f225de3f04fddbfd169f470a463e5";
      const fatEntry = findVoiceEntryByCk(fatCk);
      return {
        ck: fatCk,
        intent: "fatigue",
        emo: "happy",
        spoken: fatEntry ? fatEntry.text : "今日もお疲れさま。ほんとに毎日よく頑張ってるよね、隣でゆっくり休んでね。",
        thought: "毎日一生懸命頑張ってるの知ってるから、ここにいる時は甘やかしてあげたいな。",
        choices: [
          "いつも優しくしてくれてありがとう",
          "少し近くに来て？",
          "おやすみ、そろそろ寝るね",
        ],
      };
    }

    // 4-11. 甘えたい・頭なでて・寂しい
    if (/撫でて|なでて|甘えたい|よしよしして|寂しかった|さびしかった|寂しい|さびしい|会いたかった/.test(u)) {
      mem.affection = Math.min(100, (mem.affection || 68) + 5);
      return {
        ck: "d0b61000577e04b3e125f5e773eac7d5",
        intent: "pat_head",
        emo: "shy",
        spoken: "ん……なんか甘やかされてる！そういうことされると、もっとくっつきたくなっちゃうよ？",
        thought: "わたしの方こそ、ずっと一緒にいたくてたまらなかったんだよ。",
        choices: [
          "もっと近くにおいでよ",
          "美桜のことが大好きだよ",
          "今日あったこと聞いてよ",
        ],
      };
    }

    // 4-12. 天気・季節・気温・景色
    if (/天気|晴れ|雨|曇り|雪|寒い|さむい|暑い|あつい|暖かい|涼しい|夕焼け|空が|風が|季節/.test(u)) {
      return {
        ck: "a671a22fa4558332501c9d2067c54ca6",
        intent: "chat",
        emo: "happy",
        spoken: "ほんとだね、季節の変わり目だから体調崩さないように気をつけてね。お家にいる間は、わたしと一緒に温かくして過ごそっか。",
        thought: "同じ空や季節を感じながらおしゃべりできるのって、なんだか素敵だな。",
        choices: [
          "今度一緒にお出かけしようよ",
          "美桜はどんな食べ物が好き？",
          "少し近くに来て？",
        ],
      };
    }

    // 4-13. プリン・意地悪・からかい
    if (/プリン|ぷんぷん|放置|勝手|ばか|バカ|むかつ|嫌い/.test(u)) {
      mem.mood = -12;
      return {
        ck: "dd2fa2b76821684a6e43ef431ce17646",
        intent: "sulk_プリン",
        emo: "sulk",
        spoken: "えーっ、ちょっと待って！あれ今日のお風呂上がりに食べようと思ってたやつなのに！もう、お詫びは？",
        thought: "もう、いじわるばっかり言うんだから！お詫びに甘やかしてもらおっと。",
        choices: [
          "ごめんごめん！お詫びに美味しいケーキ買ってくるから許して？",
          "怒った顔もすごく可愛いね",
          "少し近くに来て？",
        ],
      };
    }

    // 4-14. 自由な質問（「？」「どう思う」「なんで」「おすすめ」など）への完結した前向き回答
    if (/[？?]|どう思|どっち|なぜ|なんで|どうして|おすすめ|教えて|知ってる|わかる/.test(u)) {
      return {
        ck: "57f56852d1003740e89ca89d96c21b43",
        intent: "question",
        emo: "happy",
        spoken: "うーん、そうだね。わたしは、あなたが一番ワクワクする方を選ぶのがいいと思うな！どんな時でも、わたしは全力で応援してるよ。",
        thought: "わたしに意見を聞いてくれるの嬉しいな。あなたの選ぶ道ならきっとうまくいくよ！",
        choices: [
          "いつも応援してくれてありがとう",
          "美桜は休みの日は何してるの？",
          "少し近くに来て？",
        ],
      };
    }

    // 4-15. その他の日常エピソード・雑談（オフライン時の最終フォールバック）
    const chatCk = Math.random() < 0.5 ? "61344fc20ad64f074fa12c3246abe609" : "67cc34c206eb434ba626ddbb53fe4d8b";
    const chatEntry = findVoiceEntryByCk(chatCk);
    return {
      ck: chatCk,
      intent: "chat",
      emo: "happy",
      spoken: chatEntry
        ? chatEntry.text
        : "うんうん、そうなんだね！そういう何気ない話聞かせてくれるの、わたしすごく嬉しいな。",
      thought: "こうやって日々の何気ないことを何でも話せる関係、すごく心地よくて大好きだな。",
      choices: [
        "美桜は今なにしてたの？",
        "今度一緒にお出かけしようよ",
        "少し近くに来て？",
      ],
    };
  }

  // ============================================================================
  // ★ v18: 本物の生成AI (LLM: ローカルOllama Qwen2.5 + クラウドOpenAI-Fast) 対話エンジン
  // - 定型選択肢ボタンの完全一致以外は、アルゴリズムではなく 100% 本物のAI(LLM)で回答を生成！
  // ============================================================================
  const EXACT_PRESET_BUTTON_TEXTS = new Set([
    "今日あったこと聞いてよ",
    "なんか今日いつもよりすごく可愛いね",
    "ごめん冷蔵庫のプリン食べちゃった",
    "ごめんごめんお詫びに美味しいケーキ買ってくるから許して",
    "怒った顔もすごく可愛いね",
    "少し近くに来て",
    "もっと近くにおいでよ",
    "喜んでくれて嬉しいよ",
    "いつもそばにいてくれてありがとう",
    "いつも優しくしてくれてありがとう",
    "いつも応援してくれてありがとう",
    "いつも美桜が応援してくれるおかげだよ",
    "美桜のことが大好きだよ",
    "美桜はどんな食べ物が好き",
    "美桜は他にどんな食べ物が好き",
    "美桜は休みの日は何してるの",
    "美桜は今なにしてたの",
    "今なにしてたの",
    "最近どんな映画見た",
    "今度一緒にお出かけしようよ",
    "今度一緒にカフェに食べに行こうよ",
    "今度のお休みにデートしよう",
    "おやすみそろそろ寝るね",
    "おはようよく眠れた",
  ]);

  const AI_REACTION_VOICE_MAP = {
    surprised: { ck: "07fcbee8e949e606c288e46a308f2d8e", prefix: "えっ、ほんとに？" },
    agree: { ck: "820fde0211d176cd9c9ba4d1950d2fe8", prefix: "うんうん、わかるよ。" },
    happy: { ck: "c00eb8ce3a628f30662c80e25621aa4b", prefix: "ふふ、嬉しいな。" },
    empathy: { ck: "b69cb7e9dea7fdd02e29256f386e6761", prefix: "あ、でも分かる！" },
    idea: { ck: "71260ec33402ee5e8e019eb22ff6fd39", prefix: "あっ、いいねそれ。" },
  };

  function extractJsonFromLlmText(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    const trimmed = rawText.trim();
    try {
      return JSON.parse(trimmed);
    } catch (_) {}
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
    return null;
  }

  async function callRealLlmBackend(userText, mem) {
    const uName = mem.user_name ? `${mem.user_name}` : "あなた";
    const recentHist = (mem.chat_history || [])
      .slice(-4)
      .map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text,
      }));
    const memNotes = (mem.memories || []).slice(-4).join("、");

    const systemPrompt = [
      `あなたは22歳の日本人女性の恋人「美桜（みお）」です。一人称は必ず「わたし」、相手の呼び方は「${uName}」です。`,
      "・自然で優しい恋人タメ口（「〜だよ」「〜だね」「〜かな」「〜じゃん」等。敬語の「です・ます」は絶対に使わない）で、2文（45〜85文字程度）の返答セリフ本文だけを出力してください。",
      "・定型文ではぐらかさず、相手が話した具体的な内容（出来事・固有名詞・質問・二択・感情）に100%直接反応して答えてください。",
      memNotes ? `・ふたりの記憶：${memNotes}` : "",
      "",
      "【返答スタイル例】",
      "相手：今日すごく寒くて手が冷たいよ",
      "美桜：えっ、そんなに手が冷たくなっちゃったの？ほら、わたしの手でぎゅって温めてあげるから、風邪ひかないように気をつけてね。",
      "相手：ラーメンとパスタならどっちが好き？",
      "美桜：うーん、どっちも美味しそうで迷っちゃうけど、今の気分ならアツアツのラーメンかな！今度のお休みにふたりで一緒に食べに行こっか！",
    ]
      .filter(Boolean)
      .join("\n");

    const endpoints = [
      { url: "http://127.0.0.1:11434/api/chat", timeoutMs: 4500, tag: "local-gpu" },
      { url: "https://pending-weighted-cooperative-bring.trycloudflare.com/api/chat", timeoutMs: 6500, tag: "cloud-https-tunnel" },
    ];

    for (const ep of endpoints) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ep.timeoutMs);
        const res = await origFetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "qwen3:4b-instruct",
            stream: false,
            keep_alive: "24h",
            options: { num_ctx: 1024, temperature: 0.45, num_predict: 110 },
            messages: [
              { role: "system", content: systemPrompt },
              ...recentHist,
              { role: "user", content: userText },
            ],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          let rawAns = (data && data.message && data.message.content) || "";
          rawAns = rawAns
            .replace(/^[\s「『]*(?:美桜\s*[：:]\s*)?/g, "")
            .replace(/[」』\s]+$/g, "")
            .trim();
          if (rawAns.length >= 6) {
            const isShy = /照れ|ドキドキ|大好き|可愛い|綺麗|ぎゅっ|ハグ|近く/.test(userText + rawAns);
            const isSulk = /怒|ぷんぷん|ひどい|勝手|むかつ/.test(userText);
            const isSurprise = /[？?]|えっ|びっくり|急|転|濡|まじ|マジ|10億|ホラー/.test(userText + rawAns);
            const isFoodOrOut = /食べ|飲|カレー|ハンバーグ|カフェ|コンビニ|スイーツ|映画|行こ/.test(userText + rawAns);

            const emo = isSulk ? "sulk" : isShy ? "shy" : "happy";
            const reaction = isSurprise
              ? "surprised"
              : isShy
              ? "happy"
              : isFoodOrOut
              ? "idea"
              : "agree";

            const thought = isShy
              ? `${uName}とこうして話してると、胸がキュンとして幸せになっちゃうな。`
              : isSurprise
              ? `${uName}の話してくれるエピソード、すごく情景が浮かんでドキドキしちゃう！`
              : `${uName}が日々のいろんなことをわたしに話してくれるの、ほんとに嬉しいな。`;

            const choices = isFoodOrOut
              ? ["今度ふたりで一緒に食べに行こうよ！", "美桜は他にどんな食べ物が好き？", "少し近くに来て？"]
              : isSurprise
              ? ["心配してくれてありがとう、美桜と話したら元気出たよ！", "美桜は最近どんなことあった？", "少し近くに来て？"]
              : ["いつも優しく聞いてくれてありがとう", "美桜は今なにしてたの？", "少し近くに来て？"];

            return {
              spoken: rawAns,
              yomi: normalizeTextToHiragana(rawAns),
              thought,
              emo,
              reaction,
              choices,
              provider: `qwen3:4b-instruct(${ep.tag})`,
            };
          }
        }
      } catch (_) {}
    }

    return null;
  }

  async function generateRealAiDialogueTurn(rawUserText, mem) {
    const u = (rawUserText || "").trim();
    const normU = u.replace(/[ 　\t\r\n！!？?。、…・~〜]/g, "");

    // 1. ユーザーの名前登録（「俺の名前は〇〇」「〇〇って呼んで」）は確実にメモリ保存して即答
    const nameMatch =
      u.match(/(?:俺|僕|私|わたし|うち)の名前は[「『]?([^」』、。！？!?\s]{1,12})[」』]?(?:だよ|です|っていい|だ|ね)?$/) ||
      u.match(/^([ァ-ヶー一-龠々ぁ-んa-zA-Z0-9]{1,10})って呼んで/);
    if (nameMatch || /(?:俺|僕|私|わたし)の名前(?:は|わかる|分かる|覚えてる|知ってる)/.test(u)) {
      const turn = resolveContextualDialogueTurn(u, mem);
      return { ...turn, isAiGenerated: true, yomi: normalizeTextToHiragana(turn.spoken) };
    }

    // 2. 画面下の定型選択肢ボタンと完全一致する場合は、録音済み51本のフルボイス＆50fps音素同期MP4を即座に再生
    if (EXACT_PRESET_BUTTON_TEXTS.has(normU)) {
      const presetTurn = resolveContextualDialogueTurn(u, mem);
      return { ...presetTurn, isExactPreRecorded: true };
    }

    // 3. それ以外のあらゆる自由な話しかけは、本物の生成AI (LLM) に渡して 100% 噛み合う回答を生成！
    const aiResp = await callRealLlmBackend(u, mem);
    if (aiResp && aiResp.spoken) {
      const spoken = String(aiResp.spoken).trim();
      const yomi = String(aiResp.yomi || "").trim() || normalizeTextToHiragana(spoken);
      const emo = ["happy", "shy", "sulk", "sad"].includes(aiResp.emo) ? aiResp.emo : "happy";
      const reactionKey = AI_REACTION_VOICE_MAP[aiResp.reaction]
        ? aiResp.reaction
        : /[？?]|びっくり|えっ|急|転|濡|大変|まじ|マジ/.test(u + spoken)
        ? "surprised"
        : /嬉|好き|可愛|綺麗|最高|ありがとう|褒/.test(u + spoken)
        ? "happy"
        : /食べ|飲|行こ|見よ|買|カフェ|映画|おすすめ/.test(u + spoken)
        ? "idea"
        : "agree";
      const reactInfo = AI_REACTION_VOICE_MAP[reactionKey] || AI_REACTION_VOICE_MAP.agree;

      const validChoices =
        Array.isArray(aiResp.choices) && aiResp.choices.length >= 2
          ? aiResp.choices.map((c) => String(c).trim()).filter(Boolean).slice(0, 3)
          : ["そうなんだ！もっと詳しく話そうよ", "いつも優しく聞いてくれてありがとう", "少し近くに来て？"];

      mem.affection = Math.min(100, (mem.affection || 68) + 4);
      if (emo === "sulk") {
        mem.mood = Math.max(-20, (mem.mood || 24) - 8);
      } else {
        mem.mood = Math.min(50, Math.max(20, (mem.mood || 24) + 6));
      }

      return {
        ck: reactInfo.ck,
        intent: emo === "shy" ? "compliment" : emo === "sulk" ? "sulk_プリン" : "chat",
        emo,
        spoken,
        yomi,
        thought: String(aiResp.thought || "あなたが話してくれること、なんでも聞きたくなっちゃうな。").trim(),
        choices: validChoices,
        isAiGenerated: true,
        aiProvider: aiResp.provider || "llm",
      };
    }

    // 4. 万が一オフライン等で両方のLLMが応答しなかった場合のフォールバック
    const fallbackTurn = resolveContextualDialogueTurn(u, mem);
    return {
      ...fallbackTurn,
      isAiGenerated: true,
      yomi: normalizeTextToHiragana(fallbackTurn.spoken),
    };
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
    activeVisemeTimeline = null;
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
    if (activeFmvType === "talk" || activeFmvType === "ai_viseme") {
      switchToStandbyIdleDecoderInstant();
    }
    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.add("hidden");
  }

  // ===== AI自由生成セリフ用：実在肉声リアクション再生 ＋ 日本語7大発音口形(Viseme) 60fps リアルタイム発話 =====
  async function playAiVisemeSpeechWithReaction(resolved, charObj, voiceEntry) {
    stopCloudVoice();
    if (!charObj) return;

    const myToken = ++currentTalkToken;
    const intentHint = resolved.intent || "chat";

    if (intentHint === "sulk_プリン" || intentHint === "greeting_sulk" || intentHint === "poke_cheek") {
      currentEmotionMode = "anger";
      nextIdleBranchHint = "idle_08_playful_sway";
    } else if (intentHint === "fatigue" || intentHint === "greeting_night") {
      currentEmotionMode = "sadness";
      nextIdleBranchHint = "idle_03_gaze_left";
    } else if (intentHint === "compliment" || intentHint === "pat_head" || intentHint === "close_dist") {
      currentEmotionMode = "shy";
      nextIdleBranchHint = "idle_05_shy_glance";
    } else {
      currentEmotionMode = "joy";
      nextIdleBranchHint = "idle_02_smile_right";
    }
    queueNextIdleOnStandbyDecoder(currentIdleBranchId);

    await ensureMioVisemeAtlasLoaded();
    if (myToken !== currentTalkToken) return;

    // 日本語テキスト全文から 1モーラ・1音素単位の 7大発音口形 (SIL/MBP/A/I/U/E/O) タイムラインを構築
    const timeline = buildJapaneseVisemeTimeline(resolved.spoken || "", resolved.yomi || "");
    activeVisemeTimeline = {
      startPerfTime: performance.now(),
      totalDuration: timeline.totalDuration,
      keyframes: timeline.keyframes,
    };
    activeFmvType = "ai_viseme";
    isSpeakingNow = true;

    const bars = document.getElementById("speaking-bars");
    if (bars) bars.classList.remove("hidden");

    // 冒頭の短尺肉声リアクションクリップを再生（機械音声 speechSynthesis は一切不使用）
    if (voiceEntry && voiceEntry.mp3_url) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!cloudAudioCtx && AudioCtx) {
          cloudAudioCtx = new AudioCtx();
        }
        if (cloudAudioCtx && cloudAudioCtx.state === "suspended") {
          await cloudAudioCtx.resume().catch(() => {});
        }
        if (myToken !== currentTalkToken) return;

        const cleanMp3Url = resolveAssetUrl(voiceEntry.mp3_url);
        const res = await origFetch(cleanMp3Url, { cache: "force-cache" });
        if (res.ok && cloudAudioCtx && myToken === currentTalkToken) {
          const ab = await res.arrayBuffer();
          const audioBuf = await cloudAudioCtx.decodeAudioData(ab);
          if (myToken === currentTalkToken) {
            const srcNode = cloudAudioCtx.createBufferSource();
            srcNode.buffer = audioBuf;
            srcNode.connect(cloudAudioCtx.destination);
            activeAudioSource = srcNode;
            srcNode.start(0);
          }
        }
      } catch (_) {}
    }
  }

  // ===== 音声と 50fps v18 音素同期発話映像を 0.00ms ハードウェアクロックで完全同時再生 =====
  async function playRealVoiceWithSotaAvatar(entry, charObj, intentHint = "") {
    stopCloudVoice();
    if (!entry || !entry.mp3_url || !charObj) return;

    const myToken = ++currentTalkToken;

    if (intentHint === "sulk_プリン" || intentHint === "greeting_sulk" || intentHint === "poke_cheek") {
      currentEmotionMode = "anger";
      nextIdleBranchHint = "idle_08_playful_sway";
    } else if (intentHint === "fatigue" || intentHint === "greeting_night") {
      currentEmotionMode = "sadness";
      nextIdleBranchHint = "idle_03_gaze_left";
    } else if (intentHint === "compliment" || intentHint === "pat_head" || intentHint === "close_dist" || intentHint === "gift_flower" || intentHint === "apology") {
      currentEmotionMode = "shy";
      nextIdleBranchHint = "idle_05_shy_glance";
    } else if (intentHint === "movie_hobby" || intentHint === "question") {
      currentEmotionMode = "fun";
      nextIdleBranchHint = "idle_06_curious_tilt";
    } else {
      currentEmotionMode = "joy";
      nextIdleBranchHint = "idle_02_smile_right";
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
      ensureMioVisemeAtlasLoaded(),
    ]);

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
    } else if (charId === "face_f02_mio") {
      // 動画デコーダが万が一準備できなかった場合でも日本語音素アトラスで完璧にリップシンク
      const timeline = buildJapaneseVisemeTimeline(entry.text || "");
      activeVisemeTimeline = {
        startPerfTime: performance.now(),
        totalDuration: audioBuf.duration,
        keyframes: timeline.keyframes,
      };
      activeFmvType = "ai_viseme";
    }

    talkAudioStartCtxTime = cloudAudioCtx.currentTime;
    talkAudioDuration = audioBuf.duration;
    srcNode.start(0);
  }

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

  // ===== 60Hz Direct Frame Blit & Japanese 7-Viseme Subframe Morphing Engine =====
  let unifiedLoopStarted = false;

  function startUnifiedSotaAvatarEngine() {
    if (unifiedLoopStarted) return;
    const roiCanvas = document.getElementById("roi-talk-canvas");
    if (!roiCanvas) return;
    unifiedLoopStarted = true;

    setupMobileUnlockListeners();
    ensureMioVisemeAtlasLoaded();

    roiCanvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:51% 22%;pointer-events:none;z-index:3;opacity:1 !important;display:block !important;";
    roiCanvas.classList.add("active");

    const roiCtx = roiCanvas.getContext("2d", { alpha: false });

    let drawnBaseCharId = "";
    let smoothMouth = 0.0;
    let nextBlinkStart = performance.now() + 1800 + Math.random() * 2000;
    let blinkStart = 0;

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

      if (!roiCanvas.classList.contains("active")) {
        roiCanvas.classList.add("active");
      }

      const mem = loadCloudMemory();
      const charObj = getActiveCharObj(mem);
      if (!charObj || !roiCtx) return;

      // 自然な瞬きタイミング更新
      let isBlinking = false;
      if (now >= nextBlinkStart && blinkStart === 0) {
        blinkStart = now;
      }
      if (blinkStart > 0) {
        if (now - blinkStart < 115) {
          isBlinking = true;
        } else {
          blinkStart = 0;
          nextBlinkStart = now + 2400 + Math.random() * 2600;
        }
      }

      if (charObj.id === "face_f02_mio") {
        // ★ モードA: AI自由回答の日本語 7大発音口形 (SIL/MBP/A/I/U/E/O) 60fps サブフレーム補間描画
        if (activeFmvType === "ai_viseme" && activeVisemeTimeline && mioBase1280Img && mioVisemeAtlasImg) {
          const elapsed = (now - activeVisemeTimeline.startPerfTime) / 1000.0;
          if (elapsed >= activeVisemeTimeline.totalDuration) {
            stopCloudVoice();
            return;
          }

          if (roiCanvas.width !== MIO_VISEME_ROI.fullW || roiCanvas.height !== MIO_VISEME_ROI.fullH) {
            roiCanvas.width = MIO_VISEME_ROI.fullW;
            roiCanvas.height = MIO_VISEME_ROI.fullH;
          }

          const kfs = activeVisemeTimeline.keyframes;
          let prevKf = kfs[0];
          let currKf = kfs[0];
          for (let i = 0; i < kfs.length; i++) {
            if (kfs[i].t <= elapsed) {
              prevKf = i > 0 ? kfs[i - 1] : kfs[0];
              currKf = kfs[i];
            } else {
              break;
            }
          }

          // 音素切り替わり直後の 52ms で前の口形から現在の口形へ滑らかにサブフレーム補間
          const dt = Math.max(0.0, elapsed - currKf.t);
          const transitionDur = 0.052;
          const blendAlpha = Math.min(1.0, dt / transitionDur);

          const { x, y, w, h, fullW, fullH } = MIO_VISEME_ROI;
          roiCtx.globalAlpha = 1.0;
          roiCtx.drawImage(mioBase1280Img, 0, 0, fullW, fullH);

          // 直前の音素口形をベースとして描画
          const sxPrev = prevKf.slot * w;
          roiCtx.drawImage(mioVisemeAtlasImg, sxPrev, 0, w, h, x, y, w, h);

          // 現在の音素口形を blendAlpha で滑らかに重ね描き
          if (currKf.slot !== prevKf.slot) {
            const sxCurr = currKf.slot * w;
            roiCtx.globalAlpha = blendAlpha;
            roiCtx.drawImage(mioVisemeAtlasImg, sxCurr, 0, w, h, x, y, w, h);
          }

          // 瞬き中は上半分（目元領域 y=0..235）に BLINK スロットをブレンド
          if (isBlinking) {
            const sxBlink = VISEME_SLOT.BLINK * w;
            const eyeH = 235;
            roiCtx.globalAlpha = 0.92;
            roiCtx.drawImage(mioVisemeAtlasImg, sxBlink, 0, w, eyeH, x, y, w, eyeH);
          }

          roiCtx.globalAlpha = 1.0;
          drawnBaseCharId = "face_f02_mio";
          return;
        }

        // ★ モードB: 50fps 音素アライメント済み MP4 ストリーム & アイドル映像再生
        if (activeFmvVideo && activeFmvVideo.readyState >= 2) {
          if (activeFmvType === "talk" && isSpeakingNow && cloudAudioCtx) {
            const audioElapsed = cloudAudioCtx.currentTime - talkAudioStartCtxTime;
            if (talkAudioDuration > 0 && audioElapsed >= talkAudioDuration - 0.015) {
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

          roiCtx.globalAlpha = 1.0;
          roiCtx.drawImage(activeFmvVideo, 0, 0, vw, vh);
          drawnBaseCharId = "face_f02_mio";

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

  // ===== 着せ替えクローゼット定義 =====
  function getWardrobeStylesList(mem) {
    const equipped = mem.equipped_style_key || "vline_beige_offshoulder";
    const activeChar = getActiveCharObj(mem);
    const defaultPortrait = activeChar ? activeChar.portrait_url : resolveAssetUrl("assets/portraits/face_f02_mio.jpg");
    const defs = [
      {
        style_key: "vline_beige_offshoulder",
        short_title: "ミルクティーベージュ×白オフショル",
        hair_tag: "ミルクティーベージュ",
        outfit_tag: "白オフショルニット",
        tier: "free",
        price_coins: 0,
        badge: "初期解放 ✨",
        ck: "a94645f74d2da77eb42be759696fbb0f",
        spoken: "あっ、ミルクティーベージュに白オフショルに着替えたよ！この明るい雰囲気、やっぱり好き？",
      },
      {
        style_key: "vline_dark_offshoulder",
        short_title: "ダークツヤ髪×大人黒オフショル",
        hair_tag: "ナチュラルダークヘア",
        outfit_tag: "黒オフショルダー",
        tier: "free",
        price_coins: 0,
        badge: "無料解放 ✨",
        ck: "973fd1f4166428994b3db8efa0eb1b8a",
        spoken: "黒のオフショルと落ち着いたダークヘアにしてみたよ。ちょっと大人っぽい感じ、どうかな？",
      },
      {
        style_key: "vline_dark_bangs_white",
        short_title: "シースルーバング×白モヘアニット",
        hair_tag: "小顔シースルーバング",
        outfit_tag: "ふわふわ白モヘア",
        tier: "free",
        price_coins: 0,
        badge: "無料解放 ✨",
        ck: "0a1a10ecc2522894989e99f1181064c1",
        spoken: "ふわふわの白モヘアニットに着替えてみたよ！ねえ、近くで見るともっと可愛いかな？",
      },
      {
        style_key: "vline_pinkbrown_loungewear",
        short_title: "ピンクブラウン巻き髪×ふわもこ部屋着",
        hair_tag: "ピンクブラウン巻き髪",
        outfit_tag: "ジェラピケ風部屋着",
        tier: "premium",
        price_coins: 300,
        badge: "お家デート 💗",
        ck: "28740f7c903ab0cf4316db1d38c20027",
        spoken: "えへへ、ピンクブラウンの巻き髪とふわもこ部屋着、解放してくれてありがとう！お家デートっぽくて可愛い？",
      },
      {
        style_key: "vline_ash_date_dress",
        short_title: "アッシュグレージュ×黒レースワンピ",
        hair_tag: "透明感アッシュグレージュ",
        outfit_tag: "黒レースデートワンピ",
        tier: "premium",
        price_coins: 400,
        badge: "特別デート 💎",
        ck: "3701beae441a0f4ae694f9b98d64b9c1",
        spoken: "わあ、アッシュグレージュの髪に黒レースのデートワンピだ！今から特別なデート行くみたいでドキドキするね。",
      },
      {
        style_key: "vline_halfup_boyfriend_shirt",
        short_title: "おフェロハーフアップ×彼シャツ",
        hair_tag: "ゆるふわハーフアップ",
        outfit_tag: "ぶかぶか白彼シャツ",
        tier: "premium",
        price_coins: 500,
        badge: "お泊まり限定 🔥",
        ck: "ec24c40f3ba0f42fd76cc91a5756d488",
        spoken: "……ねえ、ハーフアップにぶかぶかの白シャツ着てみたんだけど、どうかな？なんかちょっと照れちゃうね。",
      },
    ];
    return defs.map((d) => ({
      ...d,
      portrait_url: defaultPortrait,
      idle_video_url: "",
      unlocked: (mem.unlocked_styles || []).includes(d.style_key) || d.tier === "free",
      equipped: equipped === d.style_key,
    }));
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
      wardrobe_styles: getWardrobeStylesList(mem),
      time_scene: mem.time_scene,
      is_close_distance: Boolean(mem.is_close_distance),
      room_items: mem.room_items || [],
      memories_count: (mem.memories || []).length,
      latest_memories: (mem.memories || []).slice(-6),
      spoken: spoken || "",
      inner_thought: innerThought || "こうやって二人でゆっくり話してる時間が一番大好きだな。",
      emotion: emotion || "happy",
      choices: (choices && choices.length
        ? choices
        : ["今日あったこと聞いてよ", "なんか今日、いつもよりすごく可愛いね", "少し近くに来て？"]
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

    // 原音試聴エンドポイント (/api/companion/voices/raw_sample/{vid}) のリダイレクト
    if (rawUrl.includes("/api/companion/voices/raw_sample/")) {
      const m = rawUrl.match(/\/raw_sample\/([^?/#]+)/);
      const vid = (m && decodeURIComponent(m[1])) || "human_g0143";
      return origFetch(resolveAssetUrl(`assets/voice_bank/${vid}_raw_sample.mp3`), init);
    }

    await ensureCatalogAndManifest();
    const mem = loadCloudMemory();
    let bodyObj = {};
    if (init && typeof init.body === "string") {
      try {
        bodyObj = JSON.parse(init.body);
      } catch (_) {}
    } else if (init && typeof FormData !== "undefined" && init.body instanceof FormData) {
      for (const [k, v] of init.body.entries()) {
        if (typeof v === "string") {
          bodyObj[k] = v;
        }
      }
    }

    if (rawUrl.endsWith("/api/companion/state")) {
      const entry = selectRealVoiceEntry(mem.active_voice_id, "e1afb5eda5d197874133180aff8d38e4", "greeting_home", true);
      const spoken = entry ? entry.text : "あっ、おかえり！今日も無事に帰ってきてくれて、すごく嬉しいな。";
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
        recommended_by_gender: { female: "human_g0143", male: "human_g0144", other: "human_g0244" },
        voices,
      });
    }

    if (rawUrl.endsWith("/api/companion/wardrobe")) {
      return makeJsonResponse({
        coins: mem.coins ?? 2400,
        styles: getWardrobeStylesList(mem),
      });
    }

    if (rawUrl.includes("/api/companion/wardrobe/equip")) {
      const styleKey = bodyObj.style_key || "vline_beige_offshoulder";
      const allStyles = getWardrobeStylesList(mem);
      const targetStyle = allStyles.find((s) => s.style_key === styleKey) || allStyles[0];
      if (!mem.unlocked_styles.includes(styleKey)) {
        const price = Number(targetStyle.price_coins || 0);
        if ((mem.coins ?? 2400) >= price) {
          mem.coins = (mem.coins ?? 2400) - price;
        }
        mem.unlocked_styles.push(styleKey);
      }
      mem.equipped_style_key = styleKey;
      mem.affection = Math.min(100, (mem.affection || 68) + 4);
      saveCloudMemory(mem);

      const entry = selectRealVoiceEntry(mem.active_voice_id, targetStyle.ck, "compliment", false);
      const spoken = targetStyle.spoken || (entry ? entry.text : "着替えてみたよ！どうかな、似合ってる？");
      const emo = entry ? entry.emo : "happy";
      const choices = ["すごく似合ってて可愛いよ！", "少し近くに来て？", "今度のお休みにデートしよう"];
      const badge = `👗『${targetStyle.short_title}』に着替えました`;
      const st = buildCloudStatePayload(mem, spoken, "新しい服と髪型、気に入ってもらえたら嬉しいな！", emo, choices, badge);
      const activeChar = getActiveCharObj(mem);

      return makeNdjsonStreamResponse(
        [
          { type: "state", payload: st },
          { type: "done", total_chunks: 1, spoken, inner_thought: st.inner_thought, emotion: emo, choices },
        ],
        () => {
          if (entry) playRealVoiceWithSotaAvatar(entry, activeChar, "compliment");
        }
      );
    }

    if (rawUrl.includes("/api/companion/wardrobe/topup")) {
      mem.coins = (mem.coins || 1200) + 1000;
      saveCloudMemory(mem);
      return makeJsonResponse({
        coins: mem.coins,
        styles: getWardrobeStylesList(mem),
        message: "無料ボーナス +1,000💎 を補充しました！",
      });
    }

    if (rawUrl.includes("/api/companion/expression/tune")) {
      if (typeof bodyObj.charm_level === "number") {
        mem.charm_level = bodyObj.charm_level;
        saveCloudMemory(mem);
      }
      const st = buildCloudStatePayload(mem, "ふふ、嬉しいな。この表情のバランス、どうかな？", "", "happy");
      return makeJsonResponse({ ...st, message: "表情バランスを更新しました" });
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
      const prefCk =
        scKey === "greeting_morning"
          ? "606cb477f9a7eb3909fe3459477be5d3"
          : scKey === "greeting_night"
          ? "81504e58652a4e89ee1926300b06a95c"
          : scKey === "greeting_sulk"
          ? "a04d8e0dd828fd3fb8b6d3d7047b17d5"
          : "e1afb5eda5d197874133180aff8d38e4";
      const entry = selectRealVoiceEntry(mem.active_voice_id, prefCk, scKey, true);
      const spoken = entry ? entry.text : "あっ、おかえり！今日も無事に帰ってきてくれて、すごく嬉しいな。";
      const emo = entry ? entry.emo : "happy";
      const choices = [
        "今日あったこと聞いてよ",
        "なんか今日、いつもよりすごく可愛いね",
        "ごめん、冷蔵庫のプリン食べちゃった…",
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

    // ===== テキストチャット & マイク音声入力（talk_stream / talk_audio_stream / voice_input_stream） =====
    if (
      rawUrl.endsWith("/api/companion/talk_stream") ||
      rawUrl.endsWith("/api/companion/talk_audio_stream") ||
      rawUrl.endsWith("/api/companion/voice_input_stream")
    ) {
      const isAudioEndpoint = rawUrl.includes("audio") || rawUrl.includes("voice_input");
      const rawText = (bodyObj.text || bodyObj.fallback_text || "").trim();

      if (!rawText && isAudioEndpoint) {
        return makeNdjsonStreamResponse([
          {
            type: "no_speech",
            detail: "ごめんね、声がうまく聞き取れなかったかも。もう一度マイクの近くで話しかけるか、下の入力欄から送ってみてね！",
          },
        ]);
      }

      const userText = rawText || "今日あったこと聞いてよ";
      const resolved = await generateRealAiDialogueTurn(userText, mem);
      const entry = selectRealVoiceEntry(mem.active_voice_id, resolved.ck, resolved.intent, false);

      const spoken = resolved.spoken || (entry ? entry.text : "うんうん、わかるよ！");
      const emo = resolved.emo || (entry ? entry.emo : "happy");
      const thought = resolved.thought || "こうやって二人でゆっくり話してる時間が一番大好きだな。";
      const nextChoices = resolved.choices || [
        "今日あったこと聞いてよ",
        "美桜はどんな食べ物が好き？",
        "少し近くに来て？",
      ];

      mem.chat_history = [
        ...(mem.chat_history || []),
        { role: "user", text: userText },
        { role: "partner", text: spoken },
      ].slice(-20);
      saveCloudMemory(mem);

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
            user_name: mem.user_name,
            memories_count: (mem.memories || []).length,
            latest_memories: (mem.memories || []).slice(-6),
            choices: nextChoices,
          },
        ],
        () => {
          if (resolved.isAiGenerated && !resolved.isExactPreRecorded) {
            playAiVisemeSpeechWithReaction(resolved, activeChar, entry);
          } else if (entry) {
            playRealVoiceWithSotaAvatar(entry, activeChar, resolved.intent);
          }
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
      if (typeof bodyObj.user_name === "string" && bodyObj.user_name.trim()) {
        mem.user_name = bodyObj.user_name.trim();
      }
      saveCloudMemory(mem);

      const entry = selectRealVoiceEntry(mem.active_voice_id, "954389470c4ccd6afc49bd5c3b3e399d", "greeting_home", true);
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
      let prefCk = "";
      let badge = "";
      let thought = "優しくされるとドキドキしちゃうな。";
      let choices = ["喜んでくれて嬉しいよ", "もっと近くにおいでよ", "今日あったこと聞いてよ"];

      if (act === "pat_head") {
        intent = "pat_head";
        prefCk = Math.random() < 0.5 ? "2d845745841dd5846bc4e45ea61ce1f4" : "d0b61000577e04b3e125f5e773eac7d5";
        badge = "頭をなでた";
        thought = "頭なでなでされるの大好き……なんだか安心するな。";
        mem.affection = Math.min(100, mem.affection + 4);
        choices = ["そうやって笑う顔、ほんと好きだな", "もっと近くにおいでよ", "今日あったこと聞いてよ"];
      } else if (act === "poke_cheek") {
        intent = "poke_cheek";
        prefCk = "9e48b887c9dcb66f9c98663eb72378ef";
        badge = "ほっぺに軽く触れた";
        thought = "もう、急にほっぺつつくなんてイタズラっ子なんだから！";
        mem.affection = Math.min(100, mem.affection + 3);
        choices = ["怒った顔もすごく可愛いね", "少し近くに来て？", "今日あったこと聞いてよ"];
      } else if (act === "toggle_distance") {
        mem.is_close_distance = !mem.is_close_distance;
        intent = "close_dist";
        prefCk = mem.is_close_distance
          ? (Math.random() < 0.5 ? "067ffbd98b564724e505b4adab0c412e" : "07362ac6769f38e2c83d41e905552aca")
          : "dc5caef807a7c482e48705bd74aec0bc";
        badge = mem.is_close_distance ? "距離を近づけた" : "いつもの距離に戻った";
        thought = mem.is_close_distance
          ? "こんなに顔が近いと、心臓の音まで聞こえちゃいそう……！"
          : "少し離れても、ちゃんと目を見て話せるのが嬉しいな。";
        choices = ["近くで見るとほんとに可愛いね", "美桜のことが大好きだよ", "今日あったこと聞いてよ"];
      } else if (act === "gift") {
        intent = `gift_${val}`;
        const emojiMap = { cake: "🍰", latte: "☕", bear: "🧸", flower: "💐" };
        const nameMap = { cake: "ショートケーキ", latte: "カフェラテ", bear: "クマちゃん", flower: "ミニブーケ" };
        const ckMap = {
          cake: "30b03ef1a81a8078a0cff0ae04960c6d",
          latte: "330c6c712a7d446ac3887d4fbfb48609",
          bear: "4279f3f422f62ae5fc65810d1ac97f13",
          flower: "594f387dfb16f45dde2bba825c94eff8",
        };
        prefCk = ckMap[val] || "2de7e43f86a04f344a8d224297f44c85";
        badge = `『${nameMap[val] || "プレゼント"}』を差し入れした`;
        thought = `わたしのために『${nameMap[val] || "プレゼント"}』を用意してくれたなんて、嬉しすぎるよ！`;
        mem.room_items = [
          ...(mem.room_items || []),
          { id: val, name: nameMap[val] || val, emoji: emojiMap[val] || "🎁" },
        ].slice(-8);
        mem.affection = Math.min(100, mem.affection + 6);
        mem.mood = Math.min(50, Math.max(24, mem.mood + 18));
        choices = ["喜んでくれて嬉しいよ", "美桜のことが大好きだよ", "少し近くに来て？"];
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
        prefCk =
          val === "morning"
            ? "606cb477f9a7eb3909fe3459477be5d3"
            : val === "late_night"
            ? "81504e58652a4e89ee1926300b06a95c"
            : val === "neglected_3days"
            ? "a04d8e0dd828fd3fb8b6d3d7047b17d5"
            : "e1afb5eda5d197874133180aff8d38e4";
        badge = "シチュエーションを切り替えました";
        choices =
          val === "neglected_3days"
            ? [
                "ごめんごめん！お詫びに美味しいケーキ買ってくるから許して？",
                "怒った顔もすごく可愛いね",
                "少し近くに来て？",
              ]
            : val === "late_night"
            ? ["そろそろ一緒に寝ようか", "少し近くに来て？", "いつもそばにいてくれてありがとう"]
            : ["今日あったこと聞いてよ", "なんか今日、いつもよりすごく可愛いね", "少し近くに来て？"];
      } else if (act === "reset_memory") {
        mem.memories = [];
        mem.room_items = [];
        mem.affection = 68;
        mem.mood = 24;
        intent = "greeting_home";
        prefCk = "1a9d95bef35b2ce8d528482e0b700214";
        badge = "記憶を初期状態にリセットしました";
      }
      saveCloudMemory(mem);

      const entry = selectRealVoiceEntry(mem.active_voice_id, prefCk, intent, act === "set_scene" || act === "reset_memory");
      const spoken = entry ? entry.text : "えへへ、ありがとう！すごく嬉しいな。";
      const emo = entry ? entry.emo : "happy";
      const st = buildCloudStatePayload(mem, spoken, thought, emo, choices, badge);
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

    return makeJsonResponse(buildCloudStatePayload(mem, "うん、なんでも遠慮しないで話してみてね！", "", "happy"));
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
