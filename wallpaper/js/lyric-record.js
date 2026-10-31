/* Transparent record-player lyric mode. No mouse handlers or animation-frame loop. */
(function () {
  'use strict';
  var layer, voices, empty, current, lastIndex = -2, lastTime = 0, active = false;
  var source = null, lines = [], fontKey = '', pending = [];

  function ensure() {
    if (layer) return;
    layer = document.createElement('section');
    layer.id = 'recordLyrics';
    layer.className = 'record-layer';
    layer.hidden = true;
    layer.setAttribute('aria-label', '唱片歌词');
    layer.innerHTML =
      '<div class="record-deck" aria-hidden="true">' +
        '<div class="record-vinyl"><i class="record-grooves"></i><i class="record-label"></i><i class="record-spindle"></i></div>' +
        '<i class="record-arm"></i><i class="record-speck"></i>' +
      '</div><div class="record-voices" aria-live="polite"></div>' +
      '<div class="record-empty">等待歌词落针</div>';
    voices = layer.querySelector('.record-voices');
    empty = layer.querySelector('.record-empty');
    document.body.appendChild(layer);
    new MutationObserver(syncFont).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    syncFont();
  }
  function syncFont() {
    if (!layer) return;
    var key = (document.body.className.match(/\bfont-\S+/) || ['default'])[0];
    if (key === fontKey) return;
    var probe = document.querySelector('#lyrics .main') || document.getElementById('lyrics') || document.body;
    layer.style.fontFamily = getComputedStyle(probe).fontFamily;
    fontKey = key;
  }
  function reset() {
    pending.forEach(clearTimeout);
    pending = [];
    if (voices) voices.replaceChildren();
    current = null;
    lastIndex = -2;
  }
  function setLyrics(value) {
    if (source === value) return;
    source = value;
    lines = (Array.isArray(value) ? value : []).filter(function (line) {
      return line && Number.isFinite(+line.t) && typeof line.text === 'string' && line.text.trim();
    }).map(function (line) { return { t: +line.t, text: line.text, sub: typeof line.sub === 'string' ? line.sub : '' }; });
    lines.sort(function (a, b) { return a.t - b.t; });
    reset();
  }
  function setActive(value) {
    ensure();
    var next = !!value;
    if (next !== active) reset();
    active = next;
    layer.hidden = !active;
    layer.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) { fontKey = ''; syncFont(); }
  }
  function indexAt(time) {
    var lo = 0, hi = lines.length - 1, result = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].t <= time + 0.15) { result = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return result;
  }
  function makeVoice(line, index) {
    var row = document.createElement('div');
    row.className = 'record-voice';
    row.dataset.index = String(index);
    var main = document.createElement('div');
    main.className = 'record-main';
    var chars = Array.from(line.text);
    row.style.setProperty('--record-fit', Math.max(0.58, Math.min(1, 38 / Math.max(1, chars.length))).toFixed(3));
    chars.forEach(function (ch, i) {
      var span = document.createElement('span');
      span.className = 'record-char';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.setProperty('--letter-delay', (-i * 0.19).toFixed(2) + 's');
      main.appendChild(span);
    });
    row.appendChild(main);
    if (line.sub) {
      var sub = document.createElement('div');
      sub.className = 'record-sub';
      sub.textContent = line.sub;
      row.appendChild(sub);
    }
    return row;
  }
  function retire(row) {
    row.classList.add('is-retiring');
    row.setAttribute('aria-hidden', 'true');
    var timer = setTimeout(function () {
      row.remove();
      pending = pending.filter(function (id) { return id !== timer; });
    }, 1800);
    pending.push(timer);
  }
  function update(time, playing) {
    if (!active) return;
    if (!Number.isFinite(time)) return;
    layer.classList.toggle('is-paused', !playing);
    var index = indexAt(time);
    empty.textContent = lines.length ? '前奏 · 等待落针' : '等待歌词落针';
    empty.hidden = index >= 0;
    if (index === lastIndex) { lastTime = time; return; }
    var seek = lastIndex >= 0 && (Math.abs(index - lastIndex) > 1 || time < lastTime - 0.5);
    if (seek) reset();
    else if (current) retire(current);
    current = null;
    if (index >= 0) {
      current = makeVoice(lines[index], index);
      voices.appendChild(current);
      // At most one arriving line and two fading lines, even for dense lyrics.
      while (voices.children.length > 3) voices.firstElementChild.remove();
    }
    lastIndex = index;
    lastTime = time;
  }
  window.MikuRecordLyrics = { setLyrics: setLyrics, setActive: setActive, update: update };
})();
