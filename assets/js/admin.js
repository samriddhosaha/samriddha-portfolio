// Owner admin: login, composer (live preview, drag-and-drop uploads), posts, comment moderation, subscribers, newsletter.
// All writes are re-checked on the server; this file is only the UI.
(function () {
  'use strict';
  var root = document.getElementById('admin-root');
  if (!root) return;
  var boot = null, editing = null, media = [], tab = 'compose';

  var $ = function (s, r) { return (r || root).querySelector(s); };
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') el.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]); });
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) add(c); else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (r.status === 401) { showLogin(); } return { ok: r.ok, status: r.status, body: b }; }); });
  }
  function toast(msg, bad) { var t = $('#toast'); if (!t) return; t.className = 'sub-status' + (bad ? ' bad' : ''); t.textContent = msg; }

  // ---------- login ----------
  function showLogin() {
    root.textContent = '';
    var form = h('form', { class: 'comment-form', id: 'login-form', novalidate: true },
      h('h2', { text: 'Sign in', class: 'sub-title' }),
      h('label', { for: 'pw', text: 'Password' }), h('input', { id: 'pw', name: 'password', type: 'password', autocomplete: 'current-password', required: true }),
      h('button', { class: 'btn btn-solid', type: 'submit', text: 'Sign in' }),
      h('p', { class: 'sub-status', role: 'alert', id: 'login-status' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/api/admin/login/', { password: $('#pw').value }).then(function (r) {
        if (r.ok) start(); else { var s = $('#login-status'); s.className = 'sub-status bad'; s.textContent = r.status === 429 ? 'Too many attempts. Try again later.' : 'Wrong password.'; }
      });
    });
    root.appendChild(h('div', { class: 'narrow-form' }, form));
    $('#pw').focus();
  }

  // ---------- shell ----------
  function start() {
    api('GET', '/api/admin/bootstrap/').then(function (r) {
      if (!r.ok) return;
      boot = r.body; render();
    });
  }
  function render() {
    root.textContent = '';
    var tabs = [['compose', editing ? 'Edit item' : 'Compose'], ['posts', 'Posts (' + boot.posts.length + ')'], ['comments', 'Comments (' + boot.pendingComments + ' pending)'], ['subscribers', 'Subscribers (' + boot.subscribers.active + ')'], ['newsletter', 'Newsletter']];
    root.appendChild(h('div', { class: 'admin-bar' },
      h('div', { class: 'admin-tabs', role: 'group', 'aria-label': 'Admin sections' }, tabs.map(function (t) { return h('button', { type: 'button', 'aria-pressed': String(tab === t[0]), onclick: function () { tab = t[0]; if (t[0] !== 'compose') editing = null; render(); }, text: t[1] }); })),
      h('button', { class: 'btn btn-outline', type: 'button', text: 'Sign out', onclick: function () { api('POST', '/api/admin/logout/', {}).then(function () { showLogin(); }); } })));
    root.appendChild(h('p', { class: 'sub-status', id: 'toast', role: 'status', 'aria-live': 'polite' }));
    var view = h('div', { id: 'view' });
    root.appendChild(view);
    ({ compose: composeView, posts: postsView, comments: commentsView, subscribers: subscribersView, newsletter: newsletterView })[tab](view);
  }
  function refresh(keepTab) { return api('GET', '/api/admin/bootstrap/').then(function (r) { if (r.ok) { boot = r.body; if (keepTab !== false) render(); } }); }

  // ---------- compose ----------
  var toLocal = function (ms) { return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  function composeView(view) {
    view.innerHTML = '<form id="composer" class="admin-grid" novalidate><div>' +
      '<div class="field"><label for="f-kind">Type</label><select id="f-kind" name="kind"><option value="post">Post</option><option value="story">Story</option><option value="article">Article (newsletter)</option><option value="update">Update (journey)</option></select></div>' +
      '<div class="field" data-for="article update"><label for="f-title">Title</label><input id="f-title" name="title" maxlength="160"></div>' +
      '<div class="field" data-for="article"><label for="f-slug">URL slug (optional)</label><input id="f-slug" name="slug" maxlength="80" placeholder="auto from title"></div>' +
      '<div class="field" data-for="update"><label for="f-utype">Update type</label><select id="f-utype" name="updateType"></select></div>' +
      '<div class="field"><label for="f-body" id="f-body-label">Text</label><textarea id="f-body" name="bodyMd" rows="9"></textarea><small id="f-count"></small></div>' +
      '<div class="field"><label for="f-tags">Tags (comma separated)</label><input id="f-tags" name="tags" placeholder="sql, power-bi"></div>' +
      '<div class="field" data-for="story"><label for="f-bg">Background (text stories)</label><select id="f-bg" name="bg"></select></div>' +
      '<div class="field-row" data-for="story"><div class="field"><label for="f-exp">Expires after (hours)</label><input id="f-exp" name="expiresInHours" type="number" min="1" max="720" value="24"></div>' +
      '<div class="field"><label for="f-hl">Pin to Highlights</label><select id="f-hl" name="highlightId"></select></div></div>' +
      '<div class="field" data-for="story"><label for="f-newhl">...or new highlight name</label><input id="f-newhl" name="newHighlight" maxlength="40"></div>' +
      '<div class="field" data-for="post"><label for="f-thread">Continue a thread (optional)</label><select id="f-thread" name="threadId"><option value="">New post</option></select></div>' +
      '<div class="field" data-for="post article update"><label><input id="f-pin" name="pinned" type="checkbox" class="chk"> Pin to the top of the feed</label></div>' +
      '<div class="field"><label for="f-when">Publish at (leave empty for now; a future time schedules it)</label><input id="f-when" name="publishAt" type="datetime-local"></div>' +
      '<div class="btn-row"><button class="btn btn-solid" type="submit" data-status="published" id="btn-publish">Publish</button><button class="btn btn-outline" type="submit" data-status="draft" id="btn-draft">Save draft</button><button class="btn btn-ghost" type="button" id="btn-reset">Reset</button></div>' +
      '<div id="form-errors" class="err-text" role="alert"></div></div>' +
      '<div><div class="field"><span id="media-label" class="lbl"><strong>Media</strong></span><div class="drop" id="drop" aria-labelledby="media-label"><p>Drag images or videos here, or</p><label class="btn btn-outline" for="f-files">Choose files</label><input id="f-files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" class="sr-only"><p class="foot-small">Images up to 10 MB (re-encoded in your browser, which strips EXIF/GPS), videos up to 100 MB.</p></div><ul class="up-list" id="up-list"></ul></div>' +
      '<div class="field"><strong id="prev-label">Live preview</strong><div class="preview-box feed-body-md article-body" id="preview" aria-labelledby="prev-label" aria-live="polite"></div></div></div></form>';
    var f = $('#composer');
    var sel = function (id, opts, blank) { var s = $(id); if (blank) s.appendChild(h('option', { value: '', text: blank })); opts.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1] })); }); };
    sel('#f-utype', boot.enums.UPDATE_TYPES.map(function (t) { return [t, t]; }));
    sel('#f-bg', boot.enums.BG_PRESETS.map(function (t) { return [t, t]; }));
    sel('#f-hl', boot.highlights.map(function (x) { return [x.id, x.name]; }), 'Do not pin (expires)');
    sel('#f-thread', boot.rootPosts.map(function (x) { return [x.id, x.excerpt.slice(0, 60)]; }));
    function sync() {
      var k = $('#f-kind').value;
      f.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.dataset.for.split(' ').indexOf(k) < 0; });
      $('#f-body-label').textContent = k === 'article' ? 'Article (Markdown)' : k === 'story' ? 'Story text (max 280)' : 'Text (markdown-lite: **bold**, *italic*, `code`, [links](https://…), #tags)';
      schedulePreview();
    }
    var timer;
    function schedulePreview() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var md = $('#f-body').value; $('#f-count').textContent = md.length + ' characters';
        if (!md.trim()) { $('#preview').textContent = 'Nothing to preview yet.'; return; }
        api('POST', '/api/admin/preview/', { md: md, kind: $('#f-kind').value }).then(function (r) { if (r.ok) $('#preview').innerHTML = r.body.html; });
      }, 350);
    }
    $('#f-kind').addEventListener('change', sync);
    $('#f-body').addEventListener('input', schedulePreview);
    $('#btn-reset').addEventListener('click', function () { editing = null; media = []; render(); });
    media = editing ? (editing.media || []).map(function (m) { return Object.assign({ done: true, preview: mediaPreview(m) }, m); }) : [];
    if (editing) {
      $('#f-kind').value = editing.kind; $('#f-kind').disabled = true;
      $('#f-title').value = editing.title || ''; $('#f-slug').value = editing.slug || ''; if (editing.updateType) $('#f-utype').value = editing.updateType;
      $('#f-body').value = editing.bodyMd; $('#f-tags').value = editing.tags.join(', '); $('#f-pin').checked = !!editing.pinned;
      if (editing.bg) $('#f-bg').value = editing.bg; if (editing.highlightId) $('#f-hl').value = editing.highlightId; if (editing.threadId) $('#f-thread').value = editing.threadId;
      $('#f-when').value = toLocal(editing.publishAt);
    }
    sync(); renderUploads();

    // drag and drop
    var drop = $('#drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    $('#f-files').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = (e.submitter && e.submitter.dataset.status) || 'published';
      var errs = $('#form-errors'); errs.textContent = '';
      if (media.some(function (m) { return !m.done; })) { errs.textContent = 'Wait for uploads to finish.'; return; }
      var kind = $('#f-kind').value;
      var v = function (id) { var x = $(id).value.trim(); return x === '' ? undefined : x; };
      var body = {
        kind: kind, status: status, title: kind === 'article' || kind === 'update' ? v('#f-title') : undefined, slug: kind === 'article' ? v('#f-slug') : undefined, bodyMd: $('#f-body').value,
        updateType: kind === 'update' ? $('#f-utype').value : undefined, tags: $('#f-tags').value.split(',').map(function (t) { return t.trim().replace(/^#/, ''); }).filter(Boolean),
        pinned: $('#f-pin').checked, publishAt: $('#f-when').value ? new Date($('#f-when').value).getTime() : undefined,
        media: media.map(function (m) { return { provider: m.provider, type: m.type, id: m.id, w: m.w, h: m.h, alt: m.alt || '', caption: m.caption || undefined }; }),
      };
      if (kind === 'story') { body.bg = $('#f-bg').value; body.expiresInHours = +$('#f-exp').value || 24; body.highlightId = v('#f-hl'); body.newHighlight = v('#f-newhl'); }
      if (kind === 'post' && v('#f-thread')) body.threadId = v('#f-thread');
      var req = editing ? api('PUT', '/api/admin/posts/' + editing.id + '/', body) : api('POST', '/api/admin/posts/', body);
      req.then(function (r) {
        if (!r.ok) { errs.textContent = (r.body.issues || [{ message: r.body.error || 'Save failed' }]).map(function (i) { return (i.path ? i.path + ': ' : '') + i.message; }).join(' · '); return; }
        var url = r.body.url, saved = editing ? 'Saved.' : (status === 'draft' ? 'Draft saved.' : 'Published.');
        editing = null; media = []; tab = 'posts';
        refresh().then(function () { var t = $('#toast'); t.textContent = saved + ' '; if (status !== 'draft') t.appendChild(h('a', { href: url, text: 'View it' })); });
      });
    });
  }

  function mediaPreview(m) { return m.provider === 'static' ? m.id : m.provider === 'local' ? '/api/media/' + m.id : null; }

  // ---------- uploads ----------
  var IMG = ['image/jpeg', 'image/png', 'image/webp'], VID = ['video/mp4', 'video/webm'];
  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      var isImg = IMG.indexOf(file.type) > -1, isVid = VID.indexOf(file.type) > -1;
      var item = { name: file.name, type: isImg ? 'image' : 'video', alt: '', progress: 0, done: false };
      if (!isImg && !isVid) { item.error = 'Unsupported type (use JPEG, PNG, WebP, MP4 or WebM).'; }
      else if (file.size > (isImg ? boot.limits.image : boot.limits.video)) { item.error = 'Too large (max ' + (isImg ? '10' : '100') + ' MB).'; }
      media.push(item); renderUploads();
      if (item.error) return;
      (isImg ? reencode(file) : Promise.resolve({ blob: file })).then(function (p) {
        item.w = p.w; item.h = p.h; item.preview = URL.createObjectURL(p.blob);
        return uploadBlob(p.blob, item);
      }).then(function (res) { Object.assign(item, res, { done: true, progress: 100 }); renderUploads(); })
        .catch(function (e) { item.error = e.message || 'Upload failed'; renderUploads(); });
    });
  }
  // Canvas re-encode: drops EXIF/GPS, applies orientation, caps size at 2400px.
  function reencode(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * s), hh = Math.round(bmp.height * s);
      var c = document.createElement('canvas'); c.width = w; c.height = hh; c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
      return new Promise(function (ok, no) { c.toBlob(function (b) { b ? ok({ blob: b, w: w, h: hh }) : no(new Error('Could not process image')); }, 'image/webp', 0.86); });
    });
  }
  function uploadBlob(blob, item) {
    return api('POST', '/api/admin/upload-sign/', { type: blob.type || 'video/mp4', size: blob.size }).then(function (s) {
      if (!s.ok) throw new Error(s.body.message || (s.body.issues && s.body.issues[0].message) || 'Upload not allowed');
      return new Promise(function (ok, no) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', s.body.url);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable) { item.progress = Math.round(e.loaded / e.total * 100); var p = document.getElementById('prog-' + item.key); if (p) p.value = item.progress; } };
        xhr.onload = function () {
          var j = {}; try { j = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
          if (xhr.status >= 300) return no(new Error(j.error && j.error.message || j.error || 'Upload failed'));
          if (s.body.provider === 'local') ok({ provider: 'local', id: j.id, type: j.type });
          else ok({ provider: 'cloudinary', id: j.public_id, type: j.resource_type === 'video' ? 'video' : 'image', w: j.width || item.w, h: j.height || item.h });
        };
        xhr.onerror = function () { no(new Error('Network error during upload')); };
        if (s.body.provider === 'local') { xhr.setRequestHeader('x-requested-with', 'fetch'); xhr.send(blob); }
        else { var fd = new FormData(); Object.keys(s.body.fields).forEach(function (k) { fd.append(k, s.body.fields[k]); }); fd.append('file', blob); xhr.send(fd); }
      });
    });
  }
  function renderUploads() {
    var ul = $('#up-list'); if (!ul) return;
    ul.textContent = '';
    media.forEach(function (m, idx) {
      m.key = m.key || Math.random().toString(36).slice(2);
      var thumb = m.preview ? (m.type === 'video' ? h('video', { src: m.preview, muted: true, 'aria-hidden': 'true' }) : h('img', { src: m.preview, alt: '' })) : h('div');
      var body = h('div', {},
        h('p', { class: 'foot-small', text: m.name || m.id }),
        m.error ? h('p', { class: 'err-text', role: 'alert', text: m.error }) : (m.done ? null : h('progress', { id: 'prog-' + m.key, max: '100', value: String(m.progress || 0), 'aria-label': 'Upload progress for ' + (m.name || 'file') })),
        !m.error && m.type === 'image' ? h('div', { class: 'field' }, h('label', { for: 'alt-' + m.key, text: 'Alt text (required)' }), h('input', { id: 'alt-' + m.key, value: m.alt || '', maxlength: '300', oninput: function (e) { m.alt = e.target.value; } })) : null,
        !m.error && m.type === 'video' ? h('div', { class: 'field' }, h('label', { for: 'cap-' + m.key, text: 'Caption / description' }), h('input', { id: 'cap-' + m.key, value: m.caption || '', maxlength: '300', oninput: function (e) { m.caption = e.target.value; m.alt = e.target.value; } })) : null,
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Remove', 'aria-label': 'Remove ' + (m.name || m.id), onclick: function () { media.splice(idx, 1); renderUploads(); } }));
      ul.appendChild(h('li', { class: 'up-item' }, thumb, body));
    });
  }

  // ---------- posts ----------
  function when(p) { var n = Date.now(); if (p.status === 'draft') return 'draft'; if (p.publishAt > n) return 'scheduled'; if (p.expiresAt && p.expiresAt < n) return 'expired'; return 'live'; }
  function postsView(view) {
    if (!boot.posts.length) { view.appendChild(h('div', { class: 'empty' }, h('h3', { text: 'No items yet' }), h('p', { text: 'Use Compose to publish your first one.' }))); return; }
    var tbody = h('tbody');
    boot.posts.forEach(function (p) {
      var live = when(p) === 'live';
      var link = p.kind === 'article' ? '/feed/newsletter/' + p.slug + '/' : p.kind === 'story' ? '/feed/?tab=stories' : '/feed/post/' + p.id + '/';
      tbody.appendChild(h('tr', { 'data-id': p.id },
        h('td', {}, h('strong', { text: p.title || p.excerpt || '(media only)' }), h('br'), h('span', { class: 'foot-small', text: new Date(p.publishAt).toLocaleString() })),
        h('td', { text: p.kind + (p.updateType ? ' / ' + p.updateType : '') }),
        h('td', {}, h('span', { class: 'status-pill', text: when(p) + (p.pinned ? ' · pinned' : '') })),
        h('td', {}, h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn btn-outline', text: 'Edit', 'aria-label': 'Edit ' + (p.title || p.excerpt), onclick: function () { api('GET', '/api/admin/posts/' + p.id + '/').then(function (r) { if (r.ok) { editing = r.body.post; tab = 'compose'; render(); } }); } }),
          live ? h('a', { class: 'btn btn-outline', href: link, text: 'View' }) : null,
          p.kind !== 'story' ? h('button', { type: 'button', class: 'btn btn-outline', text: p.pinned ? 'Unpin' : 'Pin', onclick: function () { api('POST', '/api/admin/posts/' + p.id + '/pin/', { pinned: !p.pinned }).then(function () { refresh(); }); } }) : null,
          h('button', { type: 'button', class: 'btn btn-outline', text: 'Delete', 'aria-label': 'Delete ' + (p.title || p.excerpt), onclick: function () { if (confirm('Delete this item permanently?')) api('DELETE', '/api/admin/posts/' + p.id + '/').then(function () { refresh(); }); } })))));
    });
    view.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'admin-table' }, h('caption', { text: 'All feed items' }), h('thead', {}, h('tr', {}, h('th', { text: 'Item' }), h('th', { text: 'Type' }), h('th', { text: 'State' }), h('th', { text: 'Actions' }))), tbody)));
  }

  // ---------- comments ----------
  function commentsView(view) {
    var holder = h('div');
    var sel = h('select', { id: 'c-status', onchange: load }, ['pending', 'approved', 'rejected'].map(function (s) { return h('option', { value: s, text: s }); }));
    view.appendChild(h('div', { class: 'field' }, h('label', { for: 'c-status', text: 'Show' }), sel));
    view.appendChild(holder);
    function load() {
      api('GET', '/api/admin/comments/?status=' + sel.value).then(function (r) {
        holder.textContent = '';
        if (!r.ok) return;
        if (!r.body.comments.length) { holder.appendChild(h('div', { class: 'empty' }, h('h3', { text: 'Nothing ' + sel.value }), h('p', { text: 'The moderation queue is empty.' }))); return; }
        r.body.comments.forEach(function (c) {
          var act = function (status, label) { return h('button', { type: 'button', class: 'btn btn-outline', text: label, 'aria-label': label + ' comment by ' + c.name, onclick: function () { api('POST', '/api/admin/comments/', { id: c.id, status: status }).then(function () { refresh(false); load(); }); } }); };
          holder.appendChild(h('article', { class: 'feed-card', 'data-comment': c.id },
            h('p', { class: 'feed-meta', text: c.name + ' on "' + (c.postTitle || c.postExcerpt || c.postId) + '" · ' + new Date(c.createdAt).toLocaleString() }),
            h('p', { text: c.body }),
            h('div', { class: 'row-actions' }, c.status !== 'approved' ? act('approved', 'Approve') : null, c.status !== 'rejected' ? act('rejected', 'Reject') : null)));
        });
      });
    }
    load();
  }

  // ---------- subscribers / newsletter ----------
  function subscribersView(view) {
    api('GET', '/api/admin/subscribers/').then(function (r) {
      if (!r.ok) return;
      if (!r.body.subscribers.length) { view.appendChild(h('div', { class: 'empty' }, h('h3', { text: 'No subscribers yet' }), h('p', { text: 'People who confirm by email will appear here.' }))); return; }
      view.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'admin-table' }, h('caption', { text: 'Subscribers' }), h('thead', {}, h('tr', {}, h('th', { text: 'Email' }), h('th', { text: 'Status' }), h('th', { text: 'Joined' }))),
        h('tbody', {}, r.body.subscribers.map(function (s) { return h('tr', {}, h('td', { text: s.email }), h('td', {}, h('span', { class: 'status-pill', text: s.status })), h('td', { text: new Date(s.createdAt).toLocaleDateString() })); })))));
    });
  }
  function newsletterView(view) {
    var arts = boot.posts.filter(function (p) { return p.kind === 'article' && p.status === 'published'; });
    view.appendChild(h('p', { text: 'Send a published article to ' + boot.subscribers.active + ' confirmed subscriber(s). You must send a test to yourself first' + (boot.ownerEmail ? '.' : ' (set OWNER_EMAIL first).') }));
    if (!arts.length) { view.appendChild(h('div', { class: 'empty' }, h('h3', { text: 'No published articles' }), h('p', { text: 'Publish an article to send it as an issue.' }))); return; }
    arts.forEach(function (p) {
      var send = function (mode) {
        if (mode === 'send' && !confirm('Send "' + p.title + '" to ' + boot.subscribers.active + ' subscriber(s)? This cannot be undone.')) return;
        toast('Sending…');
        api('POST', '/api/admin/newsletter/', { postId: p.id, mode: mode }).then(function (r) { toast(r.ok ? (mode === 'test' ? 'Test sent to you.' : 'Sent to ' + r.body.sent + ' subscriber(s).') : (r.body.message || r.body.error || 'Failed'), !r.ok); });
      };
      view.appendChild(h('article', { class: 'feed-card', 'data-article': p.id }, h('h3', { class: 'feed-title', text: p.title }), h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-outline', text: 'Send test to me', 'aria-label': 'Send test of ' + p.title + ' to me', onclick: function () { send('test'); } }),
        h('button', { type: 'button', class: 'btn btn-solid', text: 'Send to subscribers', 'aria-label': 'Send ' + p.title + ' to subscribers', onclick: function () { send('send'); } }))));
    });
  }

  api('GET', '/api/admin/me/').then(function (r) { if (r.ok && r.body.authenticated) start(); else showLogin(); });
})();
