/* =========================================================================
   Juan Paolo & Arlene — main.js
   Handles: ambient petals, gate + hero entrance, navbar, countdown, scroll reveal,
            gallery + lightbox, accordion, background music toggle.
   ========================================================================= */
(function () {
  'use strict';

  /* -----------------------------------------------------------------
     Wedding config — edit these lines to match the real schedule
     ----------------------------------------------------------------- */
  var WEDDING_DATE_ISO = '2027-01-08T15:30:00+08:00'; // Jan 8, 2027, 3:30 PM (Asia/Manila)

  // Background music — YouTube video ID (from https://www.youtube.com/shorts/bwoBmIm0YI8)
  var YOUTUBE_MUSIC_ID = 'bwoBmIm0YI8';

  /* ---------------------------------------------------------------
     Utility: load a real photo if present, otherwise keep placeholder
     --------------------------------------------------------------- */
  function tryLoadImage(src, onSuccess, onFail) {
    if (!src) { if (onFail) onFail(); return; }
    var img = new Image();
    img.onload = function () { onSuccess(img); };
    img.onerror = function () { if (onFail) onFail(); };
    img.src = src;
  }

  var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================= Ambient: realistic falling petals + soft bokeh (canvas) =================
     Petals are shaded sprites that tumble in 3D (their width foreshortens as they turn), drift on a
     shared, slowly-changing breeze with occasional gusts, and are softened by depth — distant ones are
     smaller, slower and blurred. A few out-of-focus light orbs float up behind them. */
  var PETAL_COLORS = ['#F6C9D2', '#F6C9D2', '#E98CA5', '#FAEBB4', '#D0BDEA', '#F6C9D2', '#93A2E8', '#E98CA5', '#FAEBB4'];
  var LEAF_COLOR = '#AAD450';
  var BOKEH_RGB = ['250,235,180', '246,201,210', '243,182,63', '208,189,234', '147,162,232'];

  function shadeHex(hex, amt) {
    // amt > 0 mixes toward white, amt < 0 toward deep plum
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var t = amt < 0 ? [74, 26, 58] : [255, 255, 255], k = Math.abs(amt);
    return 'rgb(' + Math.round(r + (t[0] - r) * k) + ',' + Math.round(g + (t[1] - g) * k) + ',' + Math.round(b + (t[2] - b) * k) + ')';
  }

  var spriteCache = {};
  function getSprite(kind, color, blur) {
    var key = kind + color + blur;
    if (spriteCache[key]) return spriteCache[key];
    var S = 96, c = document.createElement('canvas');
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    if (blur && 'filter' in g) g.filter = 'blur(' + blur + 'px)';
    g.translate(S / 2, S / 2);
    g.shadowColor = 'rgba(70,30,60,.22)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    g.beginPath();
    if (kind === 'leaf') {
      g.moveTo(0, 36); g.bezierCurveTo(-22, 20, -22, -16, 0, -38); g.bezierCurveTo(22, -16, 22, 20, 0, 36);
    } else { // a blossom petal with a small notch at the tip
      g.moveTo(0, 36); g.bezierCurveTo(-30, 28, -34, -12, -14, -34); g.quadraticCurveTo(-5, -42, 0, -30);
      g.quadraticCurveTo(5, -42, 14, -34); g.bezierCurveTo(34, -12, 30, 28, 0, 36);
    }
    g.closePath();
    var grad = g.createRadialGradient(0, 14, 2, 0, 0, 52);
    grad.addColorStop(0, shadeHex(color, 0.55));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shadeHex(color, -0.16));
    g.fillStyle = grad; g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(110,40,70,.16)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 33); g.lineTo(0, -26); g.stroke();
    for (var i = 1; i <= 3; i++) {
      var y = 26 - i * 14;
      g.beginPath(); g.moveTo(0, y); g.lineTo(-10 + i, y - 9); g.moveTo(0, y); g.lineTo(10 - i, y - 9); g.stroke();
    }
    var sheen = g.createLinearGradient(-20, -30, 10, 10);
    sheen.addColorStop(0, 'rgba(255,255,255,.35)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen; g.fill();
    spriteCache[key] = c;
    return c;
  }

  function initAmbient() {
    var canvas = document.getElementById('ambientCanvas');
    if (!canvas || !canvas.getContext || REDUCED_MOTION) return;
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function makePetal(spreadY) {
      var z = 0.25 + Math.random() * 0.75;                         // depth: small = far away
      var kind = Math.random() < 0.12 ? 'leaf' : 'petal';
      var color = kind === 'leaf' ? LEAF_COLOR : PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0];
      var blur = z < 0.5 ? 2.4 : (z < 0.72 ? 1 : 0);
      return {
        z: z, sprite: getSprite(kind, color, blur),
        size: (13 + Math.random() * 17) * (0.55 + z * 0.9),
        x: Math.random() * (W + 160) - 80,
        y: spreadY ? Math.random() * H : -50 - Math.random() * H * 0.35,
        fall: 26 + z * 54 + Math.random() * 14,
        swayAmp: 14 + Math.random() * 26, swaySpeed: 0.6 + Math.random() * 0.9, swayPhase: Math.random() * 6.28,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.5,
        flipPhase: Math.random() * 6.28, flipSpeed: 1.2 + Math.random() * 2.2,
        alpha: 0.5 + z * 0.45
      };
    }

    var count = W < 600 ? 16 : 32, petals = [], orbs = [], i;
    for (i = 0; i < count; i++) petals.push(makePetal(true));
    for (i = 0; i < (W < 600 ? 5 : 9); i++) {
      orbs.push({
        x: Math.random() * W, y: Math.random() * H, r: 26 + Math.random() * 56,
        vx: (Math.random() - 0.5) * 6, vy: -(4 + Math.random() * 8),
        a: 0.10 + Math.random() * 0.12, rgb: BOKEH_RGB[i % BOKEH_RGB.length], ph: Math.random() * 6.28
      });
    }

    var last = 0, time = 0;
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now; time += dt;
      ctx.clearRect(0, 0, W, H);

      // soft light orbs, drifting upward
      for (var o = 0; o < orbs.length; o++) {
        var b = orbs[o];
        b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * 0.5;
        if (b.y < -b.r) { b.y = H + b.r; b.x = Math.random() * W; }
        var al = b.a * (0.65 + 0.35 * Math.sin(b.ph));
        var rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        rg.addColorStop(0, 'rgba(' + b.rgb + ',' + al + ')');
        rg.addColorStop(1, 'rgba(' + b.rgb + ',0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
      }

      // one shared breeze: slow swell, plus the occasional gentle gust
      var gust = Math.max(0, Math.sin(time * 0.07 + 2)); gust *= gust;
      var wind = Math.sin(time * 0.21) * 14 + Math.sin(time * 0.57 + 1.3) * 8 + gust * 36;

      for (var k = 0; k < petals.length; k++) {
        var p = petals[k];
        p.swayPhase += p.swaySpeed * dt; p.flipPhase += p.flipSpeed * dt;
        p.rot += (p.spin + wind * 0.004) * dt;
        p.x += (wind * (0.3 + p.z) + Math.cos(p.swayPhase) * p.swayAmp * p.swaySpeed * 0.5) * dt;
        p.y += (p.fall + Math.sin(p.flipPhase * 2) * 9) * dt;
        if (p.y > H + 60 || p.x < -140 || p.x > W + 140) { petals[k] = makePetal(false); continue; }

        var turn = Math.cos(p.flipPhase);                           // 1 = face-on, 0 = edge-on, <0 = showing its back
        ctx.save();
        ctx.globalAlpha = p.alpha * (0.62 + 0.38 * Math.abs(turn));
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(turn, 1);
        ctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ================= Letter-by-letter names ================= */
  function splitLetters(el) {
    var text = el.textContent.trim(), idx = 0;
    el.textContent = '';
    var words = text.split(' ');
    words.forEach(function (word, wi) {
      var w = document.createElement('span');
      w.className = 'word';
      word.split('').forEach(function (chr) {
        var s = document.createElement('span');
        s.className = 'ch';
        s.style.setProperty('--i', idx++);
        s.textContent = chr;
        w.appendChild(s);
      });
      el.appendChild(w);
      if (wi < words.length - 1) { el.appendChild(document.createTextNode(' ')); idx++; }
    });
  }

  /* ================= Gate → hero: one choreographed sequence =================
     1. On load the cover builds itself one piece at a time (seal, eyebrow, names letter by letter…).
     2. "Open Invitation": the cover dissolves, then the two doors part.
     3. As they part, the hero builds itself one piece at a time (frame, florals, glow, names, & …). */
  function initGate() {
    var gate = document.getElementById('gate');
    var openBtn = document.getElementById('openInvitation');
    var hero = document.getElementById('home');
    if (!gate || !openBtn) return;

    document.querySelectorAll('[data-split]').forEach(splitLetters);
    document.body.style.overflow = 'hidden';

    // wait for the display fonts so the letters don't jump, but never wait long
    var fontsReady = (document.fonts && document.fonts.ready)
      ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1400); })])
      : Promise.resolve();
    fontsReady.then(function () { gate.classList.add('is-ready'); });

    var f = REDUCED_MOTION ? 0 : 1;
    openBtn.addEventListener('click', function () {
      gate.classList.add('is-opening');                                          // cover dissolves
      playMusic();                                                               // user gesture — safe to start audio
      setTimeout(function () { gate.classList.add('is-open'); }, 650 * f);       // doors part
      setTimeout(function () {                                                   // hero builds itself
        hero.classList.add('is-entering');
        document.body.style.overflow = '';
      }, 1100 * f);
      setTimeout(function () { gate.classList.add('is-gone'); }, 3300 * f);
    }, { once: true });
  }

  /* ================= Navbar ================= */
  function initNavbar() {
    var navbar = document.getElementById('navbar');
    var hamburger = document.getElementById('hamburger');
    var navMenu = document.getElementById('navMenu');
    var links = document.querySelectorAll('.nav-link');
    var lastY = window.scrollY;

    if (hamburger && navMenu) {
      hamburger.addEventListener('click', function () {
        var isOpen = navMenu.classList.toggle('is-open');
        hamburger.setAttribute('aria-expanded', isOpen);
      });
      links.forEach(function (link) {
        link.addEventListener('click', function () {
          navMenu.classList.remove('is-open');
          hamburger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (navbar) {
        navbar.classList.toggle('nav--scrolled', y > 20);
        if (y > lastY && y > var_navH()) {
          navbar.classList.add('nav--hidden');
        } else {
          navbar.classList.remove('nav--hidden');
        }
      }
      lastY = y;
      updateActiveLink();
    }, { passive: true });

    function var_navH() { return 120; }

    var sections = Array.prototype.slice.call(document.querySelectorAll('main > section[id]'));
    function updateActiveLink() {
      var scrollPos = window.scrollY + 140;
      var current = sections[0];
      sections.forEach(function (sec) {
        if (sec.offsetTop <= scrollPos) current = sec;
      });
      links.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + current.id);
      });
    }
    updateActiveLink();
  }

  /* ================= Countdown timer ================= */
  function initCountdown() {
    var target = new Date(WEDDING_DATE_ISO).getTime();
    var elDays = document.getElementById('cd-days');
    var elHours = document.getElementById('cd-hours');
    var elMins = document.getElementById('cd-mins');
    var elSecs = document.getElementById('cd-secs');
    if (!elDays) return;

    function pad(n) { return String(n).padStart(2, '0'); }

    function tick() {
      var now = Date.now();
      var diff = target - now;
      if (diff <= 0) {
        elDays.textContent = elHours.textContent = elMins.textContent = elSecs.textContent = '00';
        clearInterval(timer);
        return;
      }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      elDays.textContent = pad(days);
      elHours.textContent = pad(hours);
      elMins.textContent = pad(mins);
      elSecs.textContent = pad(secs);
    }
    tick();
    var timer = setInterval(tick, 1000);
  }

  /* ================= Scroll-triggered reveal (rise + un-blur, staggered within each batch) ================= */
  function initScrollReveal() {
    var targets = document.querySelectorAll('.section [data-reveal]');
    function settle(el, delayMs) {
      // after the reveal has played, hand hover transitions back to the component
      setTimeout(function () { el.classList.add('revealed'); }, 1500 + delayMs);
    }
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible', 'revealed'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; });
      batch.forEach(function (entry, i) {
        var el = entry.target, delay = Math.min(i, 5) * 140;
        el.style.setProperty('--rd', delay + 'ms');
        el.classList.add('is-visible');
        settle(el, delay);
        observer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ================= Gallery: cinematic carousel + lightbox ================= */
  // Photos: assets/images/gallery/NN.jpg (2400px, full-size view) and gallery/stage/NN.jpg
  // (1400px, carousel). w/h are the 2400px dimensions and drive the carousel layout.
  var GALLERY_ITEMS = [
    { n: '01', w: 2400, h: 1600, caption: 'A quiet moment, side by side' },
    { n: '02', w: 2400, h: 1600, caption: 'Looking up, together' },
    { n: '03', w: 2400, h: 1600, caption: 'Under the A-frame lights' },
    { n: '04', w: 2400, h: 1600, caption: 'Close enough to whisper' },
    { n: '05', w: 2400, h: 1474, caption: 'Hand in hand' },
    { n: '06', w: 2400, h: 1600, caption: 'Game on' },
    { n: '07', w: 1600, h: 2400, caption: 'Cheers to us' },
    { n: '08', w: 2400, h: 1600, caption: 'Spinning with joy' },
    { n: '09', w: 2400, h: 1600, caption: 'Running toward forever' }
  ].map(function (p) {
    return {
      src: 'assets/images/gallery/' + p.n + '.jpg',
      stage: 'assets/images/gallery/stage/' + p.n + '.jpg',
      w: p.w, h: p.h, caption: p.caption
    };
  });

  // How the photos beside the focused one look: smaller, blurred, faded (by distance from the centre)
  var DEPTH = [
    { scale: 1, blur: 0, opacity: 1 },
    { scale: 0.8, blur: 9, opacity: 0.7 },
    { scale: 0.64, blur: 16, opacity: 0.32 },
    { scale: 0.56, blur: 22, opacity: 0 }
  ];
  var AUTOPLAY_MS = 5200;
  var cinema = { index: 0, slides: [], dots: [], timer: null, visible: false, hovering: false };

  function wrapIndex(i) { var n = GALLERY_ITEMS.length; return ((i % n) + n) % n; }

  function layoutCinema() {
    var stage = document.getElementById('cinemaStage');
    if (!stage || !cinema.slides.length) return;
    var W = stage.clientWidth, H = stage.clientHeight, n = GALLERY_ITEMS.length;

    // Unscaled display size of every photo: fit inside 78% of the stage width (so the blurred
    // neighbours peek out at both sides) and 100% of its height
    var widthShare = 0.78;
    var dims = GALLERY_ITEMS.map(function (it) {
      var ratio = it.w / it.h;
      var w = Math.min(W * widthShare, H * ratio);
      return { w: w, h: w / ratio };
    });

    cinema.slides.forEach(function (fig, i) {
      var off = i - cinema.index;
      if (off > n / 2) off -= n;
      if (off < -n / 2) off += n;
      var abs = Math.abs(off);
      var depth = DEPTH[Math.min(abs, 3)];

      // Position: chain outward from the centre so neighbours overlap a little whatever their shape
      var x = 0;
      if (abs > 0) {
        var dir = off > 0 ? 1 : -1;
        var prevW = dims[cinema.index].w;
        for (var k = 1; k <= abs; k++) {
          var sw = dims[wrapIndex(cinema.index + dir * k)].w * DEPTH[Math.min(k, 3)].scale;
          x += dir * (prevW / 2 + sw / 2 - sw * 0.14);
          prevW = sw;
        }
      }

      fig.style.width = dims[i].w + 'px';
      fig.style.height = dims[i].h + 'px';
      fig.style.transform = 'translate(calc(-50% + ' + x.toFixed(1) + 'px), -50%) scale(' + depth.scale + ')';
      fig.style.filter = 'blur(' + depth.blur + 'px)';
      fig.style.opacity = depth.opacity;
      fig.style.zIndex = String(10 - Math.min(abs, 3) * 3);
      fig.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      fig.classList.toggle('is-active', abs === 0);
      fig.setAttribute('aria-hidden', abs === 0 ? 'false' : 'true');
    });
  }

  function goTo(index, fromUser) {
    var next = wrapIndex(index);
    var changed = next !== cinema.index;
    cinema.index = next;
    layoutCinema();

    var captionEl = document.getElementById('cinemaCaption');
    var text = GALLERY_ITEMS[next].caption + '  ·  ' + (next + 1) + ' / ' + GALLERY_ITEMS.length;
    if (changed && captionEl.textContent) {
      captionEl.classList.add('is-changing');
      setTimeout(function () { captionEl.textContent = text; captionEl.classList.remove('is-changing'); }, 220);
    } else {
      captionEl.textContent = text;
    }
    cinema.dots.forEach(function (d, i) {
      d.classList.toggle('is-active', i === next);
      if (i === next) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    if (fromUser) restartAutoplay();
  }

  function autoplayAllowed() {
    return cinema.visible && !cinema.hovering && !document.hidden &&
      document.getElementById('lightbox').hidden &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function stopAutoplay() { clearInterval(cinema.timer); cinema.timer = null; }
  function restartAutoplay() {
    stopAutoplay();
    if (!autoplayAllowed()) return;
    cinema.timer = setInterval(function () { if (autoplayAllowed()) goTo(cinema.index + 1, false); }, AUTOPLAY_MS);
  }

  function initGallery() {
    var stage = document.getElementById('cinemaStage');
    if (!stage) return;
    var root = document.getElementById('cinema');
    var dotsEl = document.getElementById('cinemaDots');
    var total = GALLERY_ITEMS.length;
    var swipe = { x: null, moved: false };

    GALLERY_ITEMS.forEach(function (item, i) {
      var fig = document.createElement('figure');
      fig.className = 'cinema__slide';
      fig.setAttribute('role', 'group');
      fig.setAttribute('aria-roledescription', 'slide');
      fig.setAttribute('aria-label', (i + 1) + ' of ' + total + ': ' + item.caption);

      var img = document.createElement('img');
      img.src = item.stage;
      img.alt = item.caption;
      img.width = item.w;
      img.height = item.h;
      img.decoding = 'async';
      img.draggable = false;
      if (i > 2 && i < total - 1) img.loading = 'lazy';
      fig.appendChild(img);

      fig.addEventListener('click', function () {
        if (swipe.moved) return;
        if (i === cinema.index) openLightbox(i); else goTo(i, true);
      });
      stage.appendChild(fig);
      cinema.slides.push(fig);

      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'cinema__dot';
      dot.setAttribute('aria-label', 'Show photo ' + (i + 1) + ': ' + item.caption);
      dot.addEventListener('click', function () { goTo(i, true); });
      dotsEl.appendChild(dot);
      cinema.dots.push(dot);
    });

    document.getElementById('cinemaPrev').addEventListener('click', function () { goTo(cinema.index - 1, true); });
    document.getElementById('cinemaNext').addEventListener('click', function () { goTo(cinema.index + 1, true); });

    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cinema.index - 1, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cinema.index + 1, true); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(cinema.index); }
    });

    // Swipe / drag
    stage.addEventListener('pointerdown', function (e) { swipe.x = e.clientX; swipe.moved = false; });
    stage.addEventListener('pointerup', function (e) {
      if (swipe.x === null) return;
      var dx = e.clientX - swipe.x;
      swipe.x = null;
      if (Math.abs(dx) > 10) {
        swipe.moved = true;
        setTimeout(function () { swipe.moved = false; }, 60); // swallow the click that follows a drag
        if (Math.abs(dx) > 40) goTo(cinema.index + (dx < 0 ? 1 : -1), true);
      }
    });
    stage.addEventListener('pointercancel', function () { swipe.x = null; });

    // Pause autoplay while the pointer or keyboard focus is on the gallery
    root.addEventListener('pointerenter', function () { cinema.hovering = true; stopAutoplay(); });
    root.addEventListener('pointerleave', function () { cinema.hovering = false; restartAutoplay(); });
    document.addEventListener('visibilitychange', restartAutoplay);

    if ('ResizeObserver' in window) new ResizeObserver(layoutCinema).observe(stage);
    else window.addEventListener('resize', layoutCinema);

    goTo(0, false);

    // Photos start soft-focus and pull sharp the first time the gallery scrolls into view
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          cinema.visible = entry.isIntersecting;
          if (entry.isIntersecting) root.classList.add('is-ready');
          restartAutoplay();
        });
      }, { threshold: 0.35 }).observe(root);
    } else {
      root.classList.add('is-ready');
      cinema.visible = true;
      restartAutoplay();
    }
  }

  var lightboxIndex = 0;
  function openLightbox(index) {
    lightboxIndex = index;
    var imgEl = document.getElementById('lightboxImg');
    imgEl.src = GALLERY_ITEMS[index].stage; // instant (cached) preview while the full-size photo loads
    renderLightbox();
    document.getElementById('lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    stopAutoplay();
  }

  // Blur-transition between photos: the current one softens, the next one loads and pulls into focus
  function renderLightbox() {
    var index = lightboxIndex;
    var item = GALLERY_ITEMS[index];
    var imgEl = document.getElementById('lightboxImg');
    var caption = document.getElementById('lightboxCaption');
    caption.textContent = item.caption + '  ·  ' + (index + 1) + ' / ' + GALLERY_ITEMS.length;
    imgEl.alt = item.caption;
    imgEl.classList.add('is-switching');
    tryLoadImage(item.src, function (loadedImg) {
      if (index !== lightboxIndex) return; // ignore stale loads after fast navigation
      setTimeout(function () {
        if (index !== lightboxIndex) return;
        imgEl.src = loadedImg.src;
        setTimeout(function () { if (index === lightboxIndex) imgEl.classList.remove('is-switching'); }, 40);
      }, 260);
    });
  }

  function closeLightbox() {
    document.getElementById('lightbox').hidden = true;
    document.body.style.overflow = '';
    goTo(lightboxIndex, false); // carousel follows whichever photo was last viewed
    restartAutoplay();
  }

  function initLightboxControls() {
    var closeBtn = document.getElementById('lightboxClose');
    var prevBtn = document.getElementById('lightboxPrev');
    var nextBtn = document.getElementById('lightboxNext');
    var lb = document.getElementById('lightbox');
    if (!lb) return;

    closeBtn.addEventListener('click', closeLightbox);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
    prevBtn.addEventListener('click', function () {
      lightboxIndex = wrapIndex(lightboxIndex - 1);
      renderLightbox();
    });
    nextBtn.addEventListener('click', function () {
      lightboxIndex = wrapIndex(lightboxIndex + 1);
      renderLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevBtn.click();
      if (e.key === 'ArrowRight') nextBtn.click();
    });
  }

  /* ================= Hero background photo (optional upgrade) ================= */
  function initHeroBg() {
    var bg = document.querySelector('.hero__bg');
    if (!bg) return;
    var src = bg.getAttribute('data-img');
    tryLoadImage(src, function (loadedImg) {
      bg.style.backgroundImage = 'linear-gradient(180deg, rgba(255,253,248,.25), rgba(221,232,213,.55)), url(' + loadedImg.src + ')';
      bg.classList.add('has-photo');
    });
  }

  /* ================= FAQ Accordion ================= */
  function initAccordion() {
    var items = document.querySelectorAll('.accordion__item');
    items.forEach(function (item) {
      var trigger = item.querySelector('.accordion__trigger');
      var panel = item.querySelector('.accordion__panel');
      trigger.addEventListener('click', function () {
        var isOpen = trigger.getAttribute('aria-expanded') === 'true';
        items.forEach(function (other) {
          other.querySelector('.accordion__trigger').setAttribute('aria-expanded', 'false');
          other.querySelector('.accordion__panel').style.maxHeight = null;
        });
        if (!isOpen) {
          trigger.setAttribute('aria-expanded', 'true');
          panel.style.maxHeight = panel.scrollHeight + 'px';
        }
      });
    });
  }

  /* =================================================================
     Background music — streamed via the official YouTube IFrame Player
     (embedded, not downloaded — respects the video's own copyright/ToS).
     The player is created hidden/muted-of-visuals on page load; actual
     playback is only ever triggered from a real click (Open Invitation
     or the music-note toggle), which satisfies browser autoplay rules.
     ================================================================= */
  var ytPlayer = null;
  var ytReady = false;
  var ytPlayRequested = false;

  function setMusicButtonState(playing) {
    var btn = document.getElementById('musicToggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(playing));
    btn.classList.toggle('is-playing', playing);
  }

  function playMusic() {
    if (!ytReady || !ytPlayer) { ytPlayRequested = true; return; }
    ytPlayer.playVideo();
  }

  function pauseMusic() {
    if (ytReady && ytPlayer) ytPlayer.pauseVideo();
    setMusicButtonState(false);
  }

  function initYouTubeMusicPlayer() {
    if (!document.getElementById('ytMusicPlayer') || !YOUTUBE_MUSIC_ID) return;

    window.onYouTubeIframeAPIReady = function () {
      ytPlayer = new YT.Player('ytMusicPlayer', {
        height: '1',
        width: '1',
        videoId: YOUTUBE_MUSIC_ID,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 1,
          modestbranding: 1,
          playsinline: 1,
          playlist: YOUTUBE_MUSIC_ID // required by the API for a single video to loop
        },
        events: {
          onReady: function () {
            ytReady = true;
            if (ytPlayRequested) ytPlayer.playVideo();
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) setMusicButtonState(true);
            if (e.data === YT.PlayerState.PAUSED) setMusicButtonState(false);
          },
          onError: function () {
            console.warn('Background music: the configured YouTube video could not be played (removed/private/region-locked?).');
          }
        }
      });
    };

    // The IFrame API script may have already loaded before this ran
    if (window.YT && window.YT.Player) window.onYouTubeIframeAPIReady();
  }

  function initMusicToggle() {
    var btn = document.getElementById('musicToggle');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (ytReady && ytPlayer && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        pauseMusic();
      } else {
        playMusic();
      }
    });
  }

  /* ================= Init ================= */
  document.addEventListener('DOMContentLoaded', function () {
    initAmbient();
    initGate();
    initNavbar();
    initCountdown();
    initScrollReveal();
    initHeroBg();
    initGallery();
    initLightboxControls();
    initAccordion();
    initYouTubeMusicPlayer();
    initMusicToggle();
  });
})();
