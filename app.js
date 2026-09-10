/* =========================================================================
   SaxChord — サックスのためのコード＆運指クイズ
   - コード構成音を「記譜（吹く音）」と「実音」の両方で扱う
   - 答えは必ずサックスの運指図つきで提示する
   - マイクで実際に吹いた音を判定する
   ========================================================================= */
(() => {
"use strict";

/* ===================== 1. 音名とコードの理論 ===================== */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 度数 → 半音数 / 音度（音名を何文字ずらすか）
const DEG_SEMI = {
  "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5, "#4": 6,
  "b5": 6, "5": 7, "#5": 8, "b6": 8, "6": 9, "bb7": 9, "b7": 10, "7": 11,
  "b9": 13, "9": 14, "#9": 15, "11": 17, "#11": 18, "b13": 20, "13": 21
};
const DEG_LETTER = {
  "1": 0, "b2": 1, "2": 1, "#2": 1, "b3": 2, "3": 2, "4": 3, "#4": 3,
  "b5": 4, "5": 4, "#5": 4, "b6": 5, "6": 5, "bb7": 6, "b7": 6, "7": 6,
  "b9": 1, "9": 1, "#9": 1, "11": 3, "#11": 3, "b13": 5, "13": 5
};

// 内部表記 "C#" "Bb" "Bbb" → 表示用 "C♯" "B♭" "B𝄫"
function pretty(name) {
  return name.replace(/bb/g, "\u{1D12B}").replace(/b/g, "♭").replace(/##/g, "\u{1D12A}").replace(/#/g, "♯");
}
// ドイツ音名（吹奏楽・ジャズの現場で使われる読み）
const GERMAN = {
  C: "ツェー", "C#": "ツィス", Db: "デス", D: "デー", "D#": "ディス", Eb: "エス",
  E: "エー", Fb: "フェス", "E#": "エイス", F: "エフ", "F#": "フィス", Gb: "ゲス",
  G: "ゲー", "G#": "ギス", Ab: "アス", A: "アー", "A#": "アイス", Bb: "ベー",
  B: "ハー", Cb: "ツェス", "B#": "ヒス"
};
function germanOf(name) {
  if (GERMAN[name]) return GERMAN[name];
  return GERMAN[simplify(name)] || "";
}

// 音名 → ピッチクラス(0-11)
function nameToPc(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name);
  if (!m) return null;
  let pc = LETTER_SEMI[m[1]];
  const acc = m[2] || "";
  if (acc[0] === "#") pc += acc.length;
  if (acc[0] === "b") pc -= acc.length;
  return ((pc % 12) + 12) % 12;
}
// 綴りを作る：letterIndex(0-6) と pitchClass から "Eb" などを返す
function spell(letterIdx, pc) {
  const letter = LETTERS[((letterIdx % 7) + 7) % 7];
  let alter = (((pc - LETTER_SEMI[letter]) % 12) + 12) % 12;
  if (alter > 6) alter -= 12;              // -5..6 → 実際は -2..2 に収まる
  const acc = alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(-alter) : "";
  return letter + acc;
}
// 重変化を避けた読みやすい表記（Bbb → A）
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
function simplify(name) {
  const pc = nameToPc(name);
  if (pc === null) return name;
  return /b/.test(name) ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}
function isMessy(name) { return /bb|##/.test(name); }

// 音名の移調（綴りを保ったまま）: semi 半音、step 音度
function transposeName(name, semi, step) {
  const m = /^([A-G])/.exec(name);
  const li = LETTERS.indexOf(m[1]);
  const pc = (nameToPc(name) + semi) % 12;
  return spell(li + step, ((pc % 12) + 12) % 12);
}

/* ---------- コード定義 ---------- */
const CHORD_TYPES = [
  // level 1: まずこれだけで大半のスタンダードは吹ける
  { id: "maj", suffix: "", jp: "メジャー", degs: ["1", "3", "5"], level: 1 },
  { id: "min", suffix: "m", jp: "マイナー", degs: ["1", "b3", "5"], level: 1 },
  { id: "dom7", suffix: "7", jp: "セブンス", degs: ["1", "3", "5", "b7"], level: 1 },
  { id: "maj7", suffix: "maj7", jp: "メジャーセブンス", degs: ["1", "3", "5", "7"], level: 1 },
  { id: "min7", suffix: "m7", jp: "マイナーセブンス", degs: ["1", "b3", "5", "b7"], level: 1 },
  // level 2: ここまでで II-V-I とブルースが回る
  { id: "m7b5", suffix: "m7(♭5)", jp: "ハーフディミニッシュ", degs: ["1", "b3", "b5", "b7"], level: 2 },
  { id: "dim7", suffix: "dim7", jp: "ディミニッシュセブンス", degs: ["1", "b3", "b5", "bb7"], level: 2 },
  { id: "six", suffix: "6", jp: "シックス", degs: ["1", "3", "5", "6"], level: 2 },
  { id: "min6", suffix: "m6", jp: "マイナーシックス", degs: ["1", "b3", "5", "6"], level: 2 },
  { id: "sus4", suffix: "sus4", jp: "サスフォー", degs: ["1", "4", "5"], level: 2 },
  { id: "7sus4", suffix: "7sus4", jp: "セブンス・サスフォー", degs: ["1", "4", "5", "b7"], level: 2 },
  { id: "aug", suffix: "aug", jp: "オーギュメント", degs: ["1", "3", "#5"], level: 2 },
  { id: "7s5", suffix: "7(♯5)", jp: "オルタード系セブンス", degs: ["1", "3", "#5", "b7"], level: 2 },
  { id: "mMaj7", suffix: "mMaj7", jp: "マイナーメジャーセブンス", degs: ["1", "b3", "5", "7"], level: 2 },
  // level 3: テンション
  { id: "nine", suffix: "9", jp: "ナインス", degs: ["1", "3", "5", "b7", "9"], level: 3 },
  { id: "m9", suffix: "m9", jp: "マイナーナインス", degs: ["1", "b3", "5", "b7", "9"], level: 3 },
  { id: "maj9", suffix: "maj9", jp: "メジャーナインス", degs: ["1", "3", "5", "7", "9"], level: 3 },
  { id: "7b9", suffix: "7(♭9)", jp: "セブンス・フラットナインス", degs: ["1", "3", "5", "b7", "b9"], level: 3 },
  { id: "7s9", suffix: "7(♯9)", jp: "セブンス・シャープナインス", degs: ["1", "3", "5", "b7", "#9"], level: 3 },
  { id: "7s11", suffix: "7(♯11)", jp: "リディアン7th", degs: ["1", "3", "5", "b7", "#11"], level: 3 },
  { id: "7_13", suffix: "7(13)", jp: "セブンス・サーティーンス", degs: ["1", "3", "5", "b7", "13"], level: 3 },
  { id: "7b13", suffix: "7(♭13)", jp: "セブンス・フラットサーティーンス", degs: ["1", "3", "5", "b7", "b13"], level: 3 },
  { id: "add9", suffix: "add9", jp: "アドナインス", degs: ["1", "3", "5", "9"], level: 3 },
  { id: "six9", suffix: "6(9)", jp: "シックスナインス", degs: ["1", "3", "5", "6", "9"], level: 3 }
];
const TYPE_BY_ID = Object.fromEntries(CHORD_TYPES.map((t) => [t.id, t]));

const ROOTS_MAIN = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROOTS_EXTRA = ["C#", "Gb"];

// コードを組み立てる。root は綴り付きの音名、type は CHORD_TYPES の要素
function buildChord(root, type) {
  const rootLetter = LETTERS.indexOf(root[0]);
  const rootPc = nameToPc(root);
  const tones = type.degs.map((d) => {
    const pc = (rootPc + DEG_SEMI[d]) % 12;
    return { deg: d, name: spell(rootLetter + DEG_LETTER[d], pc), pc };
  });
  return { root, type, tones, label: root + type.suffix };
}

/* ---------- 楽器と移調 ---------- */
// written(記譜) = concert(実音) + semi
const INSTRUMENTS = {
  alto: { id: "alto", jp: "アルト (E♭)", semi: 9, step: 5, octSemi: 9, lowest: 58, highest: 89 },
  tenor: { id: "tenor", jp: "テナー (B♭)", semi: 2, step: 1, octSemi: 14, lowest: 58, highest: 89 },
  soprano: { id: "soprano", jp: "ソプラノ (B♭)", semi: 2, step: 1, octSemi: 2, lowest: 58, highest: 89 },
  bari: { id: "bari", jp: "バリトン (E♭)", semi: 9, step: 5, octSemi: 21, lowest: 56, highest: 89 }
};
// 「移調なし」は楽器としては置かない。
// テナーを吹く人が C譜 を読みたくて選ぶと、実音そのままの運指が出て
// 実際には 1 音低く鳴ってしまうため。C譜 を読みたいときは楽器はそのままで
// 「譜面」を C譜 にする。

/* ===================== 2. 運指データ ===================== */
/* キーID:
   oct(オクターブキー) / palmF palmEb palmD frontF / L1 bis L2 L3 / gs csL bL bbL
   R1 fs R2 R3 / sideE sideC sideBb highFs / ebR cR                       */

// 記譜音 B♭3(58) 〜 C♯5(73) の基本運指
const BASE_FINGERING = {
  58: ["L1", "L2", "L3", "R1", "R2", "R3", "bbL"],          // low B♭
  59: ["L1", "L2", "L3", "R1", "R2", "R3", "bL"],           // low B
  60: ["L1", "L2", "L3", "R1", "R2", "R3", "cR"],           // low C
  61: ["L1", "L2", "L3", "R1", "R2", "R3", "csL"],          // low C♯
  62: ["L1", "L2", "L3", "R1", "R2", "R3"],                 // D
  63: ["L1", "L2", "L3", "R1", "R2", "R3", "ebR"],          // E♭
  64: ["L1", "L2", "L3", "R1", "R2"],                       // E
  65: ["L1", "L2", "L3", "R1"],                             // F
  66: ["L1", "L2", "L3", "R2"],                             // F♯
  67: ["L1", "L2", "L3"],                                   // G
  68: ["L1", "L2", "L3", "gs"],                             // G♯
  69: ["L1", "L2"],                                         // A
  70: ["L1", "bis"],                                        // B♭ (バイス)
  71: ["L1"],                                               // B
  72: ["L2"],                                               // C
  73: []                                                    // C♯（オールオープン）
};
// 代替運指（ヒントとして表示）
const ALT_FINGERING = {
  66: { keys: ["L1", "L2", "L3", "fs"], note: "右手薬指のF♯キー（F→F♯の連結に）" },
  70: { keys: ["L1", "R1"], note: "1と1（1&1）。B♭→A の動きで使う" },
  72: { keys: ["L1", "sideC"], note: "サイドCキー。B→C の連結に" }
};
const ALT_FINGERING_HI = {
  90: { keys: ["oct", "frontF", "L2", "L3", "fs"], note: "フロントF系のF♯" }
};

function fingeringFor(midi) {
  if (midi >= 58 && midi <= 73) return BASE_FINGERING[midi].slice();
  if (midi >= 74 && midi <= 85) return ["oct"].concat(BASE_FINGERING[midi - 12]);
  if (midi === 86) return ["oct", "palmD"];                                   // 高音D
  if (midi === 87) return ["oct", "palmD", "palmEb"];                         // 高音E♭
  if (midi === 88) return ["oct", "palmD", "palmEb", "sideE"];                // 高音E
  if (midi === 89) return ["oct", "palmD", "palmEb", "palmF"];                // 高音F
  if (midi === 90) return ["oct", "palmD", "palmEb", "palmF", "highFs"];      // 高音F♯
  return null;
}
function altFingeringFor(midi) {
  if (ALT_FINGERING[midi]) return ALT_FINGERING[midi];
  if (midi >= 74 && midi <= 85 && ALT_FINGERING[midi - 12]) {
    const a = ALT_FINGERING[midi - 12];
    return { keys: ["oct"].concat(a.keys), note: a.note };
  }
  if (ALT_FINGERING_HI[midi]) return ALT_FINGERING_HI[midi];
  if (midi === 89) return { keys: ["oct", "frontF", "L2", "L3"], note: "フロントF。速いパッセージで多用" };
  return null;
}

/* 運指図のレイアウト。
   実物のキーの形と位置に寄せる（大きな丸＝真珠の付いた主要キー、
   細長い葉＝オクターブキー、小判形＝パームキー、板＝サイド／小指のキー）。
   どこがどのキーか、形と位置で分かるようにするのが狙い。 */
/* 運指図は saxfinger.png（138x326）そのものを使う。
   背景を抜いたマスク（saxfinger-mask.png）をテーマ色で塗って輪郭を出し、
   その下に、押さえるキーだけ色を敷く。座標は原画から実測した位置。 */
const IMG_W = 138, IMG_H = 326;

// 原画にあるキーと、その位置
const IMG_KEYS = {
  frontF: { type: "circle", cx: 72.5, cy: 30.5, r: 5.2 },
  L1: { type: "circle", cx: 72.5, cy: 54.5, r: 14 },
  L2: { type: "circle", cx: 72.5, cy: 91.5, r: 14 },
  L3: { type: "circle", cx: 72.5, cy: 128.5, r: 14 },
  R1: { type: "circle", cx: 72.5, cy: 174.5, r: 14 },
  R2: { type: "circle", cx: 72.5, cy: 211.5, r: 14 },
  R3: { type: "circle", cx: 72.5, cy: 248.5, r: 14 },
  bis: { type: "circle", cx: 87.5, cy: 73, r: 5.2 },
  oct: { type: "ellipse", cx: 36, cy: 78.5, rx: 4.6, ry: 14.2 },
  palmF: { type: "ellipse", cx: 101, cy: 43, rx: 3.7, ry: 9.6 },
  palmEb: { type: "ellipse", cx: 110.5, cy: 55, rx: 4.2, ry: 9.6 },
  palmD: { type: "ellipse", cx: 101, cy: 66, rx: 3.7, ry: 9.6 },
  // 原画ではサイドキーが 1 つの塊なので、どれを押しても同じ場所が光る
  sideE: { type: "rect", x: 98.5, y: 126.5, w: 26, h: 40, r: 4 },
  sideC: { type: "rect", x: 98.5, y: 126.5, w: 26, h: 40, r: 4 },
  sideBb: { type: "rect", x: 98.5, y: 126.5, w: 26, h: 40, r: 4 },
  highFs: { type: "rect", x: 98.5, y: 126.5, w: 26, h: 40, r: 4 }
};
// 原画に描かれていないキー。図の下に文字で補う
const KEY_NAMES_JP = {
  gs: "G♯（左小指）", csL: "低C♯（左小指）", bL: "低B（左小指）", bbL: "低B♭（左小指）",
  ebR: "低E♭（右小指）", cR: "低C（右小指）", fs: "F♯キー（右薬指）",
  sideE: "側面E", sideC: "側面C", sideBb: "側面B♭", highFs: "ハイF♯"
};
const IMG_MISSING = ["gs", "csL", "bL", "bbL", "ebR", "cR", "fs"];

function fingeringSVG(midi, opts) {
  const o = opts || {};
  const keys = o.keys || fingeringFor(midi) || [];
  let hi = "";
  const drawn = new Set();
  for (const id of keys) {
    const k = IMG_KEYS[id];
    if (!k) continue;
    const sig = JSON.stringify(k);
    if (drawn.has(sig)) continue;             // サイドキーの塊を二重に塗らない
    drawn.add(sig);
    if (k.type === "circle") hi += `<circle class="fk-on" cx="${k.cx}" cy="${k.cy}" r="${k.r}"/>`;
    else if (k.type === "ellipse") hi += `<ellipse class="fk-on" cx="${k.cx}" cy="${k.cy}" rx="${k.rx}" ry="${k.ry}"/>`;
    else hi += `<rect class="fk-on" x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="${k.r}"/>`;
  }
  // 原画に無いキーと、塊で表せないサイドキーの内訳を文字で出す
  const notes = keys.filter((id) => IMG_MISSING.includes(id) || (KEY_NAMES_JP[id] && IMG_KEYS[id]))
    .map((id) => KEY_NAMES_JP[id]).filter(Boolean);
  const note = notes.length ? `<div class="fk-note">＋ ${notes.map(esc).join("・")}</div>` : "";
  return `<div class="fk">
      <svg class="fk-hi" viewBox="0 0 ${IMG_W} ${IMG_H}" aria-hidden="true">${hi}</svg>
      <div class="fk-base" role="img" aria-label="運指図"></div>
    </div>${note}`;
}

/* ===================== 3. 設定と保存 ===================== */

const STORE_KEY = "saxchord.v1";
const DEFAULT_SETTINGS = {
  instrument: "alto",
  // "written": 譜面が移調済み（書かれたコードをそのまま吹く）
  // "concert": 実音（ピアノ譜）で出題され、自分で移調して答える
  chartPitch: "written",
  types: ["maj", "min", "dom7", "maj7", "min7"],
  roots: ROOTS_MAIN.slice(),
  german: false,
  a4: 442,
  autoAdvance: true,
  sound: true,
  // マイク感度。micGate は音量のしきい値（RMS）、micClarity は「音程が取れている」
  // と見なす自己相関の下限。どちらも小さいほど敏感。
  micGate: 0.006,
  micClarity: 0.55,
  palette: "brass",
  playHide: false          // 吹いて答える：音名と運指を隠す
};

const PALETTES = [
  { id: "brass", jp: "真鍮", sw: ["#F6F4EF", "#9A6B12", "#1D1B16"] },
  { id: "midnight", jp: "藍", sw: ["#F2F4F8", "#2B4C8C", "#161C28"] },
  { id: "vermilion", jp: "朱", sw: ["#F7F5F2", "#C4432B", "#1A1815"] },
  { id: "graphite", jp: "黒板", sw: ["#F4F5F4", "#3E7C3A", "#15181A"] }
];
function applyPalette() {
  if (S.palette && S.palette !== "brass") document.documentElement.setAttribute("data-palette", S.palette);
  else document.documentElement.removeAttribute("data-palette");
}

// 感度プリセット（1=鈍い 〜 7=最高感度）。
// 6・7 は離れたマイクや小音量用。雑音でも反応しやすくなる代わりに、
// ごく小さい音でも拾う。NSDF は振幅に依存しないので、しきい値さえ下げれば
// 小さい音でも音程は取れる。
const SENS_PRESETS = [
  { gate: 0.030, clarity: 0.78 },
  { gate: 0.014, clarity: 0.66 },
  { gate: 0.006, clarity: 0.55 },
  { gate: 0.0026, clarity: 0.46 },
  { gate: 0.0011, clarity: 0.38 },
  { gate: 0.00040, clarity: 0.32 },
  { gate: 0.00014, clarity: 0.26 }
];
function sensLevel() {
  // いまの設定がどのプリセットに一番近いか（自動調整後は中間値になりうる）
  let best = 0, diff = Infinity;
  SENS_PRESETS.forEach((p, i) => {
    const d = Math.abs(Math.log(p.gate) - Math.log(S.micGate));
    if (d < diff) { diff = d; best = i; }
  });
  return best + 1;
}

let S = loadSettings();
let STATS = loadStats();

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
  } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return Object.assign({ byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }, raw.stats || {});
  } catch (e) { return { byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ settings: S, stats: STATS })); } catch (e) {}
}
function inst() { return INSTRUMENTS[S.instrument] || INSTRUMENTS.alto; }

function recordAnswer(typeId, root, ok) {
  const t = STATS.byType[typeId] || (STATS.byType[typeId] = { n: 0, ok: 0 });
  const r = STATS.byRoot[root] || (STATS.byRoot[root] = { n: 0, ok: 0 });
  t.n++; r.n++; STATS.total++;
  if (ok) { t.ok++; r.ok++; STATS.correct++; }
  save();
}
// 苦手なものを出やすくする重み
function weightOf(map, key) {
  const s = map[key];
  if (!s || s.n < 3) return 2.2;            // まだ聞いていないものを優先
  const acc = s.ok / s.n;
  return 0.5 + (1 - acc) * 3.5;
}
function weightedPick(arr, weigh) {
  const w = arr.map(weigh);
  let sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ===================== 4. 音高ユーティリティ ===================== */

// サックスの現場で普通に使う呼び方（C♯・F♯ は♯、E♭・A♭・B♭ は♭）
const PREF_FLAT_PC = new Set([3, 8, 10]);
function commonName(pc) {
  pc = ((pc % 12) + 12) % 12;
  return PREF_FLAT_PC.has(pc) ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}
function commonLabel(midi) { return commonName(midi) + (Math.floor(midi / 12) - 1); }

function midiToName(midi, preferFlat) {
  const names = preferFlat ? FLAT_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
function midiToFreq(midi) { return S.a4 * Math.pow(2, (midi - 69) / 12); }
function freqToMidi(f) { return 69 + 12 * Math.log2(f / S.a4); }

// 記譜音のピッチクラスから、演奏しやすい音域の midi を選ぶ
function writtenMidiFor(pc, from) {
  const lo = from || 60;
  let m = lo + (((pc - lo) % 12) + 12) % 12;
  if (m > 85) m -= 12;
  if (m < 58) m += 12;
  return m;
}
// コードを下から積んだ記譜 midi 列にする。
// 13th などは 2 オクターブ近く開くので、和音全体が運指表の範囲（低B♭58〜ハイF♯90）に
// 収まる位置にルートを置く。
function voiceChord(tones) {
  const rel = [0];
  for (let i = 1; i < tones.length; i++) {
    let step = ((((tones[i].pc - tones[i - 1].pc) % 12) + 12) % 12);
    if (step === 0) step = 12;
    rel.push(rel[i - 1] + step);
  }
  const span = rel[rel.length - 1];
  const rootPc = (((tones[0].pc % 12) + 12) % 12);
  let root = 60 + (((rootPc - 60) % 12) + 12) % 12;   // 中音域 D4 あたりから始める
  if (root + span > 90) root -= 12;                    // はみ出すならオクターブ下げる
  return rel.map((r) => root + r);
}

// 記譜 midi → 実音 midi
function concertMidi(writtenMidi) { return writtenMidi - inst().octSemi; }

/* ===================== 5. 音を鳴らす ===================== */

let AC = null;
function audioCtx() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
  return AC;
}
/* サックスの音を作る。
   ・倍音の並びを実測値に近づけた波形（2〜4 倍音が強く、以降なだらかに減る）
   ・800Hz 付近と 1.8kHz 付近のフォルマント（あの鼻にかかった芯）
   ・吹き始めに倍音が開く（ローパスを立ち上げる）
   ・少し遅れてかかるビブラート
   ・アタックの息の音 */
let SAX_WAVE = null, SAX_WAVE_CTX = null;
function saxWave(ac) {
  if (SAX_WAVE && SAX_WAVE_CTX === ac) return SAX_WAVE;
  const amps = [0, 1, 0.92, 0.78, 0.52, 0.44, 0.31, 0.24, 0.18, 0.13, 0.1, 0.076, 0.056, 0.042, 0.031, 0.023, 0.017];
  const real = new Float32Array(amps.length), imag = new Float32Array(amps.length);
  for (let i = 1; i < amps.length; i++) imag[i] = amps[i];
  SAX_WAVE = ac.createPeriodicWave(real, imag);
  SAX_WAVE_CTX = ac;
  return SAX_WAVE;
}

function saxNote(freq, at, dur, gain, ctx) {
  const ac = ctx || audioCtx();
  const t0 = ac.currentTime + at, t1 = t0 + dur;
  const out = ac.destination;

  const osc = ac.createOscillator();
  osc.setPeriodicWave(saxWave(ac));
  osc.frequency.setValueAtTime(freq, t0);

  // ビブラート：吹き始めからじわっとかかる
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(5.2, t0);
  const lfoAmt = ac.createGain();
  lfoAmt.gain.setValueAtTime(0, t0);
  lfoAmt.gain.linearRampToValueAtTime(freq * 0.007, t0 + Math.min(0.4, dur * 0.7));
  lfo.connect(lfoAmt); lfoAmt.connect(osc.frequency);

  // 包絡は音の長さに合わせて縮める。短い音まで同じ立ち上がり・減衰にすると
  // 「たたたん」が繋がって 1 つの音に聞こえてしまう。
  const atk = Math.min(0.04, dur * 0.25);
  const dip = Math.min(0.16, Math.max(atk + 0.01, dur * 0.5));
  const rel = Math.min(0.09, Math.max(0.022, dur * 0.16));

  // 息が入ると倍音が開く
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass"; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(Math.max(300, Math.min(1400, freq * 2.2)), t0);
  lp.frequency.linearRampToValueAtTime(Math.min(7500, freq * 7.5), t0 + Math.min(0.08, dur * 0.45));
  lp.frequency.setTargetAtTime(Math.min(4500, freq * 4.5), t0 + Math.min(0.2, dur * 0.7), 0.25);

  // フォルマント
  const f1 = ac.createBiquadFilter();
  f1.type = "peaking"; f1.frequency.value = 860; f1.Q.value = 1.1; f1.gain.value = 7.5;
  const f2 = ac.createBiquadFilter();
  f2.type = "peaking"; f2.frequency.value = 1850; f2.Q.value = 1.5; f2.gain.value = 4.5;
  const f3 = ac.createBiquadFilter();
  f3.type = "highshelf"; f3.frequency.value = 5200; f3.gain.value = -8;   // 耳に痛い上を落とす

  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + atk);
  amp.gain.exponentialRampToValueAtTime(gain * 0.82, t0 + dip);
  amp.gain.setTargetAtTime(0.0001, t1, rel);

  osc.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(amp); amp.connect(out);
  osc.start(t0); osc.stop(t1 + rel * 6);
  lfo.start(t0); lfo.stop(t1 + rel * 6);

  // アタックの息の音
  const n = Math.max(1, Math.floor(ac.sampleRate * Math.min(0.07, dur * 0.35)));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const noise = ac.createBufferSource(); noise.buffer = buf;
  const nbp = ac.createBiquadFilter();
  nbp.type = "bandpass"; nbp.frequency.value = Math.min(3600, Math.max(700, freq * 4)); nbp.Q.value = 0.7;
  const ng = ac.createGain(); ng.gain.value = gain * 0.35;
  noise.connect(nbp); nbp.connect(ng); ng.connect(out);
  noise.start(t0);
}

// 正解などの合図に使う短い電子音
function blip(freq, at, dur, gain) {
  const ac = audioCtx();
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.setTargetAtTime(0.0001, t0 + dur * 0.5, 0.05);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.3);
}

// 全部吹けたあとに、コードトーンを「たたたん」で通して聴かせる
function playLick(midis) {
  if (!S.sound || !midis.length) return;
  const gap = 0.19;
  midis.forEach((m, i) => {
    const last = i === midis.length - 1;
    saxNote(midiToFreq(concertMidi(m)), i * gap, last ? 0.8 : 0.13, last ? 0.2 : 0.18);
  });
}

function playWrittenMidis(midis, opts) {
  if (!S.sound) return;
  const o = opts || {};
  const gap = o.gap == null ? 0.42 : o.gap;
  const dur = o.dur == null ? 0.5 : o.dur;
  midis.forEach((m, i) => saxNote(midiToFreq(concertMidi(m)), i * gap, dur, 0.17));
  if (o.chord) midis.forEach((m) => saxNote(midiToFreq(concertMidi(m)), midis.length * gap + 0.15, 1.2, 0.1));
}

/* ===================== 6. マイクでの音程検出 ===================== */

const Mic = {
  ctx: null, stream: null, analyser: null, buf: null, running: false,
  rms: 0, freq: 0, midi: 0, cents: 0, conf: 0, onFrame: null, raf: 0, err: "",

  async start() {
    if (this.running) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      this.err = e && e.name === "NotAllowedError"
        ? "マイクの使用が許可されませんでした。ブラウザの設定で許可してください。"
        : "マイクを開けませんでした（" + (e && e.name) + "）";
      return false;
    }
    const ac = audioCtx();
    this.ctx = ac;
    const src = ac.createMediaStreamSource(this.stream);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 60;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(hp); hp.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.err = "";
    this.loop();
    return true;
  },
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.analyser = null;
  },
  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.analyser) return;
    this.tick = (this.tick || 0) + 1;
    if (this.tick % 2) return;                     // 解析は 30fps 程度で十分
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = detectPitch(this.buf, this.ctx.sampleRate);
    this.rms = r.rms;
    if (r.freq > 0) {
      this.freq = r.freq; this.conf = r.clarity;
      const m = freqToMidi(r.freq);
      this.midi = Math.round(m);
      this.cents = Math.round((m - this.midi) * 100);
    } else {
      this.conf = 0;
    }
    if (this.onFrame) this.onFrame(r);
  }
};

/* NSDF（McLeod 法の簡易版）による基本周波数推定。
   サックスは倍音が強くオクターブ誤検出しやすいので、自己相関のピークを
   「最大値の 0.85 倍を超える最初のピーク」で選ぶ。 */
function detectPitch(buf, sampleRate, opts) {
  const gate = opts && opts.gate != null ? opts.gate : S.micGate;
  const peakMin = opts && opts.peakMin != null ? opts.peakMin : Math.min(0.3, S.micClarity * 0.55);
  const W = 2048;
  let rms = 0;
  for (let i = 0; i < W; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / W);
  if (rms < gate) return { freq: 0, clarity: 0, rms, gated: true };

  const minLag = Math.max(2, Math.floor(sampleRate / 1400));
  const maxLag = Math.min(W - 8, Math.floor(sampleRate / 55));
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0, m = 0;
    const n = W - lag;
    for (let i = 0; i < n; i++) {
      const a = buf[i], b = buf[i + lag];
      acf += a * b; m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
  }
  // 極大値を拾う
  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > peakMin) peaks.push(lag);
  }
  if (!peaks.length) return { freq: 0, clarity: 0, rms };
  let best = peaks[0];
  for (const p of peaks) if (nsdf[p] > nsdf[best]) best = p;
  const thresh = nsdf[best] * 0.85;
  let chosen = best;
  for (const p of peaks) { if (nsdf[p] >= thresh) { chosen = p; break; } }
  // 放物線補間で lag をサブサンプル精度に
  const y1 = nsdf[chosen - 1], y2 = nsdf[chosen], y3 = nsdf[chosen + 1];
  const denom = 2 * (2 * y2 - y1 - y3);
  const shift = denom !== 0 ? (y3 - y1) / denom : 0;
  const lag = chosen + shift;
  const freq = sampleRate / lag;
  if (!isFinite(freq) || freq < 60 || freq > 1500) return { freq: 0, clarity: 0, rms };
  return { freq, clarity: nsdf[chosen], rms };
}

/* ===================== 7. 画面の土台 ===================== */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

let currentScreen = "home";
let lastQuizScreen = null;       // 使い方から戻る先を覚えておく

// 画面ごとに右上のボタンを出し分ける
const TOPBAR = {
  home:     { help: false, home: false, back: false, settings: true },
  quiz:     { help: true,  home: true,  back: false, settings: false },
  play:     { help: true,  home: true,  back: false, settings: false },
  help:     { help: false, home: false, back: true,  settings: false },
  chart:    { help: false, home: false, back: true,  settings: false },
  tuner:    { help: false, home: false, back: true,  settings: false },
  stats:    { help: false, home: false, back: true,  settings: false },
  settings: { help: false, home: false, back: true,  settings: false }
};
function updateTopbar(name) {
  const c = TOPBAR[name] || TOPBAR.home;
  $("#tb-help").hidden = !c.help;
  $("#tb-home").hidden = !c.home;
  $("#tb-back").hidden = !c.back;
  $("#tb-settings").hidden = !c.settings;
}

function nav(name) {
  if (currentScreen === "play" && name !== "play") stopPlayMode();
  if (currentScreen === "tuner" && name !== "tuner") Mic.stop();
  if (currentScreen === "settings" && name !== "settings") { Cal.on = false; Mic.onFrame = null; Mic.stop(); }
  if (name === "help" && (currentScreen === "quiz" || currentScreen === "play")) lastQuizScreen = currentScreen;
  currentScreen = name;
  updateTopbar(name);
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("screen-" + name);
  if (el) el.classList.add("active");
  window.scrollTo(0, 0);
  if (name === "settings") renderSettings();
  if (name === "stats") renderStats();
  if (name === "chart") renderChart();
  if (name === "help") renderHelp();
  if (name === "tuner") renderTuner();
}

/* 記譜/実音の呼び分け */
function usesConcertChart() { return S.chartPitch === "concert" && inst().semi !== 0; }
// 自分の楽器の譜面の呼び名。アルト/バリ＝E♭譜、テナー/ソプラノ＝B♭譜、C管＝C譜
function scoreName() {
  const semi = inst().semi;
  return semi === 9 ? "E♭譜" : semi === 2 ? "B♭譜" : "C譜";
}
function toWrittenName(name) { return usesConcertChart() ? transposeName(name, inst().semi, inst().step) : name; }
function toConcertName(name) { return usesConcertChart() ? name : transposeName(name, -inst().semi + 12, -inst().step + 7); }

function noteHTML(name, opts) {
  const o = opts || {};
  const simple = simplify(name);
  const sub = S.german ? germanOf(name) : (isMessy(name) ? "＝" + pretty(simple) : "");
  return `<span class="note ${o.cls || ""}">${pretty(name)}${sub ? `<span class="note-sub">${esc(sub)}</span>` : ""}</span>`;
}

/* ===================== 8. 出題 ===================== */

function enabledTypes() {
  const list = CHORD_TYPES.filter((t) => S.types.includes(t.id));
  return list.length ? list : CHORD_TYPES.filter((t) => t.level === 1);
}
function enabledRoots() { return S.roots.length ? S.roots : ROOTS_MAIN.slice(); }

function newChord() {
  const type = weightedPick(enabledTypes(), (t) => weightOf(STATS.byType, t.id));
  const root = weightedPick(enabledRoots(), (r) => weightOf(STATS.byRoot, r));
  return buildChord(root, type);
}

// 表示されるコードから「実際に吹く音（記譜）」を得る
function writtenTones(chord) {
  return chord.tones.map((t) => {
    const name = toWrittenName(t.name);
    return { deg: t.deg, name, pc: nameToPc(name) };
  });
}

const Quiz = {
  mode: "tones", q: null, answered: false, n: 0, ok: 0, streak: 0, selected: new Set(),

  start(mode) {
    this.mode = mode; this.n = 0; this.ok = 0; this.streak = 0;
    nav("quiz");
    this.next();
  },
  next() {
    this.answered = false; this.selected = new Set(); this.picked = null;
    const chord = newChord();
    const wt = writtenTones(chord);
    let q = { chord, wt };
    if (this.mode === "name") q.choices = nameChoices(chord);
    if (this.mode === "degree") q.deg = chord.tones[1 + ((Math.random() * (chord.tones.length - 1)) | 0)].deg;
    if (this.mode === "fingering") {
      q.sub = Math.random() < 0.5 ? "read" : "make";
      q.midi = writtenMidiFor(wt[(Math.random() * wt.length) | 0].pc, 60);
      if (q.sub === "make") q.fchoices = fingeringChoices(q.midi);
    }
    this.q = q;
    renderQuiz();
  },
  judge(ok) {
    this.answered = true; this.n++;
    if (ok) { this.ok++; this.streak++; if (this.streak > (STATS.best || 0)) { STATS.best = this.streak; } }
    else this.streak = 0;
    recordAnswer(this.q.chord.type.id, this.q.chord.root, ok);
    renderQuiz(ok);
    if (S.sound) {
      const midis = voiceChord(this.q.wt);
      playWrittenMidis(ok ? midis : midis.slice(0, 1), { gap: 0.26, dur: 0.34 });
    }
  }
};

function nameChoices(chord) {
  const out = [chord.label];
  const types = enabledTypes();
  const roots = enabledRoots();
  let guard = 0;
  while (out.length < 4 && guard++ < 200) {
    let cand;
    if (Math.random() < 0.6 && types.length > 1) {
      const t = types[(Math.random() * types.length) | 0];
      cand = chord.root + t.suffix;
    } else {
      const r = roots[(Math.random() * roots.length) | 0];
      cand = r + chord.type.suffix;
    }
    if (!out.includes(cand) && !sameTones(cand, chord)) out.push(cand);
  }
  // 選択肢が集まらないとき（設定を絞り込んでいるとき）は 12 キーから埋める
  for (const r of shuffle(ROOTS_MAIN.slice())) {
    if (out.length >= 4) break;
    const cand = r + chord.type.suffix;
    if (!out.includes(cand) && !sameTones(cand, chord)) out.push(cand);
  }
  return shuffle(out);
}
function sameTones(label, chord) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(label);
  if (!m) return false;
  const t = CHORD_TYPES.find((x) => x.suffix === m[2]);
  if (!t) return false;
  const a = buildChord(m[1], t).tones.map((x) => x.pc).sort().join();
  const b = chord.tones.map((x) => x.pc).sort().join();
  return a === b;
}
function fingeringChoices(midi) {
  const out = [midi];
  let guard = 0;
  while (out.length < 4 && guard++ < 100) {
    const d = [-3, -2, -1, 1, 2, 3, 5, 7][(Math.random() * 8) | 0];
    const c = midi + d;
    if (c >= 58 && c <= 90 && !out.includes(c) && fingeringFor(c)) out.push(c);
  }
  return shuffle(out);
}

/* ===================== 9. クイズ画面の描画 ===================== */

// 12音ボタンを♭表記で出すか♯表記で出すかは「答えの綴り」に合わせる
function preferFlat(q) {
  const names = q.wt.map((t) => t.name);
  const sharps = names.filter((n) => /#/.test(n)).length;
  const flats = names.filter((n) => /b/.test(n)).length;
  if (sharps !== flats) return flats > sharps;
  return /b/.test(q.chord.root) || ["F", "C"].includes(q.chord.root) || /♭/.test(q.chord.type.suffix);
}

function pcButtonsHTML(flat, selected, disabled, marks) {
  const names = flat ? FLAT_NAMES : SHARP_NAMES;
  const other = flat ? SHARP_NAMES : FLAT_NAMES;
  let out = '<div class="pc-grid">';
  for (let pc = 0; pc < 12; pc++) {
    const alt = other[pc] !== names[pc] ? `<span class="pc-alt">${pretty(other[pc])}</span>` : "";
    let on = selected && selected.has(pc) ? " sel" : "";
    if (marks) on += marks.right.has(pc) ? " right" : marks.wrong.has(pc) ? " wrong" : "";
    out += `<button class="pc-btn${on}" data-pc="${pc}" type="button"${disabled ? " disabled" : ""}>` +
      `<span class="pc-main">${pretty(names[pc])}</span>${alt}` +
      (S.german ? `<span class="pc-ger">${esc(germanOf(names[pc]))}</span>` : "") + "</button>";
  }
  return out + "</div>";
}

function pitchBadge() {
  return usesConcertChart()
    ? '<span class="badge badge-concert">C譜（実音）</span>'
    : `<span class="badge badge-written">${scoreName()}（あなたの譜面）</span>`;
}

function fingerCardHTML(wtone, midi) {
  const alt = altFingeringFor(midi);
  const cm = concertMidi(midi);
  return `<div class="fcard">
    <div class="fcard-head">
      <span class="fcard-deg">${esc(degLabel(wtone.deg))}</span>
      <span class="fcard-note">${pretty(wtone.name)}</span>
    </div>
    ${fingeringSVG(midi)}
    <div class="fcard-foot">
      <span>記譜 ${esc(midiToName(midi, /b/.test(wtone.name)))}</span>
      <span class="dim">実音 ${esc(commonLabel(cm))}</span>
    </div>
    ${alt ? `<div class="fcard-alt">別指: ${esc(alt.note)}</div>` : ""}
  </div>`;
}
function degLabel(d) {
  const map = { "1": "R", "b3": "♭3", "3": "3", "b5": "♭5", "5": "5", "#5": "♯5", "6": "6",
    "bb7": "♭♭7", "b7": "♭7", "7": "M7", "4": "4", "9": "9", "b9": "♭9", "#9": "♯9",
    "11": "11", "#11": "♯11", "13": "13", "b13": "♭13", "#2": "♯2", "2": "2" };
  return map[d] || d;
}

function answerPanelHTML(q, ok) {
  const midis = voiceChord(q.wt);
  const cards = q.wt.map((t, i) => fingerCardHTML(t, midis[i])).join("");
  const concertLine = usesConcertChart()
    ? `<div class="ap-line"><span class="ap-key">実音</span>${q.chord.tones.map((t) => noteHTML(t.name)).join('<span class="sep">·</span>')}</div>`
    : "";
  const writtenLine = `<div class="ap-line"><span class="ap-key">${usesConcertChart() ? "あなたが吹く音" : "構成音"}</span>${q.wt.map((t) => `<span class="tone"><span class="tone-deg">${esc(degLabel(t.deg))}</span>${noteHTML(t.name)}</span>`).join("")}</div>`;
  return `<div class="answer-panel ${ok ? "ok" : "ng"}">
    <div class="ap-head">
      <span class="ap-verdict">${ok ? "正解" : "不正解"}</span>
      <span class="ap-chord">${pretty(q.chord.label)}<span class="ap-jp">${esc(q.chord.type.jp)}</span></span>
    </div>
    ${concertLine}${writtenLine}
    <div class="fcards">${cards}</div>
    <div class="ap-actions">
      <button class="btn btn-ghost" id="ap-play" type="button">♪ 鳴らす</button>
      <button class="btn btn-ghost" id="ap-blow" type="button">🎤 これを吹いて確認</button>
      <button class="btn btn-primary" id="ap-next" type="button">次の問題 →</button>
    </div>
  </div>`;
}

// 答え合わせ後、12音ボタンに正解・誤答の色をつける
function pcMarks(q) {
  const right = new Set(), wrong = new Set();
  if (Quiz.mode === "tones") {
    q.wt.forEach((t) => right.add(t.pc));
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  } else if (Quiz.mode === "degree") {
    const t = q.wt.find((x) => x.deg === q.deg);
    if (t) right.add(t.pc);
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  } else if (Quiz.mode === "fingering" && q.sub === "read") {
    right.add(q.midi % 12);
    Quiz.selected.forEach((pc) => { if (!right.has(pc)) wrong.add(pc); });
  }
  return { right, wrong };
}

function renderQuiz(ok) {
  const q = Quiz.q;
  const body = $("#quiz-body");
  const flat = preferFlat(q);
  const marks = Quiz.answered ? pcMarks(q) : null;
  let head = "", input = "";

  if (Quiz.mode === "tones") {
    head = `<div class="qcard">
      <div class="q-label">構成音をすべて選ぶ ${pitchBadge()}</div>
      <div class="q-main">${pretty(q.chord.label)}</div>
      <div class="q-sub">${esc(q.chord.type.jp)}${usesConcertChart() ? " ／ 答えは<b>あなたが吹く音</b>で" : ""}</div>
    </div>`;
    input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks) +
      `<div class="pc-actions"><span class="pc-count" id="pc-count"></span>
       <button class="btn btn-primary" id="pc-check" type="button"${Quiz.answered ? " disabled" : ""}>判定</button></div>`;
  } else if (Quiz.mode === "degree") {
    head = `<div class="qcard">
      <div class="q-label">この度数の音は？ ${pitchBadge()}</div>
      <div class="q-main">${pretty(q.chord.label)}<span class="q-deg">の ${esc(degLabel(q.deg))}</span></div>
      <div class="q-sub">${usesConcertChart() ? "答えは<b>あなたが吹く音</b>で" : "&nbsp;"}</div>
    </div>`;
    input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks);
  } else if (Quiz.mode === "name") {
    const shown = q.wt.map((t) => noteHTML(t.name)).join('<span class="sep">·</span>');
    head = `<div class="qcard">
      <div class="q-label">${usesConcertChart() ? "この音を吹いている。C譜（実音）でのコード名は？" : "このコード名は？"}</div>
      <div class="q-main q-main-notes">${shown}</div>
      <div class="q-sub">${usesConcertChart() ? `表示は${scoreName()}（あなたが吹く音）` : "&nbsp;"}</div>
    </div>`;
    input = '<div class="choice-grid">' + q.choices.map((c) =>
      `<button class="choice${Quiz.answered ? (c === q.chord.label ? " right" : (Quiz.picked === c ? " wrong" : "")) : ""}" data-choice="${esc(c)}" type="button"${Quiz.answered ? " disabled" : ""}>${pretty(c)}</button>`).join("") + "</div>";
  } else if (Quiz.mode === "fingering") {
    if (q.sub === "read") {
      head = `<div class="qcard">
        <div class="q-label">この運指の音は？（記譜）</div>
        <div class="q-fing">${fingeringSVG(q.midi)}</div>
      </div>`;
      input = pcButtonsHTML(flat, Quiz.selected, Quiz.answered, marks);
    } else {
      const name = (flat ? FLAT_NAMES : SHARP_NAMES)[q.midi % 12];
      head = `<div class="qcard">
        <div class="q-label">この音の運指は？（記譜）</div>
        <div class="q-main">${pretty(name)}<span class="q-oct">${Math.floor(q.midi / 12) - 1}</span></div>
      </div>`;
      input = '<div class="fing-choice">' + q.fchoices.map((m) =>
        `<button class="fchoice${Quiz.answered ? (m === q.midi ? " right" : (Quiz.picked === m ? " wrong" : "")) : ""}" data-fmidi="${m}" type="button"${Quiz.answered ? " disabled" : ""}>${fingeringSVG(m)}</button>`).join("") + "</div>";
    }
  }

  body.innerHTML = head + `<div class="q-input">${input}</div>` +
    (Quiz.answered ? answerPanelHTML(q, ok) : "");
  $("#score-text").textContent = `${Quiz.ok} / ${Quiz.n}`;
  $("#streak-text").textContent = Quiz.streak >= 3 ? `🔥 ${Quiz.streak}連続` : "";
  updatePcCount();
  if (Quiz.answered) {
    const panel = $(".answer-panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function updatePcCount() {
  const el = $("#pc-count");
  if (!el || !Quiz.q) return;
  el.textContent = `${Quiz.selected.size} / ${Quiz.q.wt.length} 音`;
}

/* ===================== 10. クイズ画面の操作 ===================== */

$("#quiz-body").addEventListener("click", (e) => {
  const q = Quiz.q;
  if (!q) return;

  const pcBtn = e.target.closest(".pc-btn");
  if (pcBtn && !Quiz.answered) {
    const pc = Number(pcBtn.dataset.pc);
    if (Quiz.mode === "tones") {
      if (Quiz.selected.has(pc)) Quiz.selected.delete(pc); else Quiz.selected.add(pc);
      pcBtn.classList.toggle("sel");
      updatePcCount();
      if (S.sound) saxNote(midiToFreq(concertMidi(writtenMidiFor(pc, 62))), 0, 0.32, 0.15);
      if (Quiz.selected.size === q.wt.length) checkTones();
    } else {
      Quiz.selected = new Set([pc]);
      Quiz.picked = pc;
      if (Quiz.mode === "degree") {
        const t = q.wt.find((x) => x.deg === q.deg);
        Quiz.judge(!!t && t.pc === pc);
      } else {
        Quiz.judge(pc === q.midi % 12);
      }
    }
    return;
  }
  if (e.target.closest("#pc-check") && !Quiz.answered) { checkTones(); return; }

  const ch = e.target.closest(".choice");
  if (ch && !Quiz.answered) { Quiz.picked = ch.dataset.choice; Quiz.judge(ch.dataset.choice === q.chord.label); return; }

  const fc = e.target.closest(".fchoice");
  if (fc && !Quiz.answered) { const m = Number(fc.dataset.fmidi); Quiz.picked = m; Quiz.judge(m === q.midi); return; }

  if (e.target.closest("#ap-next")) { Quiz.next(); return; }
  if (e.target.closest("#ap-play")) { playWrittenMidis(voiceChord(q.wt), { chord: true }); return; }
  if (e.target.closest("#ap-blow")) { startPlayMode(q.chord); return; }
});

function checkTones() {
  const want = new Set(Quiz.q.wt.map((t) => t.pc));
  let ok = want.size === Quiz.selected.size;
  if (ok) for (const pc of want) if (!Quiz.selected.has(pc)) { ok = false; break; }
  Quiz.judge(ok);
}

document.addEventListener("keydown", (e) => {
  if (currentScreen !== "quiz") return;
  if ((e.key === "Enter" || e.key === " ") && Quiz.answered) { e.preventDefault(); Quiz.next(); }
});

/* ===================== 11. 吹いて答えるモード ===================== */

const Play = {
  chord: null, wt: [], midis: [], idx: 0, done: [], hold: 0, n: 0, ok: 0,
  order: "up", listening: false, sinceTarget: 0, armed: false, reveal: false, cleared: false
};

// 判定は感度設定より厳しめの下限を使う。
// サックスの音は倍音がそろっていて自己相関が高く出るので、
// 雑音（自己相関が低い）と分けられる。ここを感度スライダーに連動させると、
// 高感度のときに部屋の雑音で勝手に進んでしまう。
const ACCEPT_CLARITY = 0.62;
const ACCEPT_FRAMES = 6;         // 約 0.2 秒
const TARGET_GRACE_MS = 350;     // 次の音に移った直後は判定しない（前の音の余韻よけ）

function startPlayMode(chord) {
  Play.chord = chord || newChord();
  Play.wt = writtenTones(Play.chord);
  Play.midis = voiceChord(Play.wt);
  if (Play.order === "random") {
    const idx = shuffle(Play.wt.map((_, i) => i));
    Play.wt = idx.map((i) => Play.wt[i]);
    Play.midis = idx.map((i) => Play.midis[i]);
  }
  Play.idx = 0; Play.done = Play.wt.map(() => false); Play.hold = 0;
  Play.sinceTarget = Date.now(); Play.armed = false;
  Play.reveal = false; Play.cleared = false;
  nav("play");
  renderPlay();
  ensureMic();
}

function stopPlayMode() { Mic.onFrame = null; Mic.stop(); Play.listening = false; }

async function ensureMic() {
  const okMic = await Mic.start();
  Play.listening = okMic;
  if (!okMic) { renderPlay(); return; }
  Mic.onFrame = onPlayFrame;
  renderPlay();
}

function onPlayFrame(r) {
  if (currentScreen !== "play") return;
  const targetMidi = Play.midis[Play.idx];
  if (targetMidi == null) return;
  const targetPc = ((concertMidi(targetMidi) % 12) + 12) % 12;

  updateMicMeter(r);
  calibrationFrame(r);

  const live = $("#play-live");
  const heard = r.freq > 0 && r.clarity > S.micClarity;
  if (live) {
    if (!heard) {
      live.className = "play-live idle";
      // 音は来ているのに音程が取れないのか、そもそも音量が届いていないのかを分ける
      const hint = r.rms >= S.micGate ? "音は拾えています。もう少し伸ばして吹いてください" : "吹いてください";
      live.innerHTML = `<span class="pl-note">—</span><span class="pl-hint">${hint}</span>`;
    } else {
      const pc = ((Mic.midi % 12) + 12) % 12;
      const hit = pc === targetPc;
      live.className = "play-live " + (hit ? "hit" : "miss");
      live.innerHTML = `<span class="pl-note">${pretty(commonName(pc))}<span class="pl-oct">${Math.floor(Mic.midi / 12) - 1}</span></span>` +
        `<span class="pl-cents ${Math.abs(Mic.cents) <= 15 ? "in" : ""}">${Mic.cents > 0 ? "+" : ""}${Mic.cents}¢</span>` +
        `<span class="pl-hint">${hit ? "その音！" : (S.playHide && !Play.reveal ? "ちがう音" : "実音 " + pretty(commonName(targetPc)) + " を狙う")}</span>`;
    }
    const needle = $("#play-needle");
    if (needle && heard) needle.style.transform = `translateX(${Math.max(-50, Math.min(50, Mic.cents))}px)`;
  }

  // 目標の音がいったん「鳴っていない」状態を見てから数え始める。
  // これをしないと、前の音の余韻や、画面を開いた時点の音でいきなり合格になる。
  const matches = heard && ((Mic.midi % 12) + 12) % 12 === targetPc && Math.abs(Mic.cents) <= 45;
  if (!matches) Play.armed = true;

  const fresh = Date.now() - Play.sinceTarget > TARGET_GRACE_MS;
  if (matches && Play.armed && fresh && r.clarity >= ACCEPT_CLARITY) {
    Play.hold++;
  } else if (Play.hold > 0) {
    Play.hold = Math.max(0, Play.hold - 1);
  }
  if (Play.hold >= ACCEPT_FRAMES) {
    Play.hold = 0;
    Play.done[Play.idx] = true;
    Play.n++; Play.ok++;
    if (S.sound) blip(1320, 0, 0.1, 0.07);
    Play.idx++;
    Play.sinceTarget = Date.now(); Play.armed = false;
    if (Play.idx >= Play.wt.length) {
      recordAnswer(Play.chord.type.id, Play.chord.root, true);
      Play.cleared = true; Play.reveal = true;
      renderPlay(true);
      playLick(Play.midis);
      const wait = 900 + Play.midis.length * 190 + 900;
      setTimeout(() => { if (currentScreen === "play" && Play.cleared) startPlayMode(newChord()); }, wait);
    } else {
      renderPlay();
    }
  }
}

function renderPlay(cleared) {
  const body = $("#play-body");
  if (!Play.chord) { body.innerHTML = ""; return; }
  const hide = S.playHide && !Play.reveal;

  const chips = Play.wt.map((t, i) => {
    const st = Play.done[i] ? "done" : i === Play.idx ? "now" : "todo";
    const shown = (hide && !Play.done[i])
      ? `<span class="pchip-q">?</span>`
      : `<span class="pchip-deg">${esc(degLabel(t.deg))}</span>${pretty(t.name)}`;
    return `<button class="pchip ${st}" data-i="${i}" type="button" title="この音に戻る">${shown}</button>`;
  }).join("");

  const i = Math.min(Play.idx, Play.wt.length - 1);
  const cur = Play.wt[i], curMidi = Play.midis[i];

  const target = hide ? `
    <div class="play-target hidden-target">
      <div class="pt-left">
        <div class="pt-deg">${i + 1} 音目 / ${Play.wt.length}</div>
        <div class="pt-note pt-hidden">?</div>
        <div class="pt-sub">コードから自分で考えて吹く</div>
      </div>
      <div class="pt-right">
        <button class="btn btn-ghost pt-hint" id="play-hint" type="button">ヒントを見る</button>
      </div>
    </div>`
    : `
    <div class="play-target">
      <div class="pt-left">
        <div class="pt-deg">${esc(degLabel(cur.deg))}</div>
        <div class="pt-note">${pretty(cur.name)}</div>
        <div class="pt-sub">記譜 ${esc(midiToName(curMidi, /b/.test(cur.name)))} ／ 実音 ${esc(commonLabel(concertMidi(curMidi)))}</div>
        ${S.german ? `<div class="pt-ger">${esc(germanOf(cur.name))}</div>` : ""}
      </div>
      <div class="pt-right">${fingeringSVG(curMidi)}</div>
    </div>`;

  body.innerHTML = `
    <div class="qcard">
      <div class="q-label">この音を順番に吹く ${pitchBadge()}</div>
      <div class="q-main">${pretty(Play.chord.label)}</div>
      <div class="q-sub">${hide ? esc(Play.chord.type.jp) + " ／ 構成音は表示していません" : "&nbsp;"}</div>
      <div class="pchips">${chips}</div>
    </div>
    ${cleared ? '<div class="play-cleared">全部吹けました 🎉</div>' : ""}
    ${target}
    ${Play.listening ? `
      <div class="play-live idle" id="play-live"><span class="pl-note">—</span><span class="pl-hint">吹いてください</span></div>
      <div class="tuner-scale"><div class="tuner-center"></div><div class="tuner-needle" id="play-needle"></div></div>
      ${micPanelHTML()}
    ` : `
      <div class="mic-off">
        <p>${esc(Mic.err || "マイクを使うと、吹いた音を自動で判定します。")}</p>
        <button class="btn btn-primary" id="play-mic-on" type="button">マイクを使う</button>
      </div>
    `}
    <div class="play-actions">
      <button class="btn btn-ghost" id="play-listen" type="button">♪ お手本</button>
      <button class="btn btn-ghost" id="play-lick" type="button">♪ 通して聴く</button>
      <button class="btn btn-ghost" id="play-skip" type="button">とばす</button>
      <button class="btn btn-ghost${S.playHide ? " on" : ""}" id="play-hidemode" type="button">${S.playHide ? "音を表示する" : "音を隠す"}</button>
      <button class="btn btn-ghost" id="play-order" type="button">${Play.order === "up" ? "上行" : "ランダム"}</button>
      <button class="btn btn-primary" id="play-next" type="button">次のコード →</button>
    </div>`;
  $("#play-score-text").textContent = `${Play.ok} 音クリア`;
}

$("#play-body").addEventListener("click", (e) => {
  if (handleMicPanelClick(e)) return;
  if (e.target.closest("#play-mic-on")) { ensureMic(); return; }
  if (e.target.closest("#play-listen")) {
    // 音を隠しているときにお手本を鳴らすと答えになってしまうので、ヒント扱いにする
    if (S.playHide && !Play.reveal) { Play.reveal = true; renderPlay(); }
    playWrittenMidis([Play.midis[Math.min(Play.idx, Play.midis.length - 1)]], { dur: 0.9 });
    return;
  }
  if (e.target.closest("#play-lick")) { playLick(Play.midis); return; }
  if (e.target.closest("#play-hint")) { Play.reveal = true; renderPlay(); return; }
  if (e.target.closest("#play-hidemode")) {
    S.playHide = !S.playHide; save();
    Play.reveal = false;
    renderPlay();
    return;
  }
  if (e.target.closest("#play-skip")) {
    Play.idx = Math.min(Play.idx + 1, Play.wt.length);
    Play.sinceTarget = Date.now(); Play.armed = false; Play.hold = 0;
    if (Play.idx >= Play.wt.length) startPlayMode(newChord()); else renderPlay();
    return;
  }
  // 誤って進んでしまったときのために、音名をタップしてその音に戻れる
  const chip = e.target.closest(".pchip");
  if (chip) {
    const i = Number(chip.dataset.i);
    Play.idx = i;
    for (let k = i; k < Play.done.length; k++) Play.done[k] = false;
    Play.sinceTarget = Date.now(); Play.armed = false; Play.hold = 0;
    Play.cleared = false;
    if (S.playHide) Play.reveal = false;
    renderPlay();
    return;
  }
  if (e.target.closest("#play-order")) {
    Play.order = Play.order === "up" ? "random" : "up";
    startPlayMode(Play.chord); return;
  }
  if (e.target.closest("#play-next")) { Play.cleared = false; startPlayMode(newChord()); return; }
});


/* ---------- マイク感度パネル（吹いて答える・チューナー・設定で共用） ---------- */

// 音量は対数で見ないと小さい音の変化が見えないので dB に直してメーターに出す
function rmsToPct(rms) {
  const db = 20 * Math.log10(Math.max(rms, 1e-7));
  return Math.max(0, Math.min(100, ((db + 90) / 84) * 100));   // -90dB 〜 -6dB
}
function micPanelHTML() {
  const lv = sensLevel();
  return `<div class="mic-cal">
    <div class="mic-cal-head">
      <span>マイク感度 <b>${lv}</b> / 7</span>
      <span class="mic-cal-level" id="mic-level-text">—</span>
    </div>
    <div class="mic-meter">
      <div class="mic-meter-fill" id="mic-meter-fill"></div>
      <div class="mic-meter-th" id="mic-meter-th" style="left:${rmsToPct(S.micGate)}%"></div>
    </div>
    <div class="mic-cal-row">
      <span class="mic-cal-cap">鈍い</span>
      ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button class="sens${n === lv ? " on" : ""}${n >= 6 ? " hi" : ""}" data-sens="${n}" type="button">${n}</button>`).join("")}
      <span class="mic-cal-cap">敏感</span>
      <button class="mini" id="mic-auto" type="button">自動で合わせる</button>
    </div>
    <div class="mic-cal-hint" id="mic-cal-hint">縦線より音量バーが右に伸びていれば拾えています。伸びないときは感度を上げてください。${lv >= 6 ? "<br><b>6・7 は最高感度</b>です。マイクが遠いとき用で、雑音にも反応しやすくなります。" : ""}</div>
  </div>`;
}
function updateMicMeter(r) {
  const fill = $("#mic-meter-fill");
  if (!fill) return;
  fill.style.width = rmsToPct(r.rms) + "%";
  fill.classList.toggle("over", r.rms >= S.micGate);
  const th = $("#mic-meter-th");
  if (th) th.style.left = rmsToPct(S.micGate) + "%";
  const txt = $("#mic-level-text");
  if (txt) txt.textContent = r.rms < 1e-5 ? "無音" : Math.round(20 * Math.log10(Math.max(r.rms, 1e-6))) + " dB";
}

// 周囲の雑音を 1.5 秒測って、その少し上にしきい値を置く
const Cal = { on: false, samples: [], t0: 0 };
function startCalibration() {
  Cal.on = true; Cal.samples = []; Cal.t0 = Date.now();
  const hint = $("#mic-cal-hint");
  if (hint) { hint.textContent = "測定中… 吹かずに 1.5 秒そのままで"; hint.classList.add("busy"); }
  if (!Mic.running) {
    Mic.start().then((ok) => {
      if (!ok) {
        const h = $("#mic-cal-hint");
        if (h) { h.textContent = Mic.err; h.classList.remove("busy"); }
        Cal.on = false;
        return;
      }
      if (currentScreen === "tuner") Mic.onFrame = onTunerFrame;
      else if (currentScreen === "play") Mic.onFrame = onPlayFrame;
      else Mic.onFrame = onMicPanelFrame;      // 設定画面：メーターと測定だけ
    });
  }
}
function calibrationFrame(r) {
  if (!Cal.on) return;
  Cal.samples.push(r.rms);
  if (Date.now() - Cal.t0 < 1500) return;
  Cal.on = false;
  const sorted = Cal.samples.slice().sort((a, b) => a - b);
  const noise = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;   // 雑音の上のほう
  S.micGate = Math.max(0.0009, Math.min(0.05, noise * 2.5 + 0.0008));
  S.micClarity = SENS_PRESETS[sensLevel() - 1].clarity;
  save();
  refreshMicPanel();
  const hint = $("#mic-cal-hint");
  if (hint) { hint.textContent = `雑音に合わせて感度 ${sensLevel()} にしました。試しに吹いてみてください。`; hint.classList.remove("busy"); }
}
function refreshMicPanel() {
  if (currentScreen === "play") renderPlay();
  else if (currentScreen === "tuner") renderTuner();
  else if (currentScreen === "settings") renderSettings();
}
// 設定画面など、判定を伴わない画面でのフレーム処理
function onMicPanelFrame(r) { updateMicMeter(r); calibrationFrame(r); }

// 感度パネルのクリックを処理する。処理したら true
function handleMicPanelClick(e) {
  const b = e.target.closest("[data-sens]");
  if (b) {
    const p = SENS_PRESETS[Number(b.dataset.sens) - 1];
    S.micGate = p.gate; S.micClarity = p.clarity; save();
    refreshMicPanel();
    return true;
  }
  if (e.target.closest("#mic-auto")) { startCalibration(); return true; }
  return false;
}

/* ===================== 12. 運指表 ===================== */

const CHART_SECTIONS = [
  { from: 58, to: 61, title: "低音域", desc: "小指のテーブルキー" },
  { from: 62, to: 73, title: "中音域（オクターブキーなし）", desc: "ここが運指の基本形" },
  { from: 74, to: 85, title: "オクターブキーつき", desc: "中音域と同じ指＋オクターブキー" },
  { from: 86, to: 90, title: "高音域（パームキー）", desc: "左手のひらで押す 3 つのキー" }
];
function renderChart() {
  const wrap = $("#chart-wrap");
  let cells = "";
  for (let m = 58; m <= 90; m++) {
    const sec = CHART_SECTIONS.find((x) => x.from === m);
    if (sec) cells += `</div><h3 class="sec-title">${esc(sec.title)}<em> ${esc(sec.desc)}</em></h3><div class="chart-grid">`;
    const name = commonName(m);
    const alt = altFingeringFor(m);
    cells += `<div class="chart-cell" data-midi="${m}">
      <div class="chart-name">${pretty(name)}<span class="chart-oct">${Math.floor(m / 12) - 1}</span></div>
      ${fingeringSVG(m)}
      <div class="chart-sub">実音 ${esc(commonLabel(concertMidi(m)))}</div>
      ${alt ? `<div class="chart-alt">別指あり</div>` : ""}
    </div>`;
  }
  wrap.innerHTML = `<p class="chart-lead">${esc(inst().jp)}の記譜音（低い B♭ 〜 ハイ F♯）。タップで実音が鳴ります。<br>
    塗りつぶし＝押さえるキー。左の縦列は上からパームキー F / E♭ / D とオクターブキー、右の縦列はサイドキーです。</p>
    <div class="chart-grid">${cells}</div>`.replace('<div class="chart-grid"></div>', "");
}
$("#chart-wrap").addEventListener("click", (e) => {
  const c = e.target.closest(".chart-cell");
  if (c) playWrittenMidis([Number(c.dataset.midi)], { dur: 0.8 });
});

/* ===================== 13. チューナー / 音当て ===================== */

$("#tuner-wrap").addEventListener("click", (e) => { handleMicPanelClick(e); });

function renderTuner() {
  const wrap = $("#tuner-wrap");
  wrap.innerHTML = `
    <div class="tuner-card">
      <div class="tuner-note" id="tuner-note">—</div>
      <div class="tuner-cents" id="tuner-cents">マイクを許可してください</div>
      <div class="tuner-scale"><div class="tuner-center"></div><div class="tuner-needle" id="tuner-needle"></div></div>
    </div>
    ${micPanelHTML()}
    <div class="tuner-fing" id="tuner-fing"></div>
    <p class="chart-lead">吹いた音の<b>実音</b>を表示し、${esc(inst().jp)}での<b>記譜音と運指</b>を並べます。基準 A = ${S.a4}Hz（設定で変更）。</p>`;
  Mic.start().then((ok) => {
    if (!ok) { $("#tuner-cents").textContent = Mic.err; return; }
    Mic.onFrame = onTunerFrame;
  });
}
function onTunerFrame(r) {
  if (currentScreen !== "tuner") return;
  const note = $("#tuner-note"), cents = $("#tuner-cents"), needle = $("#tuner-needle"), fing = $("#tuner-fing");
  if (!note) return;
  updateMicMeter(r);
  calibrationFrame(r);
  if (!(r.freq > 0 && r.clarity > S.micClarity)) {
    note.textContent = "—"; note.className = "tuner-note";
    cents.textContent = r.rms >= S.micGate ? "音は拾えています。音程が取れるまで伸ばして吹いてください" : "吹いてください";
    return;
  }
  const pc = ((Mic.midi % 12) + 12) % 12;
  note.innerHTML = pretty(commonName(pc)) + `<span class="tn-oct">${Math.floor(Mic.midi / 12) - 1}</span>`;
  note.className = "tuner-note " + (Math.abs(Mic.cents) <= 10 ? "in" : "out");
  cents.textContent = `${Mic.cents > 0 ? "+" : ""}${Mic.cents} ¢ ／ ${Mic.freq.toFixed(1)} Hz（実音）`;
  needle.style.transform = `translateX(${Math.max(-50, Math.min(50, Mic.cents))}px)`;
  const written = Mic.midi + inst().octSemi;
  const wName = commonName(written);
  const shown = Math.max(58, Math.min(90, writtenMidiFor(((written % 12) + 12) % 12, 60)));
  fing.innerHTML = `<div class="fcard">
      <div class="fcard-head"><span class="fcard-deg">記譜</span><span class="fcard-note">${pretty(wName)}</span></div>
      ${fingeringSVG(shown)}
      <div class="fcard-foot"><span>この運指の音です</span></div>
    </div>`;
}

/* ===================== 14. 成績 ===================== */

function renderStats() {
  const wrap = $("#stats-wrap");
  const acc = STATS.total ? Math.round((STATS.correct / STATS.total) * 100) : 0;
  const rows = CHORD_TYPES.filter((t) => STATS.byType[t.id] && STATS.byType[t.id].n)
    .map((t) => {
      const s = STATS.byType[t.id];
      const a = Math.round((s.ok / s.n) * 100);
      return { t, a, n: s.n };
    }).sort((x, y) => x.a - y.a);
  const rootRows = enabledRoots().map((r) => {
    const s = STATS.byRoot[r] || { n: 0, ok: 0 };
    return { r, a: s.n ? Math.round((s.ok / s.n) * 100) : null, n: s.n };
  }).sort((x, y) => (x.a === null ? 999 : x.a) - (y.a === null ? 999 : y.a));

  wrap.innerHTML = `
    <div class="stat-top">
      <div class="stat-big"><b>${acc}</b><span>%</span><em>正答率</em></div>
      <div class="stat-big"><b>${STATS.total}</b><em>問</em></div>
      <div class="stat-big"><b>${STATS.best || 0}</b><em>最高連続</em></div>
    </div>
    <h3 class="sec-title">コード別（下ほど苦手 → 出題が増えます）</h3>
    ${rows.length ? rows.map((x) => `
      <div class="bar-row"><span class="bar-label">${pretty(x.t.suffix || "major")}<em>${esc(x.t.jp)}</em></span>
      <span class="bar"><span class="bar-fill" style="width:${x.a}%"></span></span>
      <span class="bar-num">${x.a}%<em>${x.n}問</em></span></div>`).join("")
      : '<p class="dim">まだデータがありません。</p>'}
    <h3 class="sec-title">ルート別</h3>
    <div class="root-grid">${rootRows.map((x) => `<span class="root-pill ${x.a === null ? "none" : x.a < 70 ? "weak" : "good"}">${pretty(x.r)}<em>${x.a === null ? "—" : x.a + "%"}</em></span>`).join("")}</div>
    <button class="btn btn-ghost danger" id="stats-reset" type="button">成績を消す</button>`;
}
$("#stats-wrap").addEventListener("click", (e) => {
  if (e.target.closest("#stats-reset")) {
    if (confirm("成績を消しますか？")) { STATS = { byType: {}, byRoot: {}, total: 0, correct: 0, best: 0 }; save(); renderStats(); }
  }
});


/* ===================== 使い方 ===================== */

function renderHelp() {
  const wrap = $("#help-wrap");
  const sample = fingeringSVG(67);                          // 記譜 G の運指を例に
  wrap.innerHTML = `
    <div class="help-lead">コードの構成音を覚えて、その場で運指を確認し、実際に吹いて確かめるためのアプリです。</div>

    <h3 class="help-h">吹いて答えるモード</h3>
    <p class="help-p">表示されたコードの構成音を、<b>下から順に 1 音ずつ吹く</b>モードです。マイクが音程を聞き取り、合っていれば自動で次の音に進みます。</p>
    <ol class="help-steps">
      <li><b>コードを見る</b>（例：Dm7）。その下の丸い並びが、これから吹く音の一覧です。</li>
      <li><b>大きく出ている音を吹く</b>。左に音名と度数、右にその運指図が出ます。</li>
      <li>合っていれば<b>音名の並びが緑になって次へ進みます</b>。</li>
      <li>全部吹けると、コードトーンが<b>「たたたん」と通しで鳴ります</b>。フレーズとして耳に残すためのものです（「♪ 通して聴く」でいつでも鳴らせます）。</li>
    </ol>
    <p class="help-p"><b>音を隠す</b>を押すと、コード名だけが出て構成音も運指も表示されません。自分で考えて吹く練習用です。分からなくなったら「ヒントを見る」で表示できます。吹けた音から順に表示されます。</p>

    <div class="help-legend">
      <div class="help-legend-title">画面の見方</div>
      <ul class="help-list">
        <li><span class="lg-chip"><span class="pchip now"><span class="pchip-deg">R</span>D</span></span>
          <span><b>色つき</b>＝いま吹く音。<b>緑</b>＝吹けた音。<b>薄いグレー</b>＝まだの音。</span></li>
        <li><span class="lg-chip"><span class="pt-deg">♭7</span></span>
          <span>コードの何番目の音か（R＝ルート、3＝3rd、♭7＝7th）。ここを覚えるのが目的です。</span></li>
        <li><span class="lg-chip"><span class="dim small">記譜 D4 ／ 実音 F3</span></span>
          <span><b>記譜</b>＝あなたの譜面での音名（＝運指図の音）。<b>実音</b>＝実際に鳴る高さ。マイクは実音を聞いています。</span></li>
        <li><span class="lg-chip"><span class="play-live hit" style="min-height:0;padding:4px 8px"><span class="pl-note" style="font-size:16px">D</span></span></span>
          <span>いまマイクが聞き取っている音。<b>緑＝正解の音</b>、赤＝違う音、「—」＝音を拾えていない。</span></li>
        <li><span class="lg-chip"><span class="pl-cents in">+3¢</span></span>
          <span>音程のズレ（セント）。±15 以内なら緑。判定は ±45 まで許容します。</span></li>
        <li><span class="lg-chip"><span class="mic-meter" style="width:52px;margin:0"><span class="mic-meter-fill over" style="width:60%"></span><span class="mic-meter-th" style="left:35%"></span></span></span>
          <span>入力の音量。<b>赤い縦線</b>がしきい値で、バーがそれを越えて緑になれば拾えています。</span></li>
      </ul>
    </div>

    <h3 class="help-h">反応しないとき / 勝手に進むとき</h3>
    <ul class="help-list">
      <li><b>バーが動かない</b>：音量が届いていません。マイク感度を上げるか、端末を近づけてください。</li>
      <li><b>バーは動くが音名が出ない</b>：音程が取れていません。感度を上げるか、少し長めに音を伸ばしてください。</li>
      <li><b>吹いていないのに進む</b>：感度が高すぎます。1 段階下げてください。</li>
      <li>音が出ないときは、<b>チューナー画面</b>で確かめると原因が分かります。</li>
      <li>マイクは <b>https:// か localhost</b> でしか使えません（ブラウザの決まり）。</li>
    </ul>

    <h3 class="help-h">運指図の読み方</h3>
    <p class="help-p">色が付いたキーを押さえます。縦に並ぶ大きい丸が、指を置く主要キーです。上の 3 つが左手 1・2・3、下の 3 つが右手 1・2・3。</p>
    <div class="help-fing">${sample}<div class="help-fing-cap">例：記譜 G（左手 1・2・3）</div></div>
    <ul class="help-list">
      <li><b>左の細長いキー</b>：オクターブキー（左手親指）</li>
      <li><b>右上の縦長 3 つ</b>：パームキー（上から F・E♭・D。左の手のひらで押す）</li>
      <li><b>右の四角い塊</b>：サイドキー（側面 E・C・B♭、ハイ F♯）。この図では 1 つにまとまっているので、どれを押すかは図の下の文字で示します</li>
      <li><b>いちばん上の小さい丸</b>：フロント F、<b>左手 1 と 2 のあいだの小さい丸</b>：バイス B♭</li>
      <li>小指のキー（G♯・低 C♯・低 B・低 B♭・低 E♭・低 C）と F♯ キーはこの図に描かれていないため、<b>図の下に文字で出します</b></li>
    </ul>

    <h3 class="help-h">クイズの種類</h3>
    <ul class="help-list">
      <li><b>コード → 構成音</b>：コード名を見て、構成音を 12 音からすべて選ぶ。</li>
      <li><b>度数クイズ</b>：「B♭7 の ♭7 は？」に答える。アドリブ中に一番使う力です。</li>
      <li><b>構成音 → コード名</b>：並んだ音からコード名を当てる。</li>
      <li><b>運指クイズ</b>：運指図 → 音名、音名 → 運指の両方向。</li>
    </ul>
    <p class="help-p">答え合わせでは必ず<b>構成音ぜんぶの運指図</b>が出ます。苦手なコードほど出題されやすくなります（成績画面で確認できます）。</p>

    <h3 class="help-h">C譜と移調譜</h3>
    <ul class="help-list">
      <li><b>${esc(scoreName())}（自分のパート譜）</b>：書かれたコードをそのまま吹く。</li>
      <li><b>C譜（実音）</b>：ピアノやギターと同じ実音のコード。自分で移調して吹く練習になります。</li>
    </ul>
    <p class="help-p">楽器と譜面は<b>右上の楽器バッジ</b>から、いつでも切り替えられます。</p>

    <button class="btn btn-primary help-back" id="help-back" type="button">戻る</button>`;
}
$("#help-wrap").addEventListener("click", (e) => {
  if (e.target.closest("#help-back")) {
    if (lastQuizScreen) { const t = lastQuizScreen; lastQuizScreen = null; nav(t); if (t === "play") { renderPlay(); ensureMic(); } }
    else nav("home");
  }
});

/* ===================== 15. 設定 ===================== */

function renderSettings() {
  const wrap = $("#settings-wrap");
  const instBtns = Object.values(INSTRUMENTS).map((i) =>
    `<button class="seg ${S.instrument === i.id ? "on" : ""}" data-inst="${i.id}" type="button">${esc(i.jp)}</button>`).join("");
  const typeGroup = (lv, title, desc) => `
    <div class="type-group">
      <div class="type-head"><span>${esc(title)}<em>${esc(desc)}</em></span>
        <span class="type-btns">
          <button class="mini" data-lvon="${lv}" type="button">全部入れる</button>
          <button class="mini" data-lvoff="${lv}" type="button">外す</button>
        </span></div>
      <div class="chk-grid">${CHORD_TYPES.filter((t) => t.level === lv).map((t) =>
        `<label class="chk ${S.types.includes(t.id) ? "on" : ""}"><input type="checkbox" data-type="${t.id}" ${S.types.includes(t.id) ? "checked" : ""}>
          <span class="chk-name">${pretty(t.suffix || "（メジャー）")}</span><span class="chk-jp">${esc(t.jp)}</span></label>`).join("")}</div>
    </div>`;

  wrap.innerHTML = `
    <h3 class="sec-title">楽器</h3>
    <div class="seg-row">${instBtns}</div>
    <p class="dim small">${inst().semi ? `${scoreName()}（あなたの譜面）は実音より ＋${inst().semi} 半音で書かれます。` : "C 管なので譜面と実音は同じです。"}運指図はつねにあなたの譜面（押さえる指）で表示します。C 管はサックスの運指図のまま、移調だけを外したい人向けです。</p>

    <h3 class="sec-title">譜面（どの譜面のコードで出題するか）</h3>
    ${`
      <div class="seg-row">
        <button class="seg ${S.chartPitch === "written" ? "on" : ""}" data-pitch="written" type="button">${scoreName()}（自分のパート譜）</button>
        <button class="seg ${S.chartPitch === "concert" ? "on" : ""}" data-pitch="concert" type="button">C譜（実音・イン C）</button>
      </div>
      <p class="dim small">
        <b>${scoreName()}</b>：譜面に書かれたコードをそのまま吹く。吹奏楽やバンドの移調済みパート譜がこれ。<br>
        <b>C譜</b>：ピアノ・ギターと同じ実音で書かれたコード（リアルブックの原曲キー、iRealPro の C 表示など）。
        自分で移調して吹くので、「C譜の C△7 は ${pretty(transposeName("C", inst().semi, inst().step))}△7 として吹く」という訓練になります。
      </p>
    `}
    <p class="dim small">C譜を読みたいだけのときは、<b>楽器は自分の楽器のまま</b>で「C譜」を選んでください。運指はあなたの楽器のものが出ます。</p>

    <h3 class="sec-title">出題するコード</h3>
    ${typeGroup(1, "レベル1", "まずここから。三和音とセブンス")}
    ${typeGroup(2, "レベル2", "II-V-I とブルースが回る")}
    ${typeGroup(3, "レベル3", "テンション")}

    <h3 class="sec-title">ルート</h3>
    <div class="chk-grid chk-grid-root">
      ${ROOTS_MAIN.concat(ROOTS_EXTRA).map((r) =>
        `<label class="chk ${S.roots.includes(r) ? "on" : ""}"><input type="checkbox" data-root="${esc(r)}" ${S.roots.includes(r) ? "checked" : ""}><span class="chk-name">${pretty(r)}</span></label>`).join("")}
    </div>
    <div class="seg-row">
      <button class="mini" id="roots-all" type="button">12キー全部</button>
      <button class="mini" id="roots-flat" type="button">♭系だけ（管楽器に多い）</button>
    </div>

    <h3 class="sec-title">配色</h3>
    <div class="pal-row">
      ${PALETTES.map((p) => `<button class="pal ${S.palette === p.id ? "on" : ""}" data-pal="${p.id}" type="button">
        <span class="pal-sw">${p.sw.map((c) => `<i style="background:${c}"></i>`).join("")}</span>${esc(p.jp)}</button>`).join("")}
    </div>

    <h3 class="sec-title">マイク感度</h3>
    ${micPanelHTML()}
    <p class="dim small">大きく吹かないと反応しないときは感度を上げてください。「自動で合わせる」は、周囲の雑音を 1.5 秒測ってその少し上にしきい値を置きます（測定中は吹かないこと）。</p>

    <h3 class="sec-title">その他</h3>
    <label class="toggle"><input type="checkbox" id="set-german" ${S.german ? "checked" : ""}><span>ドイツ音名のカタカナを併記（ツェー / エス …）</span></label>
    <label class="toggle"><input type="checkbox" id="set-sound" ${S.sound ? "checked" : ""}><span>音を鳴らす</span></label>
    <label class="toggle toggle-num"><span>基準ピッチ A =</span>
      <input type="number" id="set-a4" min="392" max="466" step="1" value="${S.a4}"><span>Hz</span></label>
    <p class="dim small">吹奏楽・ジャズの現場では 442Hz が多め。マイク判定の精度に効きます。</p>
    <button class="btn btn-ghost danger" id="set-reset" type="button">設定を初期化</button>`;
}

$("#settings-wrap").addEventListener("click", (e) => {
  if (handleMicPanelClick(e)) return;
  const pal = e.target.closest("[data-pal]");
  if (pal) { S.palette = pal.dataset.pal; save(); applyPalette(); renderSettings(); return; }
  const i = e.target.closest("[data-inst]");
  if (i) { S.instrument = i.dataset.inst; applyPitchChange(); return; }
  const p = e.target.closest("[data-pitch]");
  if (p) { S.chartPitch = p.dataset.pitch; applyPitchChange(); return; }
  const on = e.target.closest("[data-lvon]");
  if (on) {
    const lv = Number(on.dataset.lvon);
    CHORD_TYPES.filter((t) => t.level === lv).forEach((t) => { if (!S.types.includes(t.id)) S.types.push(t.id); });
    save(); renderSettings(); return;
  }
  const off = e.target.closest("[data-lvoff]");
  if (off) {
    const lv = Number(off.dataset.lvoff);
    S.types = S.types.filter((id) => TYPE_BY_ID[id] && TYPE_BY_ID[id].level !== lv);
    if (!S.types.length) S.types = ["maj7", "dom7", "min7"];
    save(); renderSettings(); return;
  }
  if (e.target.closest("#roots-all")) { S.roots = ROOTS_MAIN.slice(); save(); renderSettings(); return; }
  if (e.target.closest("#roots-flat")) { S.roots = ["C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "D", "G", "A"]; save(); renderSettings(); return; }
  if (e.target.closest("#set-reset")) {
    if (confirm("設定を初期状態に戻しますか？")) { S = Object.assign({}, DEFAULT_SETTINGS); save(); renderSettings(); updateBadge(); }
  }
});
$("#settings-wrap").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.type) {
    if (t.checked) { if (!S.types.includes(t.dataset.type)) S.types.push(t.dataset.type); }
    else S.types = S.types.filter((x) => x !== t.dataset.type);
    if (!S.types.length) { S.types = [t.dataset.type]; t.checked = true; }
    t.closest(".chk").classList.toggle("on", t.checked);
    save(); return;
  }
  if (t.dataset && t.dataset.root) {
    if (t.checked) { if (!S.roots.includes(t.dataset.root)) S.roots.push(t.dataset.root); }
    else S.roots = S.roots.filter((x) => x !== t.dataset.root);
    if (!S.roots.length) { S.roots = [t.dataset.root]; t.checked = true; }
    t.closest(".chk").classList.toggle("on", t.checked);
    save(); return;
  }
  if (t.id === "set-german") { S.german = t.checked; save(); return; }
  if (t.id === "set-sound") { S.sound = t.checked; save(); return; }
  if (t.id === "set-a4") { const v = Number(t.value); if (v >= 392 && v <= 466) { S.a4 = v; save(); } return; }
});


/* ---------- 楽器と譜面のクイック切替（上部バッジから開く） ---------- */

function quickSheetHTML() {
  const instBtns = Object.values(INSTRUMENTS).map((i) =>
    `<button class="seg ${S.instrument === i.id ? "on" : ""}" data-inst="${i.id}" type="button">${esc(i.jp)}</button>`).join("");
  return `<div class="sheet-head">楽器と譜面</div>
    <div class="sheet-sec">楽器</div>
    <div class="seg-row">${instBtns}</div>
    <div class="sheet-sec">譜面</div>
    ${`<div class="seg-row">
          <button class="seg ${S.chartPitch === "written" ? "on" : ""}" data-pitch="written" type="button">${scoreName()}（自分のパート譜）</button>
          <button class="seg ${S.chartPitch === "concert" ? "on" : ""}" data-pitch="concert" type="button">C譜（実音）</button>
        </div>
        <p class="dim small">C譜を選ぶと、C譜の C△7 を <b>${pretty(transposeName("C", inst().semi, inst().step))}△7</b> として吹く練習になります。</p>`}
    <button class="btn btn-primary sheet-close" data-close type="button">閉じる</button>`;
}
function openQuickSheet() {
  $("#quick-sheet-body").innerHTML = quickSheetHTML();
  $("#quick-sheet").hidden = false;
}
function closeQuickSheet() { $("#quick-sheet").hidden = true; }

// 楽器や譜面が変わったら、表示中の画面を作り直す（古い移調のまま残さない）
function applyPitchChange() {
  save();
  updateBadge();
  if ($("#quick-sheet") && !$("#quick-sheet").hidden) $("#quick-sheet-body").innerHTML = quickSheetHTML();
  if (currentScreen === "quiz" && Quiz.q) Quiz.next();
  else if (currentScreen === "play") startPlayMode(newChord());
  else if (currentScreen === "chart") renderChart();
  else if (currentScreen === "tuner") renderTuner();
  else if (currentScreen === "settings") renderSettings();
}

$("#quick-sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) { closeQuickSheet(); return; }
  const i = e.target.closest("[data-inst]");
  if (i) { S.instrument = i.dataset.inst; applyPitchChange(); return; }
  const p = e.target.closest("[data-pitch]");
  if (p) { S.chartPitch = p.dataset.pitch; applyPitchChange(); return; }
});
$("#inst-badge").addEventListener("click", openQuickSheet);
$("#tb-home").addEventListener("click", () => nav("home"));
$("#tb-settings").addEventListener("click", () => nav("settings"));
$("#tb-help").addEventListener("click", () => nav("help"));
$("#tb-back").addEventListener("click", () => {
  // 使い方はクイズの途中から開くので、開いた画面に戻す
  if (currentScreen === "help" && lastQuizScreen) {
    const t = lastQuizScreen; lastQuizScreen = null; nav(t);
    if (t === "play") { renderPlay(); ensureMic(); }
  } else nav("home");
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeQuickSheet(); });

/* ===================== 16. 起動 ===================== */

function updateBadge() {
  $("#inst-badge").textContent = inst().jp;
  const note = $("#home-note");
  if (note) {
    note.innerHTML = usesConcertChart()
      ? `いまは <b>C譜（実音）</b> で出題。${esc(inst().jp)}なので、C譜の C のコードは <b>${pretty(transposeName("C", inst().semi, inst().step))}</b> として吹きます。`
      : `いまは <b>${scoreName()}（自分のパート譜）</b> で出題。書かれたまま吹きます。${scoreName()}の C は実音 <b>${pretty(transposeName("C", -inst().semi + 12, -inst().step + 7))}</b>。`;
  }
}

document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]");
  if (n) { nav(n.dataset.nav); return; }
  const m = e.target.closest("[data-mode]");
  if (m) {
    audioCtx();                       // ユーザー操作のうちに AudioContext を起こす
    if (m.dataset.mode === "play") startPlayMode(newChord());
    else Quiz.start(m.dataset.mode);
  }
});

applyPalette();
updateBadge();
nav("home");

// Web フォントは「あれば使う」だけの飾りなので、描画にも load イベントにも
// 関わらせない。CDN が届かなくても代替フォントでそのまま動く。
(function loadFonts() {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.media = "print";
  l.href = "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Bodoni+Moda:wght@600;700&display=swap";
  l.onload = () => { l.media = "all"; };
  document.head.appendChild(l);
})();

// load を待つと、外部リソースが詰まったときに登録されないので待たない
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// デバッグ・テスト用に主要関数を公開する
window.__TYPES = CHORD_TYPES;
window.__PALETTES = PALETTES;
window.SaxChord = { __svg: fingeringSVG, buildChord, fingeringFor, transposeName, spell, detectPitch, voiceChord, saxNote, settings: () => S, mic: () => Mic,
  acceptRules: () => ({ clarity: ACCEPT_CLARITY, frames: ACCEPT_FRAMES, grace: TARGET_GRACE_MS }), S: () => S, Quiz, Play };
})();
