// Playwright はグローバル導入でも動くように解決する
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOT_DIR || path.join(os.tmpdir(), 'saxchord-shots');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : req.url.split('?')[0]);
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8931, r));
await import('node:fs/promises').then(fs => fs.mkdir(SHOTS, { recursive: true }));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_CONNECTION|Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8931/index.html');
await page.waitForTimeout(400);
await page.addInitScript(() => {});

const fail = [];
const ck = (name, cond, extra='') => { console.log((cond?'  ok  ':'  FAIL') + ' ' + name + (cond?'':' :: '+extra)); if(!cond) fail.push(name); };

// --- 1. 音楽理論 ---
const theory = await page.evaluate(() => {
  const S = window.SaxChord;
  const out = {};
  const types = {
    maj7: ['1','3','5','7'], dom7: ['1','3','5','b7'], m7b5: ['1','b3','b5','b7'], dim7:['1','b3','b5','bb7']
  };
  const mk = (root, degs) => S.buildChord(root, { degs, suffix:'', jp:'', id:'x' }).tones.map(t=>t.name).join(' ');
  out.Cmaj7 = mk('C', types.maj7);
  out.Eb7   = mk('Eb', types.dom7);
  out.Fs7   = mk('F#', types.dom7);
  out.Bm7b5 = mk('B', types.m7b5);
  out.Cdim7 = mk('C', types.dim7);
  out.Db7   = mk('Db', types.dom7);
  // 移調（アルト E♭: +9半音 / 音度+5）
  out.altoC = S.transposeName('C', 9, 5);
  out.altoE = S.transposeName('E', 9, 5);
  out.altoBb = S.transposeName('Bb', 9, 5);
  out.tenorC = S.transposeName('C', 2, 1);
  out.tenorB = S.transposeName('B', 2, 1);
  // 運指
  out.fingD = S.fingeringFor(62).sort().join(',');
  out.fingLowBb = S.fingeringFor(58).sort().join(',');
  out.fingD5 = S.fingeringFor(74).sort().join(',');
  out.fingHighF = S.fingeringFor(89).sort().join(',');
  out.allRange = [];
  for (let m=58;m<=90;m++) if(!S.fingeringFor(m)) out.allRange.push(m);
  out.voice = S.voiceChord([{pc:10},{pc:2},{pc:5},{pc:8}]);
  out.wide = S.voiceChord([{pc:11},{pc:3},{pc:6},{pc:9},{pc:8}]);  // B7(13) 相当の広い和音
  return out;
});
ck('Cmaj7 = C E G B', theory.Cmaj7==='C E G B', theory.Cmaj7);
ck('Eb7 = Eb G Bb Db', theory.Eb7==='Eb G Bb Db', theory.Eb7);
ck('F#7 = F# A# C# E', theory.Fs7==='F# A# C# E', theory.Fs7);
ck('Bm7(b5) = B D F A', theory.Bm7b5==='B D F A', theory.Bm7b5);
ck('Cdim7 = C Eb Gb Bbb', theory.Cdim7==='C Eb Gb Bbb', theory.Cdim7);
ck('Db7 = Db F Ab Cb', theory.Db7==='Db F Ab Cb', theory.Db7);
ck('alto: 実音C→記譜A', theory.altoC==='A', theory.altoC);
ck('alto: 実音E→記譜C#', theory.altoE==='C#', theory.altoE);
ck('alto: 実音Bb→記譜G', theory.altoBb==='G', theory.altoBb);
ck('tenor: 実音C→記譜D', theory.tenorC==='D', theory.tenorC);
ck('tenor: 実音B→記譜C#', theory.tenorB==='C#', theory.tenorB);
ck('運指 D = 123|123', theory.fingD==='L1,L2,L3,R1,R2,R3', theory.fingD);
ck('運指 低いBb', theory.fingLowBb==='L1,L2,L3,R1,R2,R3,bbL', theory.fingLowBb);
ck('運指 D5 = oct+123|123', theory.fingD5==='L1,L2,L3,R1,R2,R3,oct', theory.fingD5);
ck('運指 ハイF = oct+パーム3つ', theory.fingHighF==='oct,palmD,palmEb,palmF', theory.fingHighF);
ck('58-90 に運指の穴なし', theory.allRange.length===0, JSON.stringify(theory.allRange));
ck('voiceChord は上行', JSON.stringify(theory.voice)===JSON.stringify([70,74,77,80]), JSON.stringify(theory.voice));
ck('広いコードも音域内に収まる', theory.wide.every(m => m>=58 && m<=90), JSON.stringify(theory.wide));

// --- 2. ピッチ検出 ---
const pitch = await page.evaluate(() => {
  const S = window.SaxChord;
  const sr = 44100;
  const mk = (f, harm) => {
    const b = new Float32Array(4096);
    for (let i=0;i<b.length;i++){
      let v = Math.sin(2*Math.PI*f*i/sr);
      if (harm) v += 0.9*Math.sin(2*Math.PI*2*f*i/sr) + 0.7*Math.sin(2*Math.PI*3*f*i/sr) + 0.4*Math.sin(2*Math.PI*4*f*i/sr);
      b[i] = v*0.25;
    }
    return b;
  };
  const r = {};
  r.a440 = S.detectPitch(mk(440,false), sr).freq;
  r.reedy220 = S.detectPitch(mk(220,true), sr).freq;   // 倍音の強いリード音（オクターブ誤検出しやすい）
  r.reedy622 = S.detectPitch(mk(622.25,true), sr).freq;
  r.silence = S.detectPitch(new Float32Array(4096), sr).freq;
  return r;
});
ck('440Hz を検出', Math.abs(pitch.a440-440) < 2, pitch.a440);
ck('倍音つき220Hz を検出（オクターブ誤検出なし）', Math.abs(pitch.reedy220-220) < 2, pitch.reedy220);
ck('倍音つき622Hz を検出', Math.abs(pitch.reedy622-622.25) < 4, pitch.reedy622);
ck('無音は0', pitch.silence===0, pitch.silence);

// --- 3. UI 動作 ---
await page.click('[data-mode="tones"]');
await page.waitForSelector('.pc-grid');
let sel = await page.evaluate(() => {
  const q = window.SaxChord.Quiz.q;
  return { label: q.chord.label, pcs: q.wt.map(t=>t.pc) };
});
for (const pc of sel.pcs) await page.click(`.pc-btn[data-pc="${pc}"]`);
await page.waitForSelector('.answer-panel.ok', { timeout: 3000 }).catch(()=>{});
ck('コード→構成音: 正解で答えパネル', await page.locator('.answer-panel.ok').count() === 1);
ck('答えパネルに運指図がある', await page.locator('.answer-panel .fcard .fing').count() === sel.pcs.length);
await page.screenshot({ path: path.join(SHOTS, 'shot-tones.png'), fullPage: true });

// 不正解のパス
await page.click('#ap-next');
await page.waitForTimeout(120);
const wrongPc = await page.evaluate(() => {
  const q = window.SaxChord.Quiz.q; const used = new Set(q.wt.map(t=>t.pc));
  for (let i=0;i<12;i++) if(!used.has(i)) return i;
});
await page.click(`.pc-btn[data-pc="${wrongPc}"]`);
await page.click('#pc-check');
await page.waitForTimeout(150);
ck('わざと間違えると不正解パネル', await page.locator('.answer-panel.ng').count() === 1);
ck('不正解でも正解キーが緑', await page.locator('.pc-btn.right').count() >= 3);

// 度数モード
await page.click('[data-nav="home"]'); await page.click('[data-mode="degree"]');
await page.waitForSelector('.pc-grid');
const dpc = await page.evaluate(() => { const q=window.SaxChord.Quiz.q; return q.wt.find(t=>t.deg===q.deg).pc; });
await page.click(`.pc-btn[data-pc="${dpc}"]`);
await page.waitForTimeout(150);
ck('度数クイズ: 正解', await page.locator('.answer-panel.ok').count() === 1);

// コード名モード
await page.click('[data-nav="home"]'); await page.click('[data-mode="name"]');
await page.waitForSelector('.choice-grid');
const label = await page.evaluate(() => window.SaxChord.Quiz.q.chord.label);
await page.click(`.choice[data-choice="${label.replace(/"/g,'')}"]`);
await page.waitForTimeout(150);
ck('コード名クイズ: 正解', await page.locator('.answer-panel.ok').count() === 1);
ck('4択が4つ', await page.locator('.choice').count() === 4);

// 運指モード（両方のサブモードを踏む）
let sawRead=false, sawMake=false;
await page.click('[data-nav="home"]'); await page.click('[data-mode="fingering"]');
for (let i=0;i<8;i++){
  const sub = await page.evaluate(() => window.SaxChord.Quiz.q.sub);
  const midi = await page.evaluate(() => window.SaxChord.Quiz.q.midi);
  if (sub==='read'){ sawRead=true; await page.click(`.pc-btn[data-pc="${midi%12}"]`); }
  else { sawMake=true; await page.click(`.fchoice[data-fmidi="${midi}"]`); }
  await page.waitForTimeout(120);
  if (await page.locator('.answer-panel').count()!==1) { fail.push('運指モードで答えパネルが出ない'); break; }
  await page.click('#ap-next'); await page.waitForTimeout(100);
}
ck('運指クイズ: 運指→音名', sawRead);
ck('運指クイズ: 音名→運指', sawMake);

// 実音出題モードでの整合性（アルト: 実音Cmaj7 → 記譜 A C# E G#）
await page.evaluate(() => {
  localStorage.setItem('saxchord.v1', JSON.stringify({ settings: { instrument:'alto', chartPitch:'concert', types:['maj7'], roots:['C'], a4:442, sound:false } }));
});
await page.reload({ waitUntil: 'load' });
await page.click('[data-mode="tones"]');
await page.waitForTimeout(200);
const cres = await page.evaluate(() => { const q=window.SaxChord.Quiz.q; return { label:q.chord.label, written:q.wt.map(t=>t.name).join(' ') }; });
ck('実音モード: 実音Cmaj7 → 記譜 A C# E G#', cres.label==='Cmaj7' && cres.written==='A C# E G#', JSON.stringify(cres));
await page.screenshot({ path: path.join(SHOTS, 'shot-concert.png'), fullPage: true });

// 運指表 / チューナー / 成績 / 設定
await page.click('[data-nav="home"]'); await page.click('[data-nav="chart"]');
await page.waitForTimeout(200);
ck('運指表 33音ぶん', await page.locator('.chart-cell').count() === 33);
await page.screenshot({ path: path.join(SHOTS, 'shot-chart.png'), fullPage: true });
await page.click('[data-nav="home"]'); await page.click('[data-nav="stats"]');
await page.waitForTimeout(150);
ck('成績画面が出る', await page.locator('.stat-top').count() === 1);
await page.click('[data-nav="home"]'); await page.click('[data-nav="settings"]');
await page.waitForTimeout(150);
ck('設定にコード一覧', await page.locator('.chk[class*="chk"] .chk-name').count() >= 24);
await page.click('[data-inst="tenor"]');
await page.waitForTimeout(150);
ck('楽器を切り替えられる', (await page.locator('#inst-badge').textContent()).includes('テナー'));
await page.screenshot({ path: path.join(SHOTS, 'shot-settings.png'), fullPage: true });

// マイク（権限つき）で「吹いて答える」画面が立ち上がるか
const ctx2 = await browser.newContext({ viewport:{width:420,height:900}, permissions:['microphone'] });
const p2 = await ctx2.newPage();
const errs2 = [];
p2.on('pageerror', e => errs2.push('PAGEERROR: ' + e.message));
await p2.goto('http://localhost:8931/index.html');
await p2.evaluate(() => localStorage.removeItem('saxchord.v1'));
await p2.reload({ waitUntil: 'load' }); await p2.waitForTimeout(300);
await p2.click('[data-mode="play"]');
await p2.waitForTimeout(800);
ck('吹いて答える: ターゲット表示', await p2.locator('.play-target .fing').count() === 1);
ck('吹いて答える: 運指チップ', await p2.locator('.pchip').count() >= 3);
await p2.screenshot({ path: path.join(SHOTS, 'shot-play.png'), fullPage: true });


// --- 4. 総当たりの健全性チェック（全コードタイプ × 全ルート）---
const stress = await page.evaluate(() => {
  const S = window.SaxChord;
  const roots = ["C","Db","C#","D","Eb","E","F","F#","Gb","G","Ab","A","Bb","B"];
  const bad = [];
  const types = window.__TYPES;
  for (const r of roots) for (const t of types) {
    let ch;
    try { ch = S.buildChord(r, t); } catch (e) { bad.push(r + t.suffix + ": throw " + e.message); continue; }
    const pcs = new Set(ch.tones.map((x) => x.pc));
    if (pcs.size !== ch.tones.length) bad.push(r + t.suffix + ": 同じ音が重複");
    for (const tone of ch.tones) {
      if (/(#{3,}|b{3,})/.test(tone.name)) bad.push(r + t.suffix + ": 三重変化 " + tone.name);
      if (!/^[A-G](#{1,2}|b{1,2})?$/.test(tone.name)) bad.push(r + t.suffix + ": 綴り異常 " + tone.name);
    }
    // 記譜（アルト/テナー）に移調しても運指が存在するか
    for (const [semi, step] of [[0,0],[9,5],[2,1]]) {
      const midis = S.voiceChord(ch.tones.map((x) => ({ pc: (x.pc + semi) % 12 })));
      for (const m of midis) if (!S.fingeringFor(m)) bad.push(r + t.suffix + " (+" + semi + "): 運指なし midi=" + m);
    }
  }
  return bad;
});
ck('全コード×全ルートで綴り・運指が破綻しない', stress.length === 0, stress.slice(0,6).join(' / '));

// 4択に重複が出ない（設定を 1 種類だけに絞った状態でも）
await page.evaluate(() => {
  localStorage.setItem('saxchord.v1', JSON.stringify({ settings: { instrument:'alto', chartPitch:'written', types:['maj7'], roots:['C'], sound:false } }));
});
await page.reload({ waitUntil: 'load' });
await page.click('[data-mode="name"]');
await page.waitForSelector('.choice-grid');
const choices = await page.$$eval('.choice', els => els.map(e => e.dataset.choice));
ck('4択に重複がない', new Set(choices).size === 4, JSON.stringify(choices));
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'load' });


// --- 5. マイク感度 ---
const sens = await page.evaluate(() => {
  const S = window.SaxChord;
  const sr = 44100;
  const mk = (amp) => {
    const b = new Float32Array(4096);
    for (let i = 0; i < b.length; i++) b[i] = amp * (Math.sin(2*Math.PI*330*i/sr) + 0.8*Math.sin(2*Math.PI*660*i/sr));
    return b;
  };
  const quiet = mk(0.004);            // かなり小さい音（RMS ≈ 0.0036）
  return {
    strictGate: S.detectPitch(quiet, sr, { gate: 0.012 }).freq,   // 従来のしきい値だと落ちる
    looseGate:  S.detectPitch(quiet, sr, { gate: 0.001, peakMin: 0.2 }).freq,
    defaultGate: S.settings().micGate,
    stillGated: S.detectPitch(quiet, sr, { gate: 0.012 }).gated === true
  };
});
ck('小さい音は厳しいしきい値だと弾かれる', sens.strictGate === 0 && sens.stillGated, JSON.stringify(sens));
ck('しきい値を下げれば同じ小さい音を検出できる', Math.abs(sens.looseGate - 330) < 3, sens.looseGate);
ck('初期値は以前(0.012)より敏感', sens.defaultGate < 0.012, sens.defaultGate);

await page.click('[data-nav="home"]'); await page.click('[data-nav="settings"]');
await page.waitForSelector('.mic-cal');
ck('設定に感度パネルがある', await page.locator('.mic-cal .sens').count() === 5);
ck('自動調整ボタンがある', await page.locator('#mic-auto').count() === 1);
const before = await page.evaluate(() => window.SaxChord.settings().micGate);
await page.click('.sens[data-sens="5"]');
await page.waitForTimeout(120);
const after = await page.evaluate(() => ({ gate: window.SaxChord.settings().micGate, clarity: window.SaxChord.settings().micClarity }));
ck('感度5でしきい値が下がる', after.gate < before, JSON.stringify({before, after}));
ck('感度5でクリアリティ条件も緩む', after.clarity < 0.5, after.clarity);
ck('選んだ段階がボタンに反映される', await page.locator('.sens.on[data-sens="5"]').count() === 1);
await page.click('.sens[data-sens="1"]');
await page.waitForTimeout(120);
ck('感度1でしきい値が上がる', await page.evaluate(() => window.SaxChord.settings().micGate) > after.gate);
ck('感度は保存される', await page.evaluate(() => JSON.parse(localStorage.getItem('saxchord.v1')).settings.micGate) > 0.02);
// メーターのしきい値マーカーが動く
const thPos = await page.evaluate(() => document.querySelector('#mic-meter-th').style.left);
ck('しきい値マーカーが表示される', /%$/.test(thPos), thPos);
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'load' });


// --- 6. マイク経路の通し確認（Chromium の疑似オーディオデバイスを使う） ---
// 疑似デバイスは断続的なビープを鳴らす。getUserMedia → 解析 → 表示までが繋がっているか見る。
const micBrowser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const micCtx = await micBrowser.newContext({ viewport: { width: 420, height: 960 }, permissions: ['microphone'] });
const p3 = await micCtx.newPage();
const errs3 = [];
p3.on('pageerror', e => errs3.push('PAGEERROR: ' + e.message));
await p3.goto('http://localhost:8931/index.html');
await p3.click('[data-nav="tuner"]');
await p3.waitForTimeout(600);
ck('マイクが開ける', await p3.evaluate(() => window.SaxChord.mic().running === true && !window.SaxChord.mic().err));
ck('チューナーに感度パネルが出る', await p3.locator('.mic-cal .sens').count() === 5);

let heardNote = null, meterMoved = false;
for (let i = 0; i < 45 && !heardNote; i++) {
  const f = await p3.evaluate(() => ({
    note: document.querySelector('#tuner-note')?.textContent,
    cents: document.querySelector('#tuner-cents')?.textContent,
    over: document.querySelector('#mic-meter-fill')?.classList.contains('over')
  }));
  if (f.over) meterMoved = true;
  if (f.note && f.note !== '—') heardNote = f.note + ' / ' + f.cents;
  await p3.waitForTimeout(100);
}
ck('入力レベルメーターがしきい値を超えて反応する', meterMoved);
ck('鳴っている音を検出して音名を表示する', !!heardNote, String(heardNote));
// 疑似デバイスは約 400Hz。A=442 なら G4 の +29 セント前後になるはず
ck('音名とセントが正しい', /^G4/.test(heardNote || '') && /\+2\d|\+3\d/.test(heardNote || ''), String(heardNote));
ck('マイク画面で JS エラーが出ない', errs3.length === 0, JSON.stringify(errs3));
await micBrowser.close();

ck('JSエラーなし', errs.length===0 && errs2.length===0, JSON.stringify(errs.concat(errs2)));

await browser.close(); server.close();
console.log(fail.length ? '\nFAILED: ' + fail.length : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
