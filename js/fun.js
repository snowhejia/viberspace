/* ============================================================
   地图上的小玩意
   1. 灵感扭蛋机：点 Vibe 塔，随机掉一个项目点子（点子在 js/data.js 的 IDEAS）
   2. 会动的地图：点自行车会骑一小段、河上漂纸船、鱼跳出水面、吉祥物会说话、白天/夜景
   3. 散步小人：方向键 / WASD 走路，或者点地图让它走过去；走到楼门口按回车进门
   4. 彩蛋收集：地图上藏了 5 个彩蛋，找齐解锁徽章（记录在访客自己的浏览器里）
   依赖 app.js 里的 $、store、toast、wait、reduceMotion、enterStop，和 map.js 里的 COL、STOPS、tw
   ============================================================ */
(() => {
  const svg = $('#map');
  const NS = 'http://www.w3.org/2000/svg';
  const mapView = $('#mapView');
  const touchy = matchMedia('(pointer: coarse)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mapOn = () => !mapView.hidden && !svg.classList.contains('cam');
  const restart = (el, cls) => { el.classList.remove(cls); el.getBoundingClientRect(); el.classList.add(cls); };
  function layer(cls, html = '') {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', cls);
    g.innerHTML = html;
    return g;
  }
  const toMap = (cx, cy) => new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
  const toScreen = (x, y) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());

  /* ============ 彩蛋记录 ============ */
  const EGGS = [
    { id: 'poke',   icon: '⭐', name: '戳到炸毛', hint: '标题旁边那个一直在晃的家伙，好像很怕痒', got: '连戳吉祥物 5 下' },
    { id: 'fish',   icon: '🐟', name: '河里的鱼', hint: 'Vibe 河里偶尔会有东西跳出来',           got: '抓到了跳出水面的鱼' },
    { id: 'moon',   icon: '🌕', name: '摘月亮',   hint: '天黑以后，往天上看看',                   got: '在夜里摘到了月亮' },
    { id: 'splash', icon: '🌊', name: '扑通',     hint: '散步的时候，离河远一点……或者别',         got: '散步时掉进了 Vibe 河' },
    { id: 'konami', icon: '🎮', name: '老玩家',   hint: '↑ ↑ ↓ ↓ ← → ← → …… 后面是什么来着？',   got: '输入了经典秘籍' },
  ];
  const EGG_KEY = 'vs-eggs';
  let found = store.get(EGG_KEY, {});
  const foundCount = () => EGGS.filter(e => found[e.id]).length;

  function egg(id) {
    if (found[id]) return false;
    found[id] = new Date().toISOString().slice(0, 10);
    store.set(EGG_KEY, found);
    const e = EGGS.find(x => x.id === id), n = foundCount();
    updateHud(true);
    toast(`🥚 发现彩蛋「${e.icon} ${e.name}」 ${n}/${EGGS.length}`);
    if (n === EGGS.length) setTimeout(() => { confetti(); showBadge(); }, 1300);
    return true;
  }

  /* ============ 右下角的小工具栏 ============ */
  const hud = document.createElement('div');
  hud.className = 'map-hud';
  hud.setAttribute('role', 'toolbar');
  hud.setAttribute('aria-label', '地图小玩意');
  hud.innerHTML = `
    <button type="button" id="hudNight" aria-pressed="false"></button>
    <button type="button" id="hudWalk" aria-pressed="false">🚶 散步</button>
    <button type="button" id="hudEggs" aria-haspopup="dialog" aria-expanded="false">🥚 <b>0</b>/${EGGS.length}</button>`;
  mapView.append(hud);

  const panel = document.createElement('div');
  panel.className = 'egg-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '彩蛋收集');
  mapView.append(panel);

  function updateHud(pulse) {
    $('#hudEggs b').textContent = foundCount();
    if (pulse) restart($('#hudEggs'), 'pulse');
    if (!panel.hidden) renderPanel();
  }
  function renderPanel() {
    const all = foundCount() === EGGS.length;
    panel.innerHTML = `
      <header><strong>彩蛋收集</strong><span>${foundCount()} / ${EGGS.length}</span></header>
      <ul>${EGGS.map(e => found[e.id]
        ? `<li class="got"><span class="ei">${e.icon}</span><div><b>${e.name}</b><small>${e.got} · ${found[e.id]}</small></div></li>`
        : `<li><span class="ei">❔</span><div><b>？？？</b><small>${e.hint}</small></div></li>`).join('')}</ul>
      <footer>
        ${all ? '<button type="button" class="btn btn-ink" data-act="badge">🏅 看看我的徽章</button>' : '<span class="muted">找齐 5 个解锁社团徽章</span>'}
        ${foundCount() ? '<button type="button" class="link-btn" data-act="reset">重置</button>' : ''}
      </footer>`;
  }
  $('#hudEggs').addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    $('#hudEggs').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) renderPanel();
  });
  panel.addEventListener('click', e => {
    e.stopPropagation();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'badge') showBadge();
    if (act === 'reset' && confirm('清空已经找到的彩蛋，重新找一遍？')) { found = {}; store.set(EGG_KEY, found); updateHud(); }
  });
  document.addEventListener('click', () => { if (!panel.hidden) { panel.hidden = true; $('#hudEggs').setAttribute('aria-expanded', 'false'); } });

  /* ============ 弹窗（扭蛋机、徽章共用） ============ */
  let lastFocus = null;
  function modal(id, html) {
    let m = document.getElementById(id);
    if (!m) {
      m = document.createElement('div');
      m.id = id; m.className = 'fun-modal'; m.hidden = true;
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.innerHTML = `<div class="fun-card">${html}<button type="button" class="fun-x" aria-label="关闭">×</button></div>`;
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('.fun-x')) closeModal(m); });
      document.body.append(m);
    }
    return m;
  }
  function openModal(m) { lastFocus = document.activeElement; m.hidden = false; $('.fun-x', m).focus(); }
  function closeModal(m) { m.hidden = true; lastFocus?.focus?.(); }
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.fun-modal:not([hidden])').forEach(closeModal);
  });

  /* ============ 1. 灵感扭蛋机 ============ */
  const lm = $('.landmark');
  lm.insertAdjacentHTML('beforeend', `<g class="signal" aria-hidden="true">
    ${[0, 1, 2].map(i => `<circle r="26" style="animation-delay:${i * .18}s"/>`).join('')}</g>`);

  const LV = ['', '一个下午', '一个周末', '要折腾一阵'];
  const CAPS = ['#F7A6BC', '#2F6DC2', '#FFE600', '#5CB87A', '#E8463B'];
  let lastIdea = null, spinning = false;
  function drawIdea() {
    const pool = IDEAS.filter(i => i !== lastIdea);
    const w = pool.map(i => (i.rare ? .35 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return (lastIdea = pool[i]); }
    return (lastIdea = pool[pool.length - 1]);
  }
  function gachaModal() {
    const m = modal('gacha', `
      <p class="fun-k">📡 Vibe 塔 · 灵感扭蛋机</p>
      <div class="capsule-stage"><div class="capsule"><i class="cap-top"></i><i class="cap-bot"></i></div></div>
      <div class="idea" hidden>
        <span class="idea-rare" hidden>✨ 稀有灵感</span>
        <div class="idea-head"><span class="idea-emoji"></span><div><h3 id="gachaTitle"></h3><span class="idea-lv"></span></div></div>
        <p class="idea-pitch"></p>
        <div class="idea-tools"></div>
        <div class="idea-prompt"><span>第一句话可以这样对 AI 说</span><p></p><button type="button" class="link-btn idea-copy">复制这句</button></div>
      </div>
      <div class="fun-btns">
        <button type="button" class="btn btn-ink" data-act="again">🔄 再扭一个</button>
        <button type="button" class="btn" data-act="go">就做这个！</button>
      </div>`);
    if (!m.dataset.wired) {
      m.dataset.wired = '1';
      m.setAttribute('aria-labelledby', 'gachaTitle');
      m.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'again') spin(m);
        if (act === 'go') { closeModal(m); toast('去吧！做出来记得投稿到「作品展示」✨'); }
        if (e.target.closest('.idea-copy')) {
          navigator.clipboard?.writeText(lastIdea.prompt)
            .then(() => toast('已复制，去和 AI 聊吧 💬'), () => toast('复制没成功，手动选中文字也可以'));
        }
      });
    }
    return m;
  }
  async function spin(m) {
    if (spinning) return;
    spinning = true;
    const idea = drawIdea();
    const stage = $('.capsule-stage', m), cap = $('.capsule', m), box = $('.idea', m);
    box.hidden = true; stage.hidden = false;
    cap.className = 'capsule' + (idea.rare ? ' gold' : '');
    cap.style.setProperty('--cap', pick(CAPS));
    if (!reduceMotion) {
      restart(cap, 'drop');
      await wait(1150);
      cap.classList.add('pop');
      await wait(380);
    }
    stage.hidden = true;
    $('.idea-rare', m).hidden = !idea.rare;
    $('.idea-emoji', m).textContent = idea.emoji;
    $('h3', m).textContent = idea.title;
    $('.idea-lv', m).textContent = `${'⭐'.repeat(idea.level)} ${LV[idea.level]}`;
    $('.idea-pitch', m).textContent = idea.pitch;
    $('.idea-tools', m).innerHTML = idea.tools.map(t => `<span>${esc(t)}</span>`).join('');
    $('.idea-prompt p', m).textContent = `“${idea.prompt}”`;
    box.hidden = false;
    box.classList.toggle('rare', !!idea.rare);
    restart(box, 'in');
    spinning = false;
  }
  async function openGacha() {
    restart(lm, 'beam');
    if (!reduceMotion) await wait(420);
    const m = gachaModal();
    openModal(m);
    spin(m);
  }
  lm.addEventListener('click', openGacha);
  lm.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGacha(); } });
  lm.setAttribute('aria-label', 'Vibe 塔：灵感扭蛋机');

  /* ============ 2. 会动的地图 ============ */
  // --- 夜景：遮罩盖住地面，建筑和标题在遮罩上面，看起来像亮着灯 ---
  const route = svg.querySelector('.route');
  const stars = Array.from({ length: 34 }, () => {
    let x, y;
    do { x = rand(20, 1580); y = rand(20, 1180); } while (x < 560 && y < 280);
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rand(1.2, 2.8).toFixed(1)}" style="animation-delay:${rand(0, 3).toFixed(2)}s"/>`;
  }).join('');
  svg.insertBefore(layer('night-shade', '<rect width="1600" height="1200"/>'), route);
  const sky = layer('sky', `
    <g class="stars">${stars}</g>
    <circle class="beacon" cx="1460" cy="46" r="6"/>
    <g class="moon" transform="translate(1130 92)" tabindex="-1" role="button" aria-label="月亮">
      <circle r="44" fill="transparent"/>
      <circle r="30" fill="#FFF3C4"/>
      <circle cx="-9" cy="-6" r="6" fill="#F2E09A"/><circle cx="10" cy="9" r="4" fill="#F2E09A"/><circle cx="8" cy="-12" r="3" fill="#F2E09A"/>
    </g>`);
  svg.insertBefore(sky, route);
  const moon = $('.moon', sky);
  const nightBtn = $('#hudNight');
  const sydneyHour = () => +new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Australia/Sydney' }).format(new Date());
  function setNight(on) {
    svg.classList.toggle('night', on);
    nightBtn.textContent = on ? '☀️ 白天' : '🌙 夜景';
    nightBtn.setAttribute('aria-pressed', String(on));
    moon.setAttribute('tabindex', on ? '0' : '-1');
  }
  const h = sydneyHour();
  setNight(h >= 19 || h < 6);           // 按悉尼时间自动切换
  nightBtn.addEventListener('click', () => setNight(!svg.classList.contains('night')));
  const grabMoon = () => {
    restart(moon, 'grab');
    egg('moon') || toast('🌕 月亮被你摘下来了……又自己挂回去了');
  };
  moon.addEventListener('click', grabMoon);
  moon.addEventListener('keydown', e => { if (e.key === 'Enter') grabMoon(); });

  // --- 自行车：平时停着不动，点一下按铃、往前骑一小段再骑回来 ---
  function floatText(x, y, text) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'float-txt hand');
    t.textContent = text;
    svg.append(t);
    setTimeout(() => t.remove(), 1300);
  }
  const bikes = [...svg.querySelectorAll('.bike')].map(el => {
    const base = el.getAttribute('transform');
    const [, x, y] = base.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
    el.insertAdjacentHTML('afterbegin', '<rect x="-56" y="-92" width="112" height="96" fill="transparent"/>');
    el.insertAdjacentHTML('beforeend', [-30, 30].map(cx => `<g transform="translate(${cx} -22)"><g class="spokes">
      <path d="M-17 0 H17 M0 -17 V17 M-12 -12 L12 12 M-12 12 L12 -12" stroke="${COL.ink}" stroke-width="2" opacity=".5"/></g></g>`).join(''));
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', '自行车');
    return { el, base, x, y, face: /scale\(-1/.test(base) ? -1 : 1, busy: false };
  });
  const BELLS = ['叮铃铃 🔔', '让一让～', '叮叮！', '出发！'];
  function pedal(b, from, to, face) {
    return new Promise(done => {
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / 900), e = t < .5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
        const bob = Math.abs(Math.sin(now / 90)) * 3;
        b.el.setAttribute('transform', `translate(${(b.x + from + (to - from) * e).toFixed(1)} ${(b.y - bob).toFixed(1)}) scale(${face} 1)`);
        t < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }
  async function ride(b) {
    if (b.busy) return;
    b.busy = true;
    floatText(b.x, b.y - 104, pick(BELLS));
    if (!reduceMotion) {
      b.el.classList.add('riding');
      await pedal(b, 0, b.face * 120, b.face);       // 往前骑
      await wait(220);
      await pedal(b, b.face * 120, 0, -b.face);      // 掉头骑回来
      b.el.setAttribute('transform', b.base);
      b.el.classList.remove('riding');
    }
    b.busy = false;
  }
  for (const b of bikes) {
    b.el.addEventListener('click', () => ride(b));
    b.el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ride(b); } });
  }

  // --- 河上的纸船 + 跳出水面的鱼 ---
  const river = svg.querySelector('.river'), rlen = river.getTotalLength();
  const boat = layer('boat', `<g class="boat-in">
      <path d="M-28 -4 L28 -4 L17 10 L-17 10 Z" fill="#fff" stroke="${COL.ink}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M-2 -4 L-2 -40 L22 -10 Z" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="2.5" stroke-linejoin="round"/>
    </g>`);
  boat.setAttribute('role', 'button');
  boat.setAttribute('aria-label', '纸船');
  const fish = layer('fish', `<g class="fish-body">
      <circle r="36" fill="transparent"/>
      <path d="M-14 0 L-28 -10 L-28 10 Z" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M-18 0 C-8 -13 10 -13 18 0 C10 13 -8 13 -18 0 Z" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="2.5"/>
      <circle cx="8" cy="-3" r="2.4" fill="${COL.ink}"/>
    </g><ellipse class="fish-splash" rx="22" ry="6"/>`);
  const ripple = river.nextElementSibling;
  ripple.after(boat, fish);
  const boatState = { d: rlen * .3, dir: 1, face: 1 };
  const BOAT_LINES = ['⛵ 纸船上写着：今天也要 vibe 一下', '⛵ 纸船上写着：先做出来，再做好', '⛵ 纸船上写着：bug 是功能的前身', '⛵ 纸船上写着：别问能不能，问 AI 怎么做'];
  boat.addEventListener('click', () => { restart(boat, 'tip'); toast(pick(BOAT_LINES)); });

  let fishUp = false;
  function jump() {
    if (mapOn() && !document.hidden && !fishUp) {
      const p = river.getPointAtLength(rand(.12, .9) * rlen);
      fish.setAttribute('transform', `translate(${p.x.toFixed(0)} ${(p.y + 6).toFixed(0)}) scale(${Math.random() < .5 ? -1 : 1} 1)`);
      fishUp = true;
      restart(fish, 'jump');
      setTimeout(() => { fish.classList.remove('jump'); fishUp = false; }, 2100);
    }
    setTimeout(jump, rand(4500, 8500));
  }
  if (!reduceMotion) setTimeout(jump, 2500);
  fish.addEventListener('click', e => {
    e.stopPropagation();
    if (!fishUp) return;
    fish.classList.remove('jump'); fishUp = false;
    egg('fish') || toast('🐟 抓到啦！……它又滑回水里了');
  });

  // --- 吉祥物：点一下跳一下说句话，连戳 5 下炸毛 ---
  const mascot = svg.querySelector('.mascot');
  const say = layer('say');
  svg.querySelector('.title').append(say);
  mascot.setAttribute('tabindex', '0');
  mascot.setAttribute('role', 'button');
  mascot.setAttribute('aria-label', '吉祥物');
  const LINES = ['嗨！我是 Vibe 星 ✦', '点我干嘛，去点楼呀', '今天写 bug 了吗？', '我只会 vibe，不会 debug', '有想法就去做！', '右上角的塔会掉点子哦'];
  let pokes = 0, lastPoke = 0, sayTimer;
  function speak(text) {
    const w = tw(text, 20) + 32;
    say.innerHTML = `<g transform="translate(530 38)">
      <path d="M0 22 L-14 30 L4 36 Z" fill="#fff" stroke="${COL.blue}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="0" y="0" width="${w}" height="44" rx="22" fill="#fff" stroke="${COL.blue}" stroke-width="3"/>
      <path d="M-1 24 L5 33" stroke="#fff" stroke-width="4"/>
      <text x="${w / 2}" y="29" text-anchor="middle" class="hand" font-size="20" fill="${COL.blue}">${esc(text)}</text></g>`;
    restart(say, 'show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => say.classList.remove('show'), 2400);
  }
  function poke() {
    const now = Date.now();
    pokes = now - lastPoke < 1400 ? pokes + 1 : 1;
    lastPoke = now;
    if (pokes >= 5) {
      pokes = 0;
      restart(mascot, 'spin');
      speak('啊啊啊炸毛了！！');
      egg('poke');
      return;
    }
    restart(mascot, 'hop');
    speak(pokes === 4 ? '再戳我要炸毛了！' : pokes >= 2 ? pick(['哎哟', '别戳了！', '痒痒痒']) : pick(LINES));
  }
  mascot.addEventListener('click', poke);
  mascot.addEventListener('keydown', e => { if (e.key === 'Enter') poke(); });
  mascot.addEventListener('animationend', e => { if (e.animationName !== 'bob') mascot.classList.remove('hop', 'spin'); });

  // --- 秘籍：↑↑↓↓←→←→BA，全城开派对 ---
  const KONAMI = 'arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a';
  let keyLog = [];
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    keyLog = [...keyLog, e.key.toLowerCase()].slice(-10);
    if (keyLog.join(',') !== KONAMI) return;
    keyLog = [];
    if (!mapView.hidden) { restart(svg, 'party'); setTimeout(() => svg.classList.remove('party'), 3600); }
    confetti();
    egg('konami') || toast('🎉 派对模式！');
  });

  /* ============ 3. 散步小人 ============ */
  const W = { on: false, x: 800, y: 640, face: 1, target: null, swim: false, near: null, lastSplash: 0 };
  const walker = layer('walker', `
    <g class="w-fig">
      <ellipse class="w-shadow" rx="15" ry="5"/>
      <g class="w-body">
        <rect class="w-leg w-leg-l" x="-8" y="-15" width="6" height="15" rx="3" fill="${COL.ink}"/>
        <rect class="w-leg w-leg-r" x="2" y="-15" width="6" height="15" rx="3" fill="${COL.ink}"/>
        <rect x="-12" y="-37" width="24" height="25" rx="9" fill="${COL.red}"/>
        <rect x="-4" y="-33" width="8" height="10" rx="2" fill="#fff" opacity=".85"/>
      </g>
      <g class="w-water"><ellipse cy="-8" rx="24" ry="7"/><ellipse cy="-8" rx="34" ry="10"/></g>
      <g class="w-head">
        <circle cx="0" cy="-48" r="13" fill="#FFE2C6" stroke="${COL.ink}" stroke-width="2.5"/>
        <path d="M-14 -50 C-13 -66 13 -66 14 -50 Z" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M6 -53 L22 -53" stroke="${COL.ink}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="6" cy="-46" r="2" fill="${COL.ink}"/>
      </g>
    </g>
    <g class="w-tip" transform="translate(0 -82)"></g>`);
  svg.append(walker);
  const fig = $('.w-fig', walker), tip = $('.w-tip', walker);
  const walkBtn = $('#hudWalk');

  // 河的取样点，用来判断小人是不是掉进河里
  const riverPts = Array.from({ length: Math.ceil(rlen / 10) + 1 }, (_, i) => river.getPointAtLength(Math.min(i * 10, rlen)));
  const inRiver = (x, y) => riverPts.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < 26 * 26);
  const doorOf = s => ({ x: s.x + s.door.x + s.door.w / 2, y: s.y + s.door.y + s.door.h });

  function setTip(text) {
    if (tip.dataset.t === text) return;
    tip.dataset.t = text;
    if (!text) { tip.innerHTML = ''; return; }
    const w = tw(text, 17) + 26;
    tip.innerHTML = `<rect x="${-w / 2}" y="-34" width="${w}" height="34" rx="17" fill="${COL.ink}"/>
      <path d="M-7 -1 L0 8 L7 -1 Z" fill="${COL.ink}"/>
      <text y="-11" text-anchor="middle" font-size="17" fill="#fff">${esc(text)}</text>`;
  }
  function setWalk(on) {
    W.on = on;
    walkBtn.setAttribute('aria-pressed', String(on));
    walkBtn.textContent = on ? '🚶 收工' : '🚶 散步';
    walker.classList.toggle('on', on);
    keys.clear(); W.target = null;
    if (!on) return;
    walkBtn.blur();   // 焦点留在按钮上的话，按回车会再点一次按钮（关掉散步），而不是进楼
    // 在当前看得到的地图中间出场
    const tb = $('.topbar').getBoundingClientRect().bottom;
    const sc = svg.parentElement.getBoundingClientRect();
    const c = toMap((Math.max(sc.left, 0) + Math.min(sc.right, innerWidth)) / 2, (tb + innerHeight) / 2);
    W.x = clamp(c.x, 40, 1560); W.y = clamp(c.y, 80, 1180);
    if (inRiver(W.x, W.y)) W.y -= 70;
    restart(walker, 'pop');
    draw();
    toast(touchy ? '👆 点地图上任意位置，小人就会走过去' : '⌨️ 方向键 / WASD 走路，走到楼门口按回车进去');
  }
  walkBtn.addEventListener('click', () => setWalk(!W.on));

  const KEYMAP = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
  const keys = new Set();
  addEventListener('keydown', e => {
    if (!W.on || mapView.hidden || e.target.closest?.('input, textarea, [contenteditable], .fun-modal')) return;
    const dir = KEYMAP[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); keys.add(dir); W.target = null; return; }
    if (e.key === 'Escape') setWalk(false);
  });
  // 站在楼门口时，回车优先用来进楼：在捕获阶段先拦下，不管焦点停在哪个按钮或地图元素上
  addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !W.on || !W.near || !mapOn()) return;
    if (e.target.closest?.('input, textarea, [contenteditable], .fun-modal, .egg-panel')) return;
    e.preventDefault(); e.stopPropagation();
    keys.clear(); W.target = null;
    enterStop(W.near.id);
  }, true);
  addEventListener('keyup', e => { const dir = KEYMAP[e.key.toLowerCase()]; if (dir) keys.delete(dir); });
  addEventListener('blur', () => keys.clear());
  svg.addEventListener('click', e => {
    if (!W.on || e.target.closest('.stop, .landmark, .mascot, .moon, .fish, .boat, .bike')) return;
    const p = toMap(e.clientX, e.clientY);
    W.target = { x: clamp(p.x, 20, 1580), y: clamp(p.y, 40, 1190) };
  });

  function draw() {
    // 手机上地图被缩小了，小人和提示放大一些才看得清
    const size = innerWidth <= 720 ? 1.6 : 1.15;
    walker.setAttribute('transform', `translate(${W.x.toFixed(1)} ${W.y.toFixed(1)}) scale(${size})`);
    fig.setAttribute('transform', `scale(${W.face} 1)`);
  }
  // 小人走出屏幕前，把页面（和手机上的横向地图）跟着挪
  function follow() {
    const p = toScreen(W.x, W.y - 30);
    const tb = $('.topbar').getBoundingClientRect().bottom;
    if (p.y > innerHeight - 90) scrollBy(0, p.y - (innerHeight - 90));
    else if (p.y < tb + 90) scrollBy(0, p.y - (tb + 90));
    const sc = svg.parentElement;
    if (sc.scrollWidth > sc.clientWidth) {
      const r = sc.getBoundingClientRect();
      if (p.x > r.right - 70) sc.scrollLeft += p.x - (r.right - 70);
      else if (p.x < r.left + 70) sc.scrollLeft -= (r.left + 70) - p.x;
    }
  }
  const SPEED = 250;
  function stepWalker(dt) {
    let vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    let vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (!vx && !vy && W.target) {
      const dx = W.target.x - W.x, dy = W.target.y - W.y, dist = Math.hypot(dx, dy);
      if (dist < 4) W.target = null; else { vx = dx / dist; vy = dy / dist; }
    }
    const m = Math.hypot(vx, vy), moving = m > 0;
    walker.classList.toggle('moving', moving);
    if (moving) {
      const step = Math.min(SPEED * dt, W.target ? Math.hypot(W.target.x - W.x, W.target.y - W.y) : Infinity);
      W.x = clamp(W.x + vx / m * step, 20, 1580);
      W.y = clamp(W.y + vy / m * step, 40, 1190);
      if (Math.abs(vx) > .15) W.face = vx > 0 ? 1 : -1;
      draw();
      follow();
    }
    // 掉进河里？
    const wet = inRiver(W.x, W.y);
    if (wet !== W.swim) {
      W.swim = wet;
      walker.classList.toggle('swim', wet);
      if (wet && Date.now() - W.lastSplash > 2500) {
        W.lastSplash = Date.now();
        egg('splash') || toast(pick(['🌊 扑通！又掉河里了', '🏊 在 Vibe 河里游个泳也不错', '🌊 水有点凉，快上岸']));
      }
    }
    // 走到哪栋楼门口了？
    let near = null, best = 75 * 75;
    for (const s of STOPS) {
      const d = doorOf(s);
      let d2 = (d.x - W.x) ** 2 + (d.y - W.y) ** 2;
      // 走到楼身上或楼下面的名字那里，也算到门口了
      if (Math.abs(W.x - s.x) < 115 && W.y > s.y + 20 && W.y < s.y + s.h + 70) d2 = Math.min(d2, 60 * 60);
      if (d2 < best) { best = d2; near = s; }
    }
    W.near = near;
    setTip(near ? (touchy ? `点一下楼，进「${near.name}」` : `回车 ↵ 进「${near.name}」`) : W.swim ? '咕噜咕噜……' : '');
  }

  /* ============ 动画主循环 ============ */
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!mapView.hidden) {
      if (!reduceMotion) {
        const b = boatState;
        b.d += b.dir * 34 * dt;
        if (b.d > rlen * .94 || b.d < rlen * .06) b.dir *= -1;
        const p = river.getPointAtLength(b.d);
        boat.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(p.y + 4).toFixed(1)}) rotate(${(Math.sin(now / 600) * 5).toFixed(1)}) scale(${b.dir} 1)`);
      }
      if (W.on && !svg.classList.contains('cam')) stepWalker(dt);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ============ 4. 徽章 + 彩纸 ============ */
  function showBadge() {
    const spikes = Array.from({ length: 48 }, (_, i) => {
      const a = i / 48 * Math.PI * 2, r = i % 2 ? 92 : 100;
      return `${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    const m = modal('badge', `
      <svg class="badge-svg" viewBox="0 0 200 200" aria-hidden="true">
        <defs><path id="badgeArc" d="M 100 100 m -66 0 a 66 66 0 1 1 132 0 a 66 66 0 1 1 -132 0"/></defs>
        <polygon points="${spikes}" fill="${COL.yellow}" stroke="${COL.ink}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="100" cy="100" r="80" fill="${COL.blue}"/>
        <circle cx="100" cy="100" r="52" fill="#fff"/>
        <text font-size="15" font-weight="900" fill="#fff" letter-spacing="2" font-family="Rubik, sans-serif"><textPath href="#badgeArc" startOffset="0">VIBERSPACE · EXPLORER · 探险家 ·</textPath></text>
        <image href="assets/logo/icon.png" x="62" y="62" width="76" height="76"/>
      </svg>
      <p class="fun-k">🏅 徽章解锁</p>
      <h3 id="badgeTitle">ViberSpace 探险家</h3>
      <p>地图上的 ${EGGS.length} 个彩蛋全被你找到了。截图发到社团群里，看看还有谁是真·探险家。</p>
      <p class="muted badge-date"></p>
      <div class="fun-btns"><button type="button" class="btn" data-act="ok">收下了 ✌️</button></div>`);
    if (!m.dataset.wired) {
      m.dataset.wired = '1';
      m.setAttribute('aria-labelledby', 'badgeTitle');
      m.addEventListener('click', e => { if (e.target.closest('[data-act="ok"]')) closeModal(m); });
    }
    const dates = Object.values(found).sort();
    $('.badge-date', m).textContent = dates.length ? `解锁于 ${dates[dates.length - 1]}` : '';
    panel.hidden = true;
    openModal(m);
  }

  function confetti() {
    if (reduceMotion) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    box.setAttribute('aria-hidden', 'true');
    const colors = ['#2F6DC2', '#F7A6BC', '#FFE600', '#5CB87A', '#E8463B'];
    box.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${rand(0, 100).toFixed(1)}%;background:${pick(colors)};animation-delay:${rand(0, .6).toFixed(2)}s;animation-duration:${rand(2, 3.4).toFixed(2)}s;--x:${rand(-120, 120).toFixed(0)}px;--r:${rand(360, 1080).toFixed(0)}deg"></i>`).join('');
    document.body.append(box);
    setTimeout(() => box.remove(), 4300);
  }

  updateHud();
})();
