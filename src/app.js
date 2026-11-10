(() => {
'use strict';
const $ = id => document.getElementById(id);
const FONTS = ['Great Vibes','Allura','Sacramento','Mrs Saint Delafield','Herr Von Muellerhoff','Homemade Apple'];
const COLORS = ['#10141c','#1a3a9c'];
const toast = (m, ms = 2400) => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', ms); };
const open = id => $(id).classList.add('on');
const close = id => $(id).classList.remove('on');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Signature database (IndexedDB) ---------- */
const DB = {
  h: null, mem: new Map(),
  init() { return new Promise(res => { try {
    const r = indexedDB.open('sign-app', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sigs', { keyPath: 'id' });
    r.onsuccess = () => { DB.h = r.result; res(); };
    r.onerror = () => res();
  } catch { res(); } }); },
  tx(mode, fn) { return new Promise((res, rej) => {
    const t = DB.h.transaction('sigs', mode); const q = fn(t.objectStore('sigs'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  },
  all() { return DB.h ? DB.tx('readonly', s => s.getAll()) : Promise.resolve([...DB.mem.values()]); },
  put(r) { if (DB.h) return DB.tx('readwrite', s => s.put(r)); DB.mem.set(r.id, r); return Promise.resolve(); },
  del(id) { if (DB.h) return DB.tx('readwrite', s => s.delete(id)); DB.mem.delete(id); return Promise.resolve(); },
};
let sigs = [];
async function reload() { sigs = (await DB.all()).sort((a, b) => (b.used || 0) - (a.used || 0) || b.created - a.created); drawLib(); }
function drawLib() {
  const q = $('q').value.trim().toLowerCase(), lib = $('lib'); lib.textContent = '';
  const list = sigs.filter(s => s.name.toLowerCase().includes(q));
  if (!list.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = sigs.length ? 'No matches' : 'No signatures yet. Tap New signature.'; lib.append(d); return; }
  for (const s of list) {
    const t = document.createElement('div'); t.className = 'tile';
    const i = new Image(); i.src = s.src; i.alt = s.name;
    const r = document.createElement('div'); r.className = 'row';
    const n = document.createElement('div'); n.className = 'n'; n.textContent = s.name;
    const m = document.createElement('button'); m.className = 'more'; m.textContent = '⋯'; m.setAttribute('aria-label', 'Edit ' + s.name);
    m.onclick = () => editSig(s);
    m.onpointerdown = e => e.stopPropagation();
    r.append(n, m); t.append(i, r); lib.append(t);
    tileDrag(t, s);
  }
}
const stamp = (name, src, aspect, kind) => ({ id: uid(), name, src, aspect, kind, created: Date.now(), used: 0 });
let editing = null;
function editSig(s) { editing = s; $('editName').value = s.name; open('editS'); }
$('editCancel').onclick = () => close('editS');
$('editSave').onclick = async () => { editing.name = $('editName').value.trim() || editing.name; await DB.put(editing); close('editS'); reload(); };
$('editDel').onclick = async () => {
  const s = editing;
  if (s.gh && GH.cfg()) {
    try { await GH.req('contents/' + enc(s.gh), { method: 'DELETE', body: JSON.stringify({ message: 'Remove signature: ' + s.name, sha: s.sha, branch: GH.cfg().branch }) }); }
    catch (e) { if (e.status !== 404) return toast(ghErr(e) + ' Not deleted.', 4000); }
  }
  await DB.del(s.id); close('editS'); reload(); toast(s.gh ? 'Deleted here and on GitHub' : 'Signature deleted');
};
$('q').oninput = drawLib;

/* backup / restore */
$('backup').onclick = () => {
  if (!sigs.length) return toast('Nothing to back up yet');
  const blob = new Blob([JSON.stringify({ app: 'sign', v: 1, sigs })], { type: 'application/json' });
  ready(blob, 'signatures-backup.json', sigs.length + ' signatures');
};
$('restore').onclick = () => $('bakIn').click();
$('bakIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.sigs)) throw 0;
    let n = 0;
    for (const s of d.sigs) if (s.id && s.name && /^data:image\/png;base64,/.test(s.src || '') && s.aspect > 0) { await DB.put(s); n++; }
    reload(); toast(n + ' signatures restored');
  } catch { toast('That is not a signature backup'); }
};

/* ---------- Canvas helpers ---------- */
function trim(c) {
  const g = c.getContext('2d', { willReadFrequently: true }), { width: w, height: h } = c, d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const p = 6; x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
function colorRow(el, get, set) {
  const paint = () => [...el.children].forEach((b, i) => b.classList.toggle('on', COLORS[i] === get()));
  COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.style.marginRight = '8px'; b.setAttribute('aria-label', c === COLORS[0] ? 'Black ink' : 'Blue ink'); b.onclick = () => { set(c); paint(); }; el.append(b); });
  paint();
}

/* ---------- New signature: draw ---------- */
const pad = $('pad'); let strokes = [], cur = null, penSeen = false, drawColor = COLORS[0];
const PS = 3;
function sizePad() { const r = pad.getBoundingClientRect(); if (r.width) { pad.width = r.width * PS; pad.height = r.height * PS; redraw(); } }
function seg(g, s, i) {
  const p = s[i], a = s[i - 1], b = s[i - 2] || a;
  const m0 = { x: (b.x + a.x) / 2, y: (b.y + a.y) / 2, w: (b.w + a.w) / 2 }, m1 = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2, w: (a.w + p.w) / 2 };
  const n = Math.max(2, Math.ceil(Math.hypot(m1.x - m0.x, m1.y - m0.y) / 1.5));
  let lx = m0.x, ly = m0.y;
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t, x = u * u * m0.x + 2 * u * t * a.x + t * t * m1.x, y = u * u * m0.y + 2 * u * t * a.y + t * t * m1.y;
    g.lineWidth = (m0.w + (m1.w - m0.w) * t) * PS; g.beginPath(); g.moveTo(lx * PS, ly * PS); g.lineTo(x * PS, y * PS); g.stroke(); lx = x; ly = y;
  }
}
function dot(g, p) { g.beginPath(); g.arc(p.x * PS, p.y * PS, p.w * PS / 2, 0, 7); g.fill(); }
function style(g, c) { g.strokeStyle = g.fillStyle = c; g.lineCap = g.lineJoin = 'round'; }
function redraw(c = pad, color = drawColor) {
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); style(g, color);
  for (const s of strokes) { dot(g, s[0]); for (let i = 1; i < s.length; i++) seg(g, s, i); }
}
function addPoint(e) {
  const r = pad.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, last = cur[cur.length - 1];
  let target;
  if (e.pointerType === 'pen' && e.pressure > 0) target = 0.9 + e.pressure * 3.4;
  else { const v = last ? Math.hypot(x - last.x, y - last.y) : 0; target = clamp(3.4 - v * 0.09, 1.3, 3.4); }
  const w = last ? last.w + (target - last.w) * 0.35 : target;
  if (last && Math.hypot(x - last.x, y - last.y) < 0.4) return;
  cur.push({ x, y, w });
  const g = pad.getContext('2d'); style(g, drawColor);
  if (cur.length === 1) dot(g, cur[0]); else seg(g, cur, cur.length - 1);
}
pad.addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen') penSeen = true;
  if (cur || (penSeen && e.pointerType === 'touch')) return; /* palm rejection once the Pencil is in use */
  e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch {}
  cur = []; cur.pid = e.pointerId; strokes.push(cur); addPoint(e);
});
pad.addEventListener('pointermove', e => { if (!cur || e.pointerId !== cur.pid) return; e.preventDefault(); const l = e.getCoalescedEvents ? e.getCoalescedEvents() : []; (l.length ? l : [e]).forEach(addPoint); });
const endStroke = e => { if (cur && e.pointerId === cur.pid) cur = null; };
pad.addEventListener('pointerup', endStroke); pad.addEventListener('pointercancel', endStroke);
pad.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
pad.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
$('undo').onclick = () => { strokes.pop(); redraw(); };
$('clear').onclick = () => { strokes = []; redraw(); };
colorRow($('drawColors'), () => drawColor, c => { drawColor = c; redraw(); });

/* ---------- New signature: generate ---------- */
let typeColor = COLORS[0], typeFont = FONTS[0], importCanvas = null, tab = 'draw';
function drawFonts() {
  const box = $('fonts'), txt = $('sigName').value.trim() || 'Your Name'; box.textContent = '';
  for (const f of FONTS) {
    const b = document.createElement('button'); b.className = 'font' + (f === typeFont ? ' on' : ''); b.style.fontFamily = `"${f}"`; b.style.color = typeColor; b.textContent = txt;
    b.onclick = () => { typeFont = f; drawFonts(); }; box.append(b);
  }
}
colorRow($('typeColors'), () => typeColor, c => { typeColor = c; drawFonts(); });
$('sigName').oninput = () => { if (tab === 'type') drawFonts(); };
async function typedCanvas(text) {
  await document.fonts.load(`200px "${typeFont}"`, text);
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = `200px "${typeFont}"`;
  g.font = font; c.width = Math.ceil(g.measureText(text).width) + 300; c.height = 620;
  const h = c.getContext('2d'); h.font = font; h.fillStyle = typeColor; h.textBaseline = 'alphabetic'; h.fillText(text, 150, 380);
  return trim(c);
}

/* ---------- New signature: import ---------- */
$('pickImg').onclick = () => $('imgIn').click();
function fit(c) {
  if (c.width <= 1600) return c;
  const k = 1600 / c.width, s = document.createElement('canvas'); s.width = 1600; s.height = Math.max(1, Math.round(c.height * k));
  const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, s.width, s.height); return s;
}
const UNIT = { px: 1, '': 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
const len = v => { const m = String(v || '').trim().match(/^([\d.]+)\s*(px|pt|pc|mm|cm|in)?$/i); return m ? parseFloat(m[1]) * UNIT[(m[2] || '').toLowerCase()] : NaN; };
async function svgCanvas(f) {
  const svg = new DOMParser().parseFromString(await f.text(), 'image/svg+xml').documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('not svg');
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number), hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  let w = len(svg.getAttribute('width')), h = len(svg.getAttribute('height'));
  if (!(w > 0 && h > 0)) { if (hasVb) { w = vb[2]; h = vb[3]; } else { w = h = 1000; } }
  if (!hasVb) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const k = 2400 / Math.max(w, h), W = Math.round(w * k), H = Math.round(h * k);
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try { const img = await loadImg(url), c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H); return c; }
  finally { URL.revokeObjectURL(url); }
}
async function aiCanvas(f) { /* Illustrator files are saved with a PDF inside, so pdf.js can draw them */
  const d = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const p = await d.getPage(1), v = p.getViewport({ scale: 1 }), s = Math.min(8, Math.sqrt(16e6 / (v.width * v.height))), vp = p.getViewport({ scale: s });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    return c;
  } finally { d.destroy(); }
}
const kindOf = (f, name) => { const n = (name || f.name || '').toLowerCase(); return /\.svgz?$/.test(n) || f.type === 'image/svg+xml' ? 'svg' : /\.(ai|pdf)$/.test(n) || f.type === 'application/pdf' ? 'ai' : /\.e?ps$/.test(n) ? 'eps' : 'img'; };
async function sigFromBlob(f, name) {
    const kind = kindOf(f, name);
    if (kind === 'eps') { const e = new Error('eps'); e.eps = true; throw e; }
    const bmp = kind === 'svg' ? await svgCanvas(f) : kind === 'ai' ? await aiCanvas(f) : await createImageBitmap(f);
    const k = kind === 'img' ? Math.min(1, 1600 / Math.max(bmp.width, bmp.height)) : 1;
    const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    let opaque = true; for (let i = 3; i < d.length; i += 400) if (d[i] < 250) { opaque = false; break; }
    if (opaque) {
      const hist = new Array(256).fill(0); for (let i = 0; i < d.length; i += 4) hist[(d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) | 0]++;
      let paper = 255, tot = 0; const target = (d.length / 4) * .5; while (paper > 0 && tot + hist[paper] < target) { tot += hist[paper]; paper--; }
      const hi = paper - 18, lo = Math.max(0, hi - 90);
      for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; d[i + 3] = clamp((hi - l) / (hi - lo), 0, 1) * 255; }
      g.putImageData(im, 0, 0);
    }
    return trim(c);
}
$('imgIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    importCanvas = await sigFromBlob(f);
    if (!importCanvas) return toast('No signature found in that file');
    const box = $('drop'); box.querySelector('div').textContent = ''; let i = box.querySelector('img'); if (!i) { i = new Image(); box.querySelector('div').append(i); } i.src = importCanvas.toDataURL();
  } catch (err) {
    if (err && err.eps) toast('EPS can’t be opened on the iPad. Push it to the signatures repo and it’s converted to PNG for you.', 5000);
    else toast('Could not read that file. Illustrator files need “Create PDF Compatible File” on when saved.', 4500);
  }
};

/* ---------- New signature sheet ---------- */
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== t);
  if (t === 'draw') sizePad(); if (t === 'type') drawFonts();
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.t));
$('new').onclick = () => { strokes = []; importCanvas = null; $('sigName').value = ''; $('drop').querySelector('div').textContent = 'Photo, scan, PNG, SVG or Illustrator file. A white background is removed.'; open('newS'); setTab('draw'); };
$('newCancel').onclick = () => close('newS');
$('newSave').onclick = async () => {
  let c = null; const typed = $('sigName').value.trim();
  if (tab === 'draw') { if (strokes.length) { const o = document.createElement('canvas'); o.width = pad.width; o.height = pad.height; redraw(o); c = trim(o); } }
  else if (tab === 'type') { if (!typed) return toast('Type the name first'); c = await typedCanvas(typed); }
  else c = importCanvas;
  if (!c) return toast(tab === 'draw' ? 'Sign in the box first' : 'Choose an image first');
  c = fit(c);
  const n = typed || 'Signature ' + (sigs.length + 1), rec = stamp(n, c.toDataURL('image/png'), c.height / c.width, tab);
  await DB.put(rec);
  close('newS'); await reload(); toast('Saved. Drag it onto the page.');
  if (GH.cfg()) { try { await push(rec); await reload(); toast('Saved and pushed to GitHub'); } catch (e) { toast('Saved here. ' + ghErr(e) + ' It will push on next Sync.', 4000); } }
};

/* ---------- GitHub repo as the signature bucket ---------- */
const GH = {
  cfg() { try { return JSON.parse(localStorage.getItem('sign-gh') || 'null'); } catch { return null; } },
  set(c) { try { c ? localStorage.setItem('sign-gh', JSON.stringify(c)) : localStorage.removeItem('sign-gh'); } catch {} },
  async req(path, opt = {}) {
    const c = GH.cfg();
    const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`, { cache: 'no-store', ...opt,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  },
};
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const pre = c => { const d = (c.folder || '').replace(/^\/+|\/+$/g, ''); return d ? d + '/' : ''; };
const IMG = /\.(png|jpe?g|webp|svg|ai)$/i;
const mime = p => /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : /\.svg$/i.test(p) ? 'image/svg+xml' : /\.ai$/i.test(p) ? 'application/pdf' : 'image/jpeg';
const nameFrom = p => p.split('/').pop().replace(IMG, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
function ghErr(e) {
  if (e && e.status === 401) return 'GitHub rejected the token.';
  if (e && (e.status === 403 || e.status === 404)) return 'GitHub repo, branch or token access not found.';
  if (e && e.status) return `GitHub error ${e.status}.`;
  return 'Could not reach GitHub.';
}
async function push(s) {
  const c = GH.cfg(), base = s.name.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Signature';
  for (let i = 1; i < 50; i++) {
    const path = pre(c) + base + (i > 1 ? ' ' + i : '') + '.png';
    try {
      const r = await GH.req('contents/' + enc(path), { method: 'PUT', body: JSON.stringify({ message: 'Add signature: ' + s.name, content: s.src.split(',')[1], branch: c.branch }) });
      s.gh = path; s.sha = r.content.sha; await DB.put(s); return;
    } catch (e) { if (e.status !== 422) throw e; } /* 422: that file name is taken */
  }
}
let syncing = false;
async function sync(quiet) {
  const c = GH.cfg(); if (!c) return openGh();
  if (syncing) return; syncing = true; $('sync').textContent = 'Syncing…';
  try {
    const t = await GH.req(`git/trees/${encodeURIComponent(c.branch)}?recursive=1`), p = pre(c);
    const remote = t.tree.filter(x => x.type === 'blob' && x.path.startsWith(p) && IMG.test(x.path));
    const local = new Map(sigs.filter(s => s.gh).map(s => [s.gh, s]));
    let added = 0, removed = 0, pushed = 0, failed = 0;
    for (const f of remote) {
      const l = local.get(f.path); local.delete(f.path);
      if (l && l.sha === f.sha) continue;
      try {
        const b = await GH.req('git/blobs/' + f.sha);
        const bin = Uint8Array.from(atob(b.content.replace(/\s/g, '')), ch => ch.charCodeAt(0));
        const cv = await sigFromBlob(new Blob([bin], { type: mime(f.path) }), f.path);
        if (!cv) { failed++; continue; }
        const s = fit(cv);
        await DB.put({ id: l ? l.id : 'gh:' + f.path, name: l ? l.name : nameFrom(f.path), src: s.toDataURL('image/png'), aspect: s.height / s.width, kind: 'github', created: l ? l.created : Date.now(), used: l ? l.used : 0, gh: f.path, sha: f.sha });
        added++;
      } catch { failed++; }
    }
    for (const l of local.values()) { await DB.del(l.id); removed++; }
    for (const s of (await DB.all()).filter(s => !s.gh)) { try { await push(s); pushed++; } catch { failed++; } }
    await reload();
    const bits = [added && `${added} pulled`, pushed && `${pushed} pushed`, removed && `${removed} removed`, failed && `${failed} failed`].filter(Boolean);
    if (!quiet || bits.length) toast(bits.length ? 'Synced: ' + bits.join(', ') : 'Up to date with GitHub');
  } catch (e) { toast(ghErr(e), 4000); }
  finally { syncing = false; $('sync').textContent = 'Sync'; }
}
function ghUi() { $('sync').hidden = !GH.cfg(); }
function openGh() {
  const c = GH.cfg() || {};
  $('ghRepo').value = c.owner ? c.owner + '/' + c.repo : ''; $('ghBranch').value = c.branch || 'main'; $('ghFolder').value = c.folder ?? 'signatures'; $('ghToken').value = c.token || '';
  $('ghOff').hidden = !GH.cfg(); open('ghS');
}
$('ghBtn').onclick = openGh; $('sync').onclick = () => sync(false);
$('ghCancel').onclick = () => close('ghS');
$('ghOff').onclick = () => { GH.set(null); ghUi(); close('ghS'); toast('Disconnected. Signatures stay on this iPad.'); };
$('ghSave').onclick = () => {
  const m = $('ghRepo').value.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$|\/+$/g, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return toast('Repository should look like owner/name');
  if (!$('ghToken').value.trim()) return toast('Paste the token');
  GH.set({ owner: m[1], repo: m[2], branch: $('ghBranch').value.trim() || 'main', folder: $('ghFolder').value.trim(), token: $('ghToken').value.trim() });
  ghUi(); close('ghS'); sync(false);
};

/* ---------- PDF viewer ---------- */
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([$('pdfWorker').textContent], { type: 'text/javascript' }));
const viewer = $('viewer'), pagesEl = $('pages');
let doc = null, bytes = null, fname = '', pages = [], zoom = 1, placed = [], selected = null, io = null;

async function loadPdf(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data: buf.slice(), isEvalSupported: false });
    task.onPassword = (cb, reason) => passwordAsk(cb, reason);
    const d = await task.promise;
    if (doc) doc.destroy();
    doc = d; bytes = buf; fname = file.name.replace(/\.pdf$/i, ''); placed = []; selected = null; zoom = 1;
    $('docname').textContent = file.name; $('start').hidden = true; $('export').disabled = false;
    pagesEl.textContent = ''; pages = [];
    if (io) io.disconnect();
    io = new IntersectionObserver(onVis, { root: viewer, rootMargin: '900px 0px' });
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), vp = p.getViewport({ scale: 1 });
      const el = document.createElement('div'); el.className = 'page'; el.dataset.i = i - 1;
      const c = document.createElement('canvas'), ov = document.createElement('div'); ov.className = 'overlay';
      el.append(c, ov); pagesEl.append(el);
      pages.push({ i: i - 1, p, w: vp.width, h: vp.height, el, c, ov, vis: false, task: null, drawn: 0 });
      io.observe(el);
    }
    layout(); viewer.scrollTop = 0; updatePageNo();
  } catch (e) { console.error(e); toast('Could not open that PDF'); }
}
function passwordAsk(cb) {
  const s = document.createElement('div'); s.className = 'scrim on'; s.innerHTML = '<div class="sheet small"><h2>Password required</h2><input class="field" type="password"><div class="foot"><button class="btn primary">Open</button></div></div>';
  document.body.append(s); s.querySelector('button').onclick = () => { const v = s.querySelector('input').value; s.remove(); cb(v); };
}
const fitScale = pg => { const avail = Math.min(viewer.clientWidth - 32, 1100); return avail / pg.w; };
function baseScale() { return Math.min(...pages.map(fitScale)); }
function layout() { const s = baseScale() * zoom; for (const g of pages) { g.el.style.width = g.w * s + 'px'; g.el.style.height = g.h * s + 'px'; } schedule(); }
let rt; function schedule() { clearTimeout(rt); rt = setTimeout(() => pages.forEach(g => g.vis && paint(g)), 120); }
function onVis(es) { for (const e of es) { const g = pages[+e.target.dataset.i]; g.vis = e.isIntersecting; if (g.vis) paint(g); else { if (g.task) g.task.cancel(); g.c.width = g.c.height = 0; g.drawn = 0; } } }
async function paint(g) {
  const css = baseScale() * zoom, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let s = css * dpr; const maxA = 9e6; if (g.w * s * g.h * s > maxA) s = Math.sqrt(maxA / (g.w * g.h));
  if (g.drawn === s) return;
  if (g.task) { g.task.cancel(); g.task = null; }
  const off = document.createElement('canvas'), vp = g.p.getViewport({ scale: s }); off.width = vp.width; off.height = vp.height;
  const task = g.p.render({ canvasContext: off.getContext('2d'), viewport: vp }); g.task = task;
  try {
    await task.promise; if (g.task !== task) return;
    g.task = null; g.c.width = off.width; g.c.height = off.height; g.c.getContext('2d').drawImage(off, 0, 0); g.drawn = s;
  } catch {}
}
function setZoom(z) {
  if (!doc) return; z = clamp(z, 1, 5);
  const fy = viewer.scrollTop / Math.max(1, viewer.scrollHeight), fx = viewer.scrollLeft / Math.max(1, viewer.scrollWidth);
  zoom = z; layout(); viewer.scrollTop = fy * viewer.scrollHeight; viewer.scrollLeft = fx * viewer.scrollWidth;
}
$('zi').onclick = () => setZoom(zoom * 1.3); $('zo').onclick = () => setZoom(zoom / 1.3); $('zf').onclick = () => setZoom(1);
let gz = 1;
viewer.addEventListener('gesturestart', e => { e.preventDefault(); gz = zoom; });
viewer.addEventListener('gesturechange', e => e.preventDefault());
viewer.addEventListener('gestureend', e => { e.preventDefault(); setZoom(gz * e.scale); });
addEventListener('resize', () => { if (doc) layout(); if ($('newS').classList.contains('on') && tab === 'draw') sizePad(); });
function currentPage() {
  const r = viewer.getBoundingClientRect(), cy = r.top + r.height / 2; let best = pages[0], d = 1e12;
  for (const g of pages) { const b = g.el.getBoundingClientRect(), x = cy < b.top ? b.top - cy : cy > b.bottom ? cy - b.bottom : 0; if (x < d) { d = x; best = g; } }
  return best;
}
function updatePageNo() { $('pageno').textContent = pages.length ? `${currentPage().i + 1} / ${pages.length}` : ''; }
viewer.addEventListener('scroll', updatePageNo, { passive: true });
viewer.addEventListener('pointerdown', e => { if (e.target === viewer || e.target.closest('.page')) if (!e.target.closest('.stamp')) select(null); });

/* ---------- Placing signatures ---------- */
const DEF_W_PT = 170;
function pageAt(x, y) { for (const g of pages) { const b = g.el.getBoundingClientRect(); if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return g; } return null; }
function select(s) { if (selected) selected.el.classList.remove('sel'); selected = s; if (s) s.el.classList.add('sel'); }
const hFrac = (s, g) => s.w * s.aspect * g.w / g.h;
function pos(s) { s.el.style.left = s.x * 100 + '%'; s.el.style.top = s.y * 100 + '%'; s.el.style.width = s.w * 100 + '%'; const g = pages[s.page]; s.el.style.height = hFrac(s, g) * 100 + '%'; }
function keepIn(s) { const g = pages[s.page], h = hFrac(s, g); s.x = clamp(s.x, 0, Math.max(0, 1 - s.w)); s.y = clamp(s.y, 0, Math.max(0, 1 - h)); }
function place(sig, g, cx, cy) {
  const w = Math.min(DEF_W_PT / g.w, .6);
  const s = { id: uid(), src: sig.src, aspect: sig.aspect, page: g.i, w, x: 0, y: 0, el: null };
  s.x = cx - w / 2; s.y = cy - hFrac(s, g) / 2; keepIn(s);
  const el = document.createElement('div'); el.className = 'stamp'; s.el = el;
  const im = new Image(); im.src = sig.src; im.alt = '';
  const rs = document.createElement('div'); rs.className = 'h rs'; rs.innerHTML = '<i>⤡</i>';
  const del = document.createElement('div'); del.className = 'h del'; del.innerHTML = '<i>×</i>';
  el.append(im, rs, del); g.ov.append(el); pos(s); placed.push(s); select(s);
  el.addEventListener('pointerdown', e => moveStart(e, s));
  rs.addEventListener('pointerdown', e => resizeStart(e, s));
  del.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
  del.addEventListener('click', e => { e.stopPropagation(); el.remove(); placed = placed.filter(x => x !== s); selected = null; });
  sig.used = Date.now(); DB.put(sig);
  return s;
}
function track(e, move, up) {
  e.preventDefault(); e.stopPropagation();
  const id = e.pointerId;
  const m = ev => { if (ev.pointerId === id) { ev.preventDefault(); move(ev); } };
  const u = ev => { if (ev.pointerId !== id) return; removeEventListener('pointermove', m); removeEventListener('pointerup', u); removeEventListener('pointercancel', u); up(ev); };
  addEventListener('pointermove', m, { passive: false }); addEventListener('pointerup', u); addEventListener('pointercancel', u);
}
function edgeScroll(ev) { const r = viewer.getBoundingClientRect(), z = 56; if (ev.clientY < r.top + z) viewer.scrollBy(0, -14); else if (ev.clientY > r.bottom - z) viewer.scrollBy(0, 14); }
function moveStart(e, s) {
  select(s);
  const r0 = pages[s.page].el.getBoundingClientRect(), ox = (e.clientX - r0.left) / r0.width - s.x, oy = (e.clientY - r0.top) / r0.height - s.y;
  track(e, ev => {
    edgeScroll(ev);
    const r = pages[s.page].el.getBoundingClientRect();
    s.x = (ev.clientX - r.left) / r.width - ox; s.y = (ev.clientY - r.top) / r.height - oy; pos(s);
  }, () => {
    let g = pages[s.page]; const r = g.el.getBoundingClientRect();
    const cx = r.left + (s.x + s.w / 2) * r.width, cy = r.top + (s.y + hFrac(s, g) / 2) * r.height;
    const t = pageAt(cx, cy);
    if (t && t !== g) { /* moved across pages: keep physical size */
      const b = t.el.getBoundingClientRect(), wNew = s.w * r.width / b.width;
      s.page = t.i; s.w = wNew; s.x = (cx - b.left) / b.width - s.w / 2; s.y = (cy - b.top) / b.height - hFrac(s, t) / 2; t.ov.append(s.el); g = t;
    }
    keepIn(s); pos(s);
  });
}
function resizeStart(e, s) {
  const g = pages[s.page], r = g.el.getBoundingClientRect();
  track(e, ev => { s.w = clamp((ev.clientX - r.left) / r.width - s.x, 24 / g.w, 1 - s.x); pos(s); }, () => { keepIn(s); pos(s); });
}
function tileDrag(t, sig) {
  t.addEventListener('pointerdown', e => {
    if (e.button) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY, ghost = $('ghost'); let dragging = false;
    const m = ev => {
      if (ev.pointerId !== id) return;
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { if (!doc) return; dragging = true; ghost.src = sig.src; ghost.style.display = 'block'; }
      if (dragging) { ev.preventDefault(); ghost.style.transform = `translate(${ev.clientX - 85}px,${ev.clientY - 85 * sig.aspect}px)`; edgeScroll(ev); }
    };
    const end = ev => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointermove', m); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      ghost.style.display = 'none';
      if (ev.type === 'pointercancel') return;
      if (dragging) { const g = pageAt(ev.clientX, ev.clientY); if (g) { const b = g.el.getBoundingClientRect(); place(sig, g, (ev.clientX - b.left) / b.width, (ev.clientY - b.top) / b.height); } }
      else if (!doc) toast('Open a PDF first');
      else { const g = currentPage(), b = g.el.getBoundingClientRect(), v = viewer.getBoundingClientRect(); place(sig, g, .5, clamp((v.top + v.height / 2 - b.top) / b.height, .1, .9)); }
    };
    addEventListener('pointermove', m, { passive: false }); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  });
}

/* ---------- Export ---------- */
let busy = false;
const dataBytes = u => Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0));
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function renderFlat(g, scale) {
  const s0 = Math.min(scale, 4096 / Math.max(g.w, g.h)), s = g.w * g.h * s0 * s0 > 16e6 ? Math.sqrt(16e6 / (g.w * g.h)) : s0;
  const c = document.createElement('canvas'), vp = g.p.getViewport({ scale: s }); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await g.p.render({ canvasContext: x, viewport: vp }).promise;
  x.imageSmoothingQuality = 'high';
  for (const st of placed.filter(p => p.page === g.i)) { const i = await loadImg(st.src), W = st.w * c.width; x.drawImage(i, st.x * c.width, st.y * c.height, W, W * st.aspect); }
  return c;
}
const toBlob = (c, t, q) => new Promise(r => c.toBlob(r, t, q));
async function exportPdf() {
  const { PDFDocument, degrees } = PDFLib; let out;
  try {
    out = await PDFDocument.load(bytes);
    const cache = new Map(), list = out.getPages();
    for (const st of placed) {
      const g = pages[st.page], pg = list[st.page], vp = g.p.getViewport({ scale: 1 });
      if (!cache.has(st.src)) cache.set(st.src, await out.embedPng(dataBytes(st.src)));
      const W = st.w * g.w, H = W * st.aspect, X = st.x * g.w, Y = st.y * g.h;
      const [px, py] = vp.convertToPdfPoint(X, Y + H);
      pg.drawImage(cache.get(st.src), { x: px, y: py, width: W, height: H, rotate: degrees(g.p.rotate || 0) });
    }
  } catch (err) { /* secured PDFs cannot be edited in place, so rebuild from page images */
    console.warn(err); out = await PDFDocument.create();
    for (const g of pages) { const c = await renderFlat(g, 200 / 72), im = await out.embedJpg(new Uint8Array(await (await toBlob(c, 'image/jpeg', .92)).arrayBuffer())); out.addPage([g.w, g.h]).drawImage(im, { x: 0, y: 0, width: g.w, height: g.h }); }
  }
  return new Blob([await out.save()], { type: 'application/pdf' });
}
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(u) { let c = -1; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(files) {
  const parts = [], central = []; let off = 0; const enc = new TextEncoder();
  for (const f of files) {
    const n = enc.encode(f.name), c = crc(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, c, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, n.length, true);
    parts.push(h.buffer, n, f.data);
    const d = new DataView(new ArrayBuffer(46));
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint32(16, c, true); d.setUint32(20, f.data.length, true); d.setUint32(24, f.data.length, true); d.setUint16(28, n.length, true); d.setUint32(42, off, true);
    central.push(d.buffer, n); off += 30 + n.length + f.data.length;
  }
  const size = central.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}
$('export').onclick = () => { select(null); $('xZip').hidden = pages.length < 2; open('expS'); };
$('expCancel').onclick = () => close('expS');
async function run(label, fn) {
  if (busy) return; busy = true; close('expS'); toast(label, 60000);
  try { await fn(); $('toast').style.display = 'none'; } catch (e) { console.error(e); toast('Export failed. Try again.'); }
  busy = false;
}
const PNG_SCALE = 200 / 72;
$('xPdf').onclick = () => run('Building PDF…', async () => ready(await exportPdf(), fname + '-signed.pdf'));
$('xPng').onclick = () => run('Building PNG…', async () => { const g = currentPage(); ready(await toBlob(await renderFlat(g, PNG_SCALE), 'image/png'), `${fname}-signed-p${g.i + 1}.png`); });
$('xZip').onclick = () => run('Building PNGs…', async () => {
  const files = [], pad2 = String(pages.length).length;
  for (const g of pages) { toast(`Page ${g.i + 1} of ${pages.length}…`, 60000); const b = await toBlob(await renderFlat(g, PNG_SCALE), 'image/png'); files.push({ name: `${fname}-signed-p${String(g.i + 1).padStart(pad2, '0')}.png`, data: new Uint8Array(await b.arrayBuffer()) }); }
  ready(zip(files), fname + '-signed-png.zip');
});

/* Files are handed over from a fresh tap so iPad's share sheet is allowed to open. */
let pending = null, dl = null;
function ready(blob, name, extra) {
  pending = new File([blob], name, { type: blob.type });
  $('readyT').textContent = 'Ready'; $('readyN').textContent = `${name} · ${(blob.size / 1048576).toFixed(blob.size < 1e5 ? 2 : 1)} MB${extra ? ' · ' + extra : ''}`;
  $('readyShare').hidden = !(navigator.canShare && navigator.canShare({ files: [pending] }));
  $('readySave').hidden = false; open('readyS');
}
$('readyClose').onclick = () => close('readyS');
$('readyShare').onclick = async () => { try { await navigator.share({ files: [pending] }); close('readyS'); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed. Use Save.'); } };
$('readySave').onclick = async () => {
  if (dl) { try { await dl.save({ filename: pending.name, data: pending }); close('readyS'); } catch (e) { toast('Save was declined'); } return; }
  const u = URL.createObjectURL(pending), a = document.createElement('a'); a.href = u; a.download = pending.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); close('readyS');
};

/* ---------- Wire up ---------- */
const pick = () => $('pdfIn').click();
$('open').onclick = pick; $('open2').onclick = pick;
$('pdfIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadPdf(f); };
document.addEventListener('gesturestart', e => e.preventDefault());
(async () => {
  await DB.init();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  await reload();
  ghUi(); if (GH.cfg()) sync(true);
  try { if (window.claude && claude.use) claude.use('downloads').then(d => dl = d); } catch {}
  try { if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js'); } catch {}
})();
})();
