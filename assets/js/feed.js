// Feed enhancements: reactions, share, forms, load more, home teaser. Everything has a no-JS fallback (links and plain forms).
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SKELETON = '<div class="skel" aria-hidden="true"><span></span><span></span><span></span></div>';

  function postJson(url, data) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); });
  }

  // ---- per-card enhancements (run on load and after "load more")
  function init(root) {
    $$('.reacts', root).forEach(function (el) { el.hidden = false; });
    $$('.share', root).forEach(function (el) {
      if (el.dataset.ready) return;
      el.dataset.ready = '1';
      var copy = $('[data-copy]', el), nat = $('[data-native]', el), status = $('[data-share-status]', el);
      var url = el.dataset.url, title = el.dataset.title;
      if (copy && navigator.clipboard) {
        copy.hidden = false;
        copy.addEventListener('click', function () {
          navigator.clipboard.writeText(url).then(function () {
            $('[data-label]', copy).textContent = 'Copied'; status.textContent = 'Link copied';
            setTimeout(function () { $('[data-label]', copy).textContent = 'Copy link'; status.textContent = ''; }, 2500);
          }, function () { status.textContent = 'Copy failed'; });
        });
      }
      if (nat && navigator.share) {
        nat.hidden = false;
        nat.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); });
      }
    });
    // Scrollable code blocks and tables must be keyboard-reachable.
    $$('.article-body pre, .article-body table', root).forEach(function (el) { if (el.scrollWidth > el.clientWidth) el.setAttribute('tabindex', '0'); });
  }

  // ---- reactions (event delegation so new cards work)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.react');
    if (!btn) return;
    var box = btn.closest('.reacts');
    btn.disabled = true;
    postJson('/api/react/', { id: box.dataset.id, emoji: btn.dataset.emoji }).then(function (r) {
      btn.disabled = false;
      if (r.status === 429) { btn.focus(); return; }
      if (!r.ok) return;
      $$('.react', box).forEach(function (b) {
        var n = r.body.counts[b.dataset.emoji] || 0;
        $('.n', b).textContent = n || '';
        b.setAttribute('aria-pressed', r.body.mine.indexOf(b.dataset.emoji) > -1 ? 'true' : 'false');
        $('.sr-only', b).textContent = 'React with ' + b.dataset.emoji + '. ' + n + ' so far.';
      });
    }, function () { btn.disabled = false; });
  });

  // ---- subscribe + comment forms
  function enhanceForm(form, okMsg) {
    var status = $('[data-status]', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      btn.disabled = true; status.className = 'sub-status'; status.textContent = 'Sending…';
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      postJson(form.getAttribute('action'), data).then(function (r) {
        btn.disabled = false;
        if (r.ok) { status.textContent = r.body.message || okMsg; form.reset(); return; }
        status.className = 'sub-status bad';
        status.textContent = r.status === 429 ? 'Too many attempts. Please try again later.' : (r.body.issues && r.body.issues.join(' ')) || r.body.message || 'Something went wrong. Please try again.';
      }, function () { btn.disabled = false; status.className = 'sub-status bad'; status.textContent = 'Network error. Please try again.'; });
    });
  }
  $$('[data-subscribe]').forEach(function (f) { enhanceForm(f, 'Check your inbox to confirm.'); });
  $$('[data-comment]').forEach(function (f) { enhanceForm(f, 'Thanks. Your comment is awaiting review.'); });

  // ---- load more
  var more = $('[data-more]'), stream = $('#stream');
  if (more && stream) {
    var statusEl = $('[data-more-status]');
    more.addEventListener('click', function (e) {
      e.preventDefault();
      var q = new URLSearchParams({ tab: stream.dataset.tab, cursor: more.dataset.next });
      if (stream.dataset.tag) q.set('tag', stream.dataset.tag);
      if (stream.dataset.q) q.set('q', stream.dataset.q);
      more.setAttribute('aria-disabled', 'true'); more.textContent = 'Loading…';
      var skel = document.createElement('div'); skel.innerHTML = SKELETON; stream.appendChild(skel.firstChild);
      var tmp = stream.lastElementChild;
      fetch('/api/feed/?' + q.toString(), { headers: { accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
        .then(function (d) {
          tmp.remove();
          var before = stream.lastElementChild;
          stream.insertAdjacentHTML('beforeend', d.html);
          init(stream);
          var first = before ? before.nextElementSibling : stream.firstElementChild;
          if (statusEl) statusEl.textContent = d.count + ' more loaded';
          if (first) { var f = first.querySelector('a'); if (f) f.focus({ preventScroll: false }); }
          if (d.next) { more.dataset.next = d.next; more.removeAttribute('aria-disabled'); more.textContent = 'Load more'; } else more.parentNode.remove();
        })
        .catch(function () {
          tmp.remove();
          more.removeAttribute('aria-disabled'); more.textContent = 'Try again';
          if (statusEl) statusEl.textContent = 'Could not load more items.';
        });
    });
  }

  // ---- home teaser: latest items, with loading / empty / error states
  var teaser = $('[data-teaser]');
  if (teaser) {
    var list = $('[data-teaser-list]', teaser);
    list.innerHTML = SKELETON + SKELETON + SKELETON;
    fetch('/api/feed/?teaser=1&limit=3', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (d) {
        if (!d.html) { list.outerHTML = '<div class="empty"><h3>Nothing yet</h3><p>New posts will appear here.</p></div>'; return; }
        var ul = document.createElement('ul'); ul.className = 'teaser'; ul.innerHTML = d.html;
        list.replaceWith(ul);
      })
      .catch(function () { teaser.hidden = true; }); // a broken Feed must not leave an error block on the home page
  }

  init(document);
})();
