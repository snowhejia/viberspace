/* ============================================================
   路由 + 各页面渲染
   ============================================================ */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式等情况忽略 */ } },
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* 各页面和页面外壳在 js/pages.js */

/* ---------- 地图镜头动画：推近建筑 → 开门 → 进门 ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIFT = 10;                       // 选中建筑抬起的高度（和 CSS 里一致）
const wait = ms => new Promise(r => setTimeout(r, ms));
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeIn = t => t * t * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
let animating = false;

// 地图在屏幕上实际可见的区域（去掉顶栏、屏幕外部分）
function visibleBox(svg) {
  const r = svg.getBoundingClientRect();
  const sc = svg.parentElement.getBoundingClientRect();
  const top = Math.max(r.top, $('.topbar').getBoundingClientRect().bottom);
  const bottom = Math.min(r.bottom, innerHeight);
  const left = Math.max(r.left, sc.left, 0), right = Math.min(r.right, sc.right, innerWidth);
  return { r, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}
// 镜头 = 地图上的点 (X,Y) 显示在可见区域中心，缩放 k（屏幕像素 / 地图单位）
const fullCam = v => { const k = v.r.width / 1600; return { X: (v.cx - v.r.left) / k, Y: (v.cy - v.r.top) / k, k }; };
const buildingCam = (s, v) => ({ X: s.x, Y: s.y + s.h / 2 - LIFT, k: Math.min(v.h * .62 / (s.h + 30), v.w * .6 / 300) });
const doorCam = (s, v) => ({ X: s.x + s.door.x + s.door.w / 2, Y: s.y + s.door.y + s.door.h / 2 - LIFT, k: Math.max(v.h / s.door.h, v.w / s.door.w) * 1.3 });
function setCam(svg, v, c) {
  svg.setAttribute('viewBox', `${c.X - (v.cx - v.r.left) / c.k} ${c.Y - (v.cy - v.r.top) / c.k} ${v.r.width / c.k} ${v.r.height / c.k}`);
}
// 围绕一个固定点缩放：这个点在两个镜头下的屏幕位置相同，缩放过程中画面不会扫到别处
function tween(svg, v, a, b, ms, ease) {
  const same = Math.abs(a.k - b.k) < 1e-6;
  const PX = same ? 0 : (a.X * a.k - b.X * b.k) / (a.k - b.k);
  const PY = same ? 0 : (a.Y * a.k - b.Y * b.k) / (a.k - b.k);
  return new Promise(done => {
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      const k = a.k * Math.pow(b.k / a.k, e);
      setCam(svg, v, same
        ? { X: a.X + (b.X - a.X) * e, Y: a.Y + (b.Y - a.Y) * e, k }
        : { X: PX - (PX - a.X) * a.k / k, Y: PY - (PY - a.Y) * a.k / k, k });
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  });
}
function resetMap(svg) {
  svg.setAttribute('viewBox', '0 0 1600 1200');
  svg.classList.remove('cam');
  svg.querySelectorAll('.stop').forEach(el => el.classList.remove('active', 'open', 'noanim'));
}
// 建筑不在屏幕中央时，先把页面滚过去
function centerOn(s) {
  scrollTo(0, 0);                         // 先回到顶部，避免用到切换页面前的旧滚动位置
  const svg = $('#map'), r = svg.getBoundingClientRect(), k = r.width / 1600;
  const sc = svg.parentElement;
  if (sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, s.x * k - sc.clientWidth / 2);
  const docY = r.top + (s.y + s.h / 2) * k;
  scrollTo(0, Math.max(0, docY - innerHeight / 2 - 20));
}
const veil = (on, ms) => { const v = $('#veil'); v.style.transitionDuration = `${ms}ms`; v.classList.toggle('on', on); return wait(ms); };

async function enterStop(id) {
  if (animating) return;
  if (reduceMotion) { location.hash = `#/${id}`; return; }
  animating = true;
  const svg = $('#map'), el = svg.querySelector(`.stop[data-id="${id}"]`), s = STOPS.find(x => x.id === id);
  let v = visibleBox(svg);
  const ry = (s.y + s.h / 2) * (v.r.width / 1600) + v.r.top;
  if (ry < v.cy - v.h / 2 || ry > v.cy + v.h / 2) { centerOn(s); v = visibleBox(svg); }
  svg.classList.add('cam'); el.classList.add('active');
  const c1 = buildingCam(s, v), c2 = doorCam(s, v);
  await tween(svg, v, fullCam(v), c1, 750, easeInOut);
  el.classList.add('open');
  await wait(480);
  const zoomIn = tween(svg, v, c1, c2, 700, easeIn);
  await wait(420); await veil(true, 260); await zoomIn;
  location.hash = `#/${id}`;              // route() 渲染页面
  requestAnimationFrame(() => { resetMap(svg); veil(false, 420); animating = false; });
}

async function exitToMap(id) {
  animating = true;
  const svg = $('#map'), el = svg.querySelector(`.stop[data-id="${id}"]`), s = STOPS.find(x => x.id === id);
  await veil(true, 220);
  $('#pageView').hidden = true; $('#mapView').hidden = false;
  centerOn(s);
  const v = visibleBox(svg);
  const c0 = fullCam(v), c1 = buildingCam(s, v), c2 = doorCam(s, v);
  svg.classList.add('cam'); el.classList.add('active', 'noanim', 'open');
  setCam(svg, v, c2);
  el.getBoundingClientRect(); el.classList.remove('noanim');
  veil(false, 320);
  await tween(svg, v, c2, c1, 650, easeOut);
  el.classList.remove('open');
  await wait(380);
  await tween(svg, v, c1, c0, 800, easeInOut);
  resetMap(svg);
  animating = false;
}

/* ---------- 路由 ---------- */
let mapScroll = 0, currentPage = null;
function route() {
  const [, id, sub] = (location.hash.replace(/^#\/?/, '/')).split('/');
  const isPage = STOPS.some(s => s.id === id);
  const mapV = $('#mapView'), pageV = $('#pageView');
  document.querySelectorAll('#stopnav a').forEach(a => a.classList.toggle('on', a.dataset.id === id));
  if (isPage) {
    if (!mapV.hidden) mapScroll = scrollY;
    renderPage(id, sub);
    mapV.hidden = true; pageV.hidden = false;
    scrollTo(0, 0);
    document.title = `${STOPS.find(s => s.id === id).name} · ViberSpace`;
    currentPage = id;
  } else {
    document.title = 'ViberSpace · Vibe Coding 社团';
    const from = currentPage; currentPage = null;
    if (from && !reduceMotion && mapV.hidden) { exitToMap(from); return; }
    pageV.hidden = true; mapV.hidden = false;
    scrollTo(0, mapScroll);
  }
}

/* ---------- 启动 ---------- */
function init() {
  renderMap($('#map'));
  $('#stopnav').innerHTML = STOPS.map(s => `<a href="#/${s.id}" data-id="${s.id}" title="${s.name}"><span class="sg">${s.n}</span><em>${s.name}</em></a>`).join('');

  const go = el => enterStop(el.dataset.id);
  // 在地图上点顶栏编号，也走开门动画
  $('#stopnav').addEventListener('click', e => {
    const a = e.target.closest('a[data-id]');
    if (a && !$('#mapView').hidden) { e.preventDefault(); enterStop(a.dataset.id); }
  });
  document.querySelectorAll('.stop').forEach(el => {
    el.addEventListener('click', () => go(el));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(el); } });
  });
  // Vibe 塔（灵感扭蛋机）、彩蛋、散步小人等小玩意在 js/fun.js

  // 图片大图查看
  const lb = $('#lightbox');
  const closeLb = () => { lb.hidden = true; $('img', lb).removeAttribute('src'); };
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { $('img', lb).src = z.dataset.zoom; $('figcaption', lb).textContent = z.dataset.cap || ''; lb.hidden = false; $('.lb-close', lb).focus(); return; }
    if (!lb.hidden && (e.target === lb || e.target.closest('.lb-close'))) closeLb();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLb(); });
  addEventListener('hashchange', closeLb);

  addEventListener('hashchange', route);
  route();
}
init();
