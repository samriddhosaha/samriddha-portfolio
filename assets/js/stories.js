// Story viewer: tap/click zones, swipe, hold to pause, progress bars, arrow keys and Esc. Data comes from #story-data.
(function () {
  'use strict';
  var dataEl = document.getElementById('story-data');
  var dlg = document.getElementById('storyViewer');
  if (!dataEl || !dlg || typeof dlg.showModal !== 'function') return;
  var groups = JSON.parse(dataEl.textContent);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bars = dlg.querySelector('[data-bars]'), stage = dlg.querySelector('[data-stage]'), nameEl = dlg.querySelector('[data-sv-name]'), live = dlg.querySelector('[data-sv-status]');
  var opener = null, g = 0, i = 0, raf = 0, start = 0, elapsed = 0, duration = 5000, paused = false, video = null;
  var SEEN = 'storiesSeen';
  var seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch (e) { /* storage unavailable */ }

  function markSeen(grp) {
    var last = grp.items[grp.items.length - 1];
    seen[grp.id] = last.id;
    try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch (e) { /* ignore */ }
    var btn = document.querySelector('.story-ring[data-group="' + grp.id + '"]');
    if (btn) btn.classList.add('seen');
  }
  groups.forEach(function (grp) { if (seen[grp.id] === grp.items[grp.items.length - 1].id) { var b = document.querySelector('.story-ring[data-group="' + grp.id + '"]'); if (b) b.classList.add('seen'); } });

  function buildBars() {
    bars.textContent = '';
    groups[g].items.forEach(function () { var s = document.createElement('span'); s.appendChild(document.createElement('i')); bars.appendChild(s); });
  }
  function fill(idx, frac) { var el = bars.children[idx] && bars.children[idx].firstChild; if (el) el.style.transform = 'scaleX(' + frac + ')'; }

  function tick(ts) {
    if (!start) start = ts;
    if (!paused) { elapsed += ts - start; }
    start = ts;
    fill(i, Math.min(1, elapsed / duration));
    if (elapsed >= duration) { next(); return; }
    raf = requestAnimationFrame(tick);
  }

  function show() {
    cancelAnimationFrame(raf);
    var grp = groups[g], it = grp.items[i];
    nameEl.textContent = grp.name;
    for (var k = 0; k < bars.children.length; k++) fill(k, k < i ? 1 : 0);
    stage.textContent = '';
    video = null; elapsed = 0; start = 0; paused = false;
    if (it.type === 'image') {
      var img = document.createElement('img'); img.src = it.src; img.alt = it.alt; stage.appendChild(img); duration = 5000;
    } else if (it.type === 'video') {
      video = document.createElement('video'); video.src = it.src; video.poster = it.poster; video.playsInline = true; video.muted = true; video.setAttribute('aria-label', it.alt || 'Story video');
      stage.appendChild(video); duration = 15000;
      video.addEventListener('loadedmetadata', function () { if (video && isFinite(video.duration)) duration = video.duration * 1000; });
      if (!reduce) video.play().catch(function () {});
    } else {
      var t = document.createElement('div'); t.className = 'sv-text bg-' + it.bg; t.innerHTML = it.text; stage.appendChild(t); duration = 6000;
    }
    live.textContent = grp.name + ', story ' + (i + 1) + ' of ' + grp.items.length;
    if (i === grp.items.length - 1) markSeen(grp);
    // Reduced motion: no auto-advance; the viewer moves on tap, arrows or buttons.
    if (!reduce) raf = requestAnimationFrame(tick); else fill(i, 1);
  }

  function next() { if (i < groups[g].items.length - 1) { i++; show(); } else if (g < groups.length - 1) { g++; i = 0; buildBars(); show(); } else close(); }
  function prev() { if (i > 0) { i--; show(); } else if (g > 0) { g--; i = groups[g].items.length - 1; buildBars(); show(); } else show(); }
  function open(groupId, index) {
    var gi = groups.findIndex(function (x) { return x.id === groupId; });
    if (gi < 0) return;
    g = gi; i = index || 0; buildBars(); show();
    if (!dlg.open) dlg.showModal();
  }
  function close() { cancelAnimationFrame(raf); if (video) video.pause(); if (dlg.open) dlg.close(); if (opener) opener.focus(); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.story-ring, .story-tile');
    if (!b) return;
    opener = b; open(b.dataset.group, b.dataset.index ? +b.dataset.index : 0);
  });
  // A long press (hold to pause) must not also count as a tap on the nav zones.
  var longPress = false;
  function tap(fn) { return function () { if (longPress) { longPress = false; return; } fn(); }; }
  dlg.querySelector('[data-sv-next]').addEventListener('click', tap(next));
  dlg.querySelector('[data-sv-prev]').addEventListener('click', tap(prev));
  dlg.querySelector('[data-sv-close]').addEventListener('click', close);
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); }); // Esc
  dlg.addEventListener('close', function () { cancelAnimationFrame(raf); if (video) video.pause(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });

  // Hold to pause, swipe to move.
  var sx = 0, sy = 0, held = 0;
  dlg.addEventListener('pointerdown', function (e) { if (e.target.closest('.sv-close')) return; sx = e.clientX; sy = e.clientY; held = Date.now(); paused = true; if (video) video.pause(); });
  function release(e) {
    if (!paused) return;
    paused = false; if (video && !reduce) video.play().catch(function () {});
    var dx = e.clientX - sx, dy = e.clientY - sy;
    longPress = Date.now() - held > 300 || Math.abs(dx) > 50;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); }
    else if (dy > 90) close();
  }
  dlg.addEventListener('pointerup', release);
  dlg.addEventListener('pointercancel', function () { paused = false; });
})();
