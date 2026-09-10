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
await page.goto('http://localhost:8931/index.html', { waitUntil: 'domcontentloaded' });
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
ck('答えパネルに運指図がある', await page.locator('.answer-panel .fcard .fk').count() === sel.pcs.length);
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
await page.reload({ waitUntil: 'domcontentloaded' });
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
await page.click('[data-nav="home"]'); await page.click('#tb-settings');
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
await p2.goto('http://localhost:8931/index.html', { waitUntil: 'domcontentloaded' });
await p2.evaluate(() => localStorage.removeItem('saxchord.v1'));
await p2.reload({ waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(300);
await p2.click('[data-mode="play"]');
await p2.waitForTimeout(800);
ck('吹いて答える: ターゲット表示', await p2.locator('.play-target .fk').count() === 1);
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
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('[data-mode="name"]');
await page.waitForSelector('.choice-grid');
const choices = await page.$$eval('.choice', els => els.map(e => e.dataset.choice));
ck('4択に重複がない', new Set(choices).size === 4, JSON.stringify(choices));
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });


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

await page.click('[data-nav="home"]'); await page.click('#tb-settings');
await page.waitForSelector('.mic-cal');
ck('設定に感度パネルがある（7段階）', await page.locator('.mic-cal .sens').count() === 7);
ck('自動調整ボタンがある', await page.locator('#mic-auto').count() === 1);
const before = await page.evaluate(() => window.SaxChord.settings().micGate);
await page.click('.sens[data-sens="7"]');
await page.waitForTimeout(120);
const after = await page.evaluate(() => ({ gate: window.SaxChord.settings().micGate, clarity: window.SaxChord.settings().micClarity }));
ck('最高感度でしきい値が大きく下がる', after.gate < before / 10, JSON.stringify({before, after}));
ck('最高感度でクリアリティ条件も緩む', after.clarity < 0.3, after.clarity);
ck('選んだ段階がボタンに反映される', await page.locator('.sens.on[data-sens="7"]').count() === 1);
// 最高感度で拾える音量が、旧・最高感度(5)より小さいこと
const reach = await page.evaluate(() => {
  const S = window.SaxChord, sr = 44100;
  const mk = (amp) => { const b = new Float32Array(4096);
    for (let i=0;i<b.length;i++) b[i] = amp * Math.sin(2*Math.PI*330*i/sr); return b; };
  const tiny = mk(0.0004);   // RMS ≈ 0.00028。ほとんど聞こえない大きさ
  return { lv5: S.detectPitch(tiny, sr, { gate: 0.0011, peakMin: 0.2 }).freq,
           lv7: S.detectPitch(tiny, sr, { gate: 0.00014, peakMin: 0.14 }).freq };
});
ck('感度5では拾えない極小音を感度7では拾える', reach.lv5 === 0 && Math.abs(reach.lv7 - 330) < 3, JSON.stringify(reach));
await page.click('.sens[data-sens="1"]');
await page.waitForTimeout(120);
ck('感度1でしきい値が上がる', await page.evaluate(() => window.SaxChord.settings().micGate) > after.gate);
// 上部バッジからのクイック切替
await page.click('#inst-badge');
await page.waitForSelector('#quick-sheet:not([hidden])');
ck('バッジから楽器シートが開く', await page.locator('#quick-sheet [data-inst]').count() === 4);
await page.click('#quick-sheet [data-inst="tenor"]');
await page.waitForTimeout(150);
ck('シートでテナーに切り替わる', /テナー/.test(await page.locator('#inst-badge').textContent()));
ck('切替後もシートは開いたまま', await page.locator('#quick-sheet [data-pitch]').count() === 2);
ck('テナーならB♭譜と表示', /B♭譜/.test(await page.locator('#quick-sheet [data-pitch="written"]').textContent()));
await page.click('#quick-sheet [data-close]');
await page.waitForTimeout(100);
ck('シートを閉じられる', await page.locator('#quick-sheet[hidden]').count() === 1);
ck('感度は保存される', await page.evaluate(() => JSON.parse(localStorage.getItem('saxchord.v1')).settings.micGate) > 0.02);
// メーターのしきい値マーカーが動く
const thPos = await page.evaluate(() => document.querySelector('#mic-meter-th').style.left);
ck('しきい値マーカーが表示される', /%$/.test(thPos), thPos);
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });


// --- 6. マイク経路の通し確認（Chromium の疑似オーディオデバイスを使う） ---
// 疑似デバイスは断続的なビープを鳴らす。getUserMedia → 解析 → 表示までが繋がっているか見る。
const micBrowser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const micCtx = await micBrowser.newContext({ viewport: { width: 420, height: 960 }, permissions: ['microphone'] });
const p3 = await micCtx.newPage();
const errs3 = [];
p3.on('pageerror', e => errs3.push('PAGEERROR: ' + e.message));
await p3.goto('http://localhost:8931/index.html', { waitUntil: 'domcontentloaded' });
await p3.click('[data-nav="tuner"]');
await p3.waitForTimeout(600);
ck('マイクが開ける', await p3.evaluate(() => window.SaxChord.mic().running === true && !window.SaxChord.mic().err));
ck('チューナーに感度パネルが出る', await p3.locator('.mic-cal .sens').count() === 7);

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


// --- 7. C譜 / 移調譜の切り替え ---
async function useSettings(o) {
  await page.evaluate((s) => localStorage.setItem('saxchord.v1', JSON.stringify({ settings: s })), o);
  await page.reload({ waitUntil: 'domcontentloaded' });
}
const badgeOf = async (mode) => {
  await page.click('[data-nav="home"]');
  await page.click(`[data-mode="${mode}"]`);
  await page.waitForSelector('.qcard');
  return (await page.locator('.qcard .badge').first().textContent()).trim();
};

await useSettings({ instrument:'alto', chartPitch:'written', types:['maj7'], roots:['C'], sound:false });
ck('アルト＋自分のパート譜 → E♭譜と表示', (await badgeOf('tones')) === 'E♭譜（あなたの譜面）', await badgeOf('tones'));

await useSettings({ instrument:'tenor', chartPitch:'written', types:['maj7'], roots:['C'], sound:false });
ck('テナー → B♭譜と表示', (await badgeOf('tones')) === 'B♭譜（あなたの譜面）');

await useSettings({ instrument:'alto', chartPitch:'concert', types:['maj7'], roots:['C'], sound:false });
ck('C譜モード → C譜（実音）と表示', (await badgeOf('tones')) === 'C譜（実音）');

// 楽器はサックス 4 種だけ（「移調なし」は罠になるので置かない）
await page.click('[data-nav="home"]'); await page.click('#tb-settings');
await page.waitForSelector('[data-inst]');
const insts = await page.$$eval('[data-inst]', els => els.map(e => e.dataset.inst));
ck('楽器はサックス4種', JSON.stringify(insts) === JSON.stringify(['alto','tenor','soprano','bari']), JSON.stringify(insts));
ck('移調なしのC管は出さない', !insts.includes('c'));
ck('C譜の案内がある', /楽器は自分の楽器のまま/.test(await page.locator('#settings-wrap').textContent()));

// テナーで C譜 を読む場合、運指はテナーのもの（実音そのままにはしない）
await useSettings({ instrument:'tenor', chartPitch:'concert', types:['maj7'], roots:['C'], sound:false });
await page.click('[data-mode="tones"]');
await page.waitForSelector('.qcard');
const tenorC = await page.evaluate(() => {
  const q = window.SaxChord.Quiz.q;
  return { label: q.chord.label, written: q.wt.map(t => t.name).join(' ') };
});
ck('テナーでC譜のCmaj7は記譜 D F# A C#', tenorC.label === 'Cmaj7' && tenorC.written === 'D F# A C#', JSON.stringify(tenorC));

await useSettings({ instrument:'alto', chartPitch:'written', types:['maj7'], roots:['C'], sound:false });
await page.click('#tb-settings');
await page.waitForSelector('[data-pitch]');
const segs = await page.$$eval('[data-pitch]', els => els.map(e => e.textContent.trim()));
ck('設定に C譜 の選択肢が名前つきで出る', segs.some(x => /^C譜/.test(x)) && segs.some(x => /^E♭譜/.test(x)), JSON.stringify(segs));
await page.click('[data-pitch="concert"]');
await page.waitForTimeout(150);
ck('C譜を選ぶと保存される', await page.evaluate(() => JSON.parse(localStorage.getItem('saxchord.v1')).settings.chartPitch) === 'concert');
ck('ホームの説明もC譜になる', /C譜/.test(await page.locator('#home-note').textContent()));
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });


// --- 8. 画面の作り（トップバー・使い方・運指図） ---
await page.click('[data-nav="home"]');
await page.waitForTimeout(150);
ck('ホームでは設定ボタンだけ', await page.locator('#tb-settings').isVisible()
  && !(await page.locator('#tb-home').isVisible()) && !(await page.locator('#tb-back').isVisible())
  && !(await page.locator('#tb-help').isVisible()));
await page.click('[data-mode="degree"]');
await page.waitForSelector('.qcard');
ck('クイズ画面はホームと使い方ボタン', await page.locator('#tb-home').isVisible() && await page.locator('#tb-help').isVisible());
ck('クイズ画面に設定ボタンは出さない', !(await page.locator('#tb-settings').isVisible()));
await page.click('#tb-help');
await page.waitForSelector('#screen-help.active');
ck('使い方ページが開く', (await page.locator('.help-h').count()) >= 4);
ck('使い方に運指図の例がある', await page.locator('.help-fing .fk').count() === 1);
ck('運指図のキーの説明がある', /パームキー/.test(await page.locator('#help-wrap').textContent())
  && /オクターブキー/.test(await page.locator('#help-wrap').textContent()));
ck('使い方では戻るボタンだけ', await page.locator('#tb-back').isVisible()
  && !(await page.locator('#tb-settings').isVisible()) && !(await page.locator('#tb-help').isVisible())
  && !(await page.locator('#tb-home').isVisible()));
await page.click('#tb-back');
await page.waitForTimeout(200);
ck('使い方から元のクイズに戻る', await page.locator('#screen-quiz.active').count() === 1);
await page.click('#tb-home'); await page.waitForTimeout(150);
await page.click('#tb-settings');
await page.waitForSelector('#screen-settings.active');
ck('設定画面では設定ボタンが消えて戻るになる', !(await page.locator('#tb-settings').isVisible())
  && await page.locator('#tb-back').isVisible());
await page.click('#tb-back'); await page.waitForTimeout(150);
ck('戻るでホームに戻る', await page.locator('#screen-home.active').count() === 1);
ck('ホームの見出し説明を削除', await page.locator('.hero').count() === 0);
ck('ブランドマークを削除', await page.locator('.brand-mark').count() === 0);

// 運指図：元の画像をそのまま使い、押さえるキーだけ塗る
const fig = await page.evaluate(() => {
  const mk = (m) => {
    const d = document.createElement('div');
    d.innerHTML = window.SaxChord.__svg(m);
    return { hi: d.querySelectorAll('.fk-hi .fk-on').length,
             base: d.querySelectorAll('.fk-base').length,
             note: (d.querySelector('.fk-note') || {}).textContent || '' };
  };
  return { open: mk(73), d: mk(62), bis: mk(70), lowBb: mk(58), hiE: mk(88), sideC: mk(72) };
});
ck('運指図は元画像を土台にする', fig.d.base === 1, JSON.stringify(fig.d));
ck('C♯（オールオープン）は塗りなし', fig.open.hi === 0 && fig.open.note === '', JSON.stringify(fig.open));
ck('D は主要6キーを塗る', fig.d.hi === 6, JSON.stringify(fig.d));
ck('B♭(bis) は2キー', fig.bis.hi === 2, JSON.stringify(fig.bis));
ck('低B♭は絵に無い小指キーを文字で補う', fig.lowBb.hi === 6 && /低B♭/.test(fig.lowBb.note), JSON.stringify(fig.lowBb));
ck('ハイEはオクターブ＋パーム2つ＋サイドの塊', fig.hiE.hi === 4 && /側面E/.test(fig.hiE.note), JSON.stringify(fig.hiE));

// --- 9. 配色テーマ ---
await page.click('#tb-settings');
await page.waitForSelector('.pal-row');
ck('配色は4案', await page.locator('.pal').count() === 4);
ck('既定は藍（属性なし）', await page.evaluate(() => !document.documentElement.hasAttribute('data-palette')));
const bgDefault = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ck('既定の背景は藍のもの', bgDefault === 'rgb(242, 244, 248)', bgDefault);
await page.click('.pal[data-pal="brass"]');
await page.waitForTimeout(150);
ck('配色を変えると属性が付く', await page.evaluate(() => document.documentElement.getAttribute('data-palette')) === 'brass');
ck('配色が保存される', await page.evaluate(() => JSON.parse(localStorage.getItem('saxchord.v1')).settings.palette) === 'brass');
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ck('実際に色が変わる', bg === 'rgb(246, 244, 239)', bg);
await page.click('.pal[data-pal="midnight"]');
await page.waitForTimeout(120);
ck('既定に戻すと属性が外れる', await page.evaluate(() => document.documentElement.hasAttribute('data-palette')) === false);
// ライトのみ：端末がダークでも明るいまま
const darkCtx = await browser.newContext({ viewport: { width: 420, height: 900 }, colorScheme: 'dark' });
const pd = await darkCtx.newPage();
await pd.goto('http://localhost:8931/index.html', { waitUntil: 'domcontentloaded' });
const darkBg = await pd.evaluate(() => getComputedStyle(document.body).backgroundColor);
const darkInk = await pd.evaluate(() => getComputedStyle(document.body).color);
ck('端末がダークでもライトのまま', darkBg === 'rgb(242, 244, 248)' && darkInk === 'rgb(22, 28, 40)', darkBg + ' / ' + darkInk);
await darkCtx.close();

// --- 10. 吹いて答える：誤検出で勝手に進まない ---
const guard = await page.evaluate(() => {
  const A = window.SaxChord;
  return { acceptClarity: A.acceptRules().clarity, frames: A.acceptRules().frames, grace: A.acceptRules().grace };
});
ck('判定は感度設定より厳しい下限を使う', guard.acceptClarity >= 0.6, JSON.stringify(guard));
ck('判定には連続フレームが必要', guard.frames >= 6, JSON.stringify(guard));
ck('音が変わった直後は判定しない猶予がある', guard.grace >= 300, JSON.stringify(guard));


// --- 11. 鳴らす音（オフラインで実際にレンダリングして中身を確かめる） ---
const sound = await page.evaluate(async () => {
  const sr = 44100, len = sr * 1.2;
  const oc = new OfflineAudioContext(1, len, sr);
  window.SaxChord.saxNote(440, 0, 0.9, 0.2, oc);
  const buf = await oc.startRendering();
  const d = buf.getChannelData(0);
  // 立ち上がり・持続・減衰
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / (b - a)); };
  // 倍音の強さ（1〜6 倍音）を素朴な相関で測る
  const seg = 8192, off = Math.floor(sr * 0.35);
  const mag = (f) => {
    let re = 0, im = 0;
    for (let i = 0; i < seg; i++) {
      const t = (off + i) / sr, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / seg);
      re += d[off + i] * w * Math.cos(2 * Math.PI * f * t);
      im += d[off + i] * w * Math.sin(2 * Math.PI * f * t);
    }
    return Math.sqrt(re * re + im * im) / seg;
  };
  const h = [1, 2, 3, 4, 5, 6].map((n) => mag(440 * n));
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  return {
    attack: rms(0, 400), body: rms(Math.floor(sr * 0.3), Math.floor(sr * 0.5)),
    tail: rms(Math.floor(sr * 1.05), Math.floor(sr * 1.15)),
    peak, h, pitch: window.SaxChord.detectPitch(d.slice(off, off + 4096), sr, { gate: 0.001 }).freq
  };
});
ck('音が出ている', sound.body > 0.02, JSON.stringify({ body: sound.body }));
ck('音割れしていない', sound.peak < 1.0, sound.peak);
ck('立ち上がりがある（いきなり最大にならない）', sound.attack < sound.body, JSON.stringify({a: sound.attack, b: sound.body}));
ck('音が終わる', sound.tail < sound.body * 0.2, JSON.stringify({t: sound.tail, b: sound.body}));
ck('鳴らした音程が正しい', Math.abs(sound.pitch - 440) < 6, sound.pitch);
ck('倍音が並んでいる（サイン波ではない）', sound.h[1] > sound.h[0] * 0.25 && sound.h[2] > sound.h[0] * 0.15, JSON.stringify(sound.h.map(x=>+x.toFixed(4))));
ck('高い倍音ほど弱い', sound.h[5] < sound.h[1], JSON.stringify(sound.h.map(x=>+x.toFixed(4))));


// --- 12. 吹いて答える：音を隠すモードと通し再生 ---
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('[data-mode="play"]');
await page.waitForSelector('#play-body .qcard');
ck('通常は構成音が見えている', (await page.locator('.pchip-q').count()) === 0
  && (await page.locator('.play-target .fk').count()) === 1);
await page.click('#play-hidemode');
await page.waitForTimeout(200);
const hidden = await page.evaluate(() => ({
  chord: document.querySelector('#play-body .q-main').textContent,
  qs: document.querySelectorAll('.pchip-q').length,
  notes: document.querySelectorAll('.play-target .fk').length,
  target: (document.querySelector('.pt-note') || {}).textContent,
  saved: JSON.parse(localStorage.getItem('saxchord.v1')).settings.playHide
}));
ck('音を隠すとコード名だけになる', hidden.chord.length > 0 && hidden.qs >= 3 && hidden.notes === 0, JSON.stringify(hidden));
ck('隠しているとき目標の音名も出ない', hidden.target === '?', JSON.stringify(hidden));
ck('隠しモードは保存される', hidden.saved === true);
await page.click('#play-hint');
await page.waitForTimeout(200);
ck('ヒントで音名と運指が出る', (await page.locator('.play-target .fk').count()) === 1
  && (await page.locator('.pt-note').textContent()) !== '?');
await page.click('#play-hidemode');
await page.waitForTimeout(150);
ck('隠しモードを戻せる', (await page.locator('.pchip-q').count()) === 0);

// 通しのリズム再生（実際にレンダリングして、音の数と長さの並びを見る）
const lick = await page.evaluate(async () => {
  const sr = 22050, oc = new OfflineAudioContext(1, sr * 3, sr);
  const A = window.SaxChord;
  [62, 65, 69, 72].forEach((m, i) => {
    const last = i === 3;
    A.saxNote(440 * Math.pow(2, (m - 69) / 12), i * 0.19, last ? 0.8 : 0.13, last ? 0.2 : 0.18, oc);
  });
  const d = (await oc.startRendering()).getChannelData(0);
  // 音が鳴っている区間を数える
  const win = Math.floor(sr * 0.01);
  const env = [];
  for (let i = 0; i + win < d.length; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += d[i + j] * d[i + j];
    env.push(Math.sqrt(s / win));
  }
  const th = Math.max(...env) * 0.12;
  const runs = []; let on = false, st = 0;
  env.forEach((v, i) => {
    if (v > th && !on) { on = true; st = i; }
    else if (v <= th && on) { on = false; runs.push((i - st) * 0.01); }
  });
  if (on) runs.push((env.length - st) * 0.01);
  return runs.map(x => +x.toFixed(2));
});
ck('通し再生は4音鳴る', lick.length === 4, JSON.stringify(lick));
ck('最後だけ長い（たたたん）', lick.length === 4 && lick[3] > lick[0] * 2, JSON.stringify(lick));


// --- 13. コード表 ---
await page.evaluate(() => localStorage.removeItem('saxchord.v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('[data-nav="chords"]');
await page.waitForSelector('#screen-chords.active .cdetail');
ck('コード表にルート14個', await page.locator('.root-btn').count() === 14);
ck('コード表に全コードタイプ', await page.locator('.ctype').count() === 24);
ck('コード表では戻るボタン', await page.locator('#tb-back').isVisible() && !(await page.locator('#tb-settings').isVisible()));
await page.click('.root-btn[data-croot="Eb"]');
await page.click('.ctype[data-ctype="m7b5"]');
await page.waitForTimeout(200);
const ct = await page.evaluate(() => ({
  title: document.querySelector('.cdetail .ap-chord').textContent,
  tones: [...document.querySelectorAll('.cdetail .ap-line .tone')].map(e => e.textContent),
  figs: document.querySelectorAll('.cdetail .fcard .fk').length,
  quizSame: document.querySelectorAll('.cdetail .fcard .fk-base').length
}));
ck('選んだコードが出る', /E♭m7\(♭5\)/.test(ct.title), ct.title);
ck('構成音は E♭ G♭ B𝄫 D♭', ct.tones.length === 4 && /E♭/.test(ct.tones[0]) && /D♭/.test(ct.tones[3]), JSON.stringify(ct.tones));
ck('構成音ぶんの運指図が出る', ct.figs === 4, JSON.stringify(ct));
ck('運指図はクイズと同じ仕組み', ct.quizSame === 4, JSON.stringify(ct));
// そのまま吹く練習へ渡せる
await page.click('#ct-blow');
await page.waitForTimeout(300);
ck('「これを吹く」で吹いて答えるに移る', await page.locator('#screen-play.active').count() === 1
  && /E♭m7/.test(await page.locator('#play-body .q-main').textContent()));


// --- 14. 配信まわり（古いキャッシュで画面が空になるのを防ぐ） ---
const shipping = await page.evaluate(async () => {
  const html = await (await fetch('index.html', { cache: 'no-store' })).text();
  const js = (html.match(/src="app\.js\?v=(\d+)"/) || [])[1];
  const css = (html.match(/href="styles\.css\?v=(\d+)"/) || [])[1];
  const sw = await (await fetch('sw.js', { cache: 'no-store' })).text();
  return { js, css, swNoCache: /cache: "no-cache"/.test(sw), swReload: /cache: "reload"/.test(sw),
           ignoreSearch: /ignoreSearch/.test(sw), updateViaCache: /updateViaCache/.test(html) };
});
ck('app.js にバージョンが付いている', !!shipping.js, JSON.stringify(shipping));
ck('styles.css にも同じバージョン', shipping.css === shipping.js, JSON.stringify(shipping));
ck('SW はサーバに必ず確認する', shipping.swNoCache && shipping.swReload, JSON.stringify(shipping));
ck('オフライン時はクエリを無視して拾う', shipping.ignoreSearch, JSON.stringify(shipping));
// コード表が空にならないこと（今回の不具合の再発防止）
await page.click('[data-nav="home"]');
await page.click('[data-nav="chords"]');
await page.waitForTimeout(300);
const notEmpty = await page.evaluate(() => document.querySelector('#chords-wrap').children.length);
ck('コード表が空でない', notEmpty >= 3, String(notEmpty));

ck('JSエラーなし', errs.length===0 && errs2.length===0, JSON.stringify(errs.concat(errs2)));

await browser.close(); server.close();
console.log(fail.length ? '\nFAILED: ' + fail.length : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
