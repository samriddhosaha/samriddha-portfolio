(function () {
  'use strict';

  // ---- Footer year (static fallback lives in the HTML)
  var yr = document.querySelectorAll('[data-year]');
  for (var i = 0; i < yr.length; i++) yr[i].textContent = new Date().getFullYear();

  // ---- Mobile menu
  var toggle = document.getElementById('navToggle');
  var list = document.getElementById('navList');
  function setMenu(open, refocus) {
    list.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open && refocus) toggle.focus();
  }
  if (toggle && list) {
    toggle.addEventListener('click', function () { setMenu(!list.classList.contains('open')); });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && list.classList.contains('open')) setMenu(false, true);
    });
  }

  // ---- Email: assembled at runtime so the address is not in the static HTML.
  var slots = document.querySelectorAll('[data-email]');
  for (var s = 0; s < slots.length; s++) {
    var el = slots[s];
    var addr = el.getAttribute('data-u') + '@' + el.getAttribute('data-d');
    var a = document.createElement('a');
    a.href = 'mailto:' + addr;
    if (el.hasAttribute('data-button')) {
      a.className = 'btn btn-solid';
      a.textContent = 'Email me';
    } else {
      a.textContent = addr;
    }
    el.textContent = '';
    el.appendChild(a);
    var fb = el.parentNode.querySelector('noscript');
    if (fb) fb.parentNode.removeChild(fb);
  }
  var copyBtns = document.querySelectorAll('[data-copy-email]');
  for (var c = 0; c < copyBtns.length; c++) {
    (function (btn) {
      var src = document.querySelector('[data-email]');
      if (!src || !navigator.clipboard) return;
      var addr = src.getAttribute('data-u') + '@' + src.getAttribute('data-d');
      var status = btn.parentNode.querySelector('.copy-status');
      var label = btn.querySelector('[data-label]');
      btn.hidden = false;
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(addr).then(function () {
          if (status) status.textContent = 'Email address copied';
          if (label) label.textContent = 'Copied';
          setTimeout(function () { if (label) label.textContent = 'Copy email'; if (status) status.textContent = ''; }, 2500);
        }, function () { if (status) status.textContent = 'Copy failed. Select the address instead.'; });
      });
    })(copyBtns[c]);
  }

  // ---- Scroll-spy: mark the nav link of the section in view
  var links = document.querySelectorAll('.navlink[href^="/#"], .navlink[href^="#"]');
  if ('IntersectionObserver' in window && links.length && document.getElementById('work')) {
    var byId = {};
    for (var l = 0; l < links.length; l++) byId[links[l].getAttribute('href').replace(/^\/?#/, '')] = links[l];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        for (var k in byId) byId[k].removeAttribute('aria-current');
        if (byId[en.target.id]) byId[en.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    for (var id in byId) { var sec = document.getElementById(id); if (sec) io.observe(sec); }
  }
})();
