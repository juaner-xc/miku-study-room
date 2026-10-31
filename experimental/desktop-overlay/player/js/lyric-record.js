/* Transparent record-player lyric mode. No mouse handlers or animation-frame loop. */
(function () {
  'use strict';
  var layer, voices, empty, current, lastIndex = -2, lastTime = 0, active = false;
  var source = null, lines = [], fontKey = '', flights = [], flightClock = 0, metrics;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    addEventListener('resize', function () { metrics = null; });
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
    flights = [];
    flightClock = 0;
    if (voices) voices.replaceChildren();
    current = null;
    lastIndex = -2;
    metrics = null;
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
    var words = wordsOf(line.text);
    var longest = words.reduce(function (max, word) { return Math.max(max, Array.from(word.trim()).length); }, 1);
    row.style.setProperty('--record-fit', Math.max(0.72, Math.min(1, 10 / longest)).toFixed(3));
    words.forEach(function (word, i) {
      var token = document.createElement('span');
      token.className = 'record-token';
      token.dataset.word = String(i);
      Array.from(word).forEach(function (ch, ci) {
        var span = document.createElement('span');
        span.className = 'record-char';
        span.textContent = /\s/.test(ch) ? '\u00a0' : ch;
        span.style.setProperty('--letter-delay', (-i * 0.23 - ci * 0.12).toFixed(2) + 's');
        token.appendChild(span);
      });
      main.appendChild(token);
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
  function wordsOf(text) {
    var segments;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var locale = /[\u3040-\u30ff]/.test(text) ? 'ja' : /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en';
      segments = Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)).map(function (part) {
        return { text: part.segment, word: !!part.isWordLike };
      });
    } else {
      segments = (text.match(/\s+|[\u3400-\u9fff]{1,2}|[\p{L}\p{N}]+|[^\s]/gu) || []).map(function (part) {
        return { text: part, word: /[\p{L}\p{N}]/u.test(part) };
      });
    }
    var result = [], prefix = '';
    segments.forEach(function (part) {
      if (/^\s+$/.test(part.text)) { prefix += part.text; return; }
      if (part.word || !result.length) { result.push(prefix + part.text); prefix = ''; }
      else { result[result.length - 1] += prefix + part.text; prefix = ''; }
    });
    if (prefix && result.length) result[result.length - 1] += prefix;
    return result;
  }
  function geometry() {
    if (metrics && performance.now() - metrics.measured < 400) return metrics;
    var player = document.getElementById('player');
    var play = document.getElementById('play');
    var r = player && player.getBoundingClientRect();
    var p = play && play.getBoundingClientRect();
    var x = p && p.width ? p.left + p.width / 2 : r && r.width ? r.left + r.width / 2 : innerWidth / 2;
    var y = r && r.height ? r.top - Math.max(8, innerHeight * 0.012) : innerHeight * 0.85;
    metrics = { x: x, y: y, w: innerWidth, h: innerHeight, measured: performance.now() };
    layer.querySelector('.record-deck').style.left = x + 'px';
    layer.querySelector('.record-deck').style.top = y + 'px';
    return metrics;
  }
  function smooth(value) { return value * value * (3 - 2 * value); }
  function paintFlights() {
    var g = geometry();
    flights = flights.filter(function (flight) {
      var unfinished = false;
      flight.words.forEach(function (word) {
        var progress = (flightClock - word.born) / flight.life;
        if (progress >= 1) { word.el.style.opacity = '0'; return; }
        unfinished = true;
        if (progress < 0) { word.el.style.opacity = '0'; return; }
        var angle = progress * Math.PI * 2 * 1.08 + word.order * 0.075;
        var envelope = Math.pow(Math.sin(progress * Math.PI), 0.8);
        var radius = Math.min(g.w * 0.2, Math.max(28, g.w / 2 - word.width * 0.65 - 30));
        var axis = g.x + (g.w * 0.5 - g.x) * smooth(progress);
        var x = axis + Math.sin(angle) * radius * envelope;
        var rise = Math.max(g.h * 0.52, g.y - g.h * 0.18);
        var y = g.y - rise * progress - (1 - Math.cos(angle)) * g.h * 0.07 * envelope;
        var depth = (Math.cos(angle) + 1) / 2;
        var scale = (0.58 + 0.42 * Math.sin(Math.PI * Math.min(0.76, progress))) * (0.91 + depth * 0.13);
        var half = Math.min(g.w * 0.45, word.width * scale / 2 + 18);
        x = Math.max(half, Math.min(g.w - half, x));
        var opacity = smooth(Math.min(1, progress / 0.12)) * (1 - smooth(Math.max(0, Math.min(1, (progress - 0.68) / 0.32)))) * (0.66 + depth * 0.34);
        if (reduceMotion.matches) { x = g.w / 2; y = g.h * (0.34 + word.order * 0.04); scale = 1; }
        word.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) translate(-50%,-50%) rotate(' + (Math.sin(angle) * 2.4).toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')';
        word.el.style.opacity = (opacity * (word.subtitle ? 0.55 : 1)).toFixed(4);
      });
      if (!unfinished) flight.row.remove();
      return unfinished;
    });
  }
  function update(time, playing) {
    if (!active) return;
    if (!Number.isFinite(time)) return;
    layer.classList.toggle('is-paused', !playing);
    var index = indexAt(time);
    empty.textContent = lines.length ? '前奏 · 等待落针' : '等待歌词落针';
    empty.hidden = index >= 0;
    if (lastIndex !== -2 && playing) flightClock += Math.max(0, time - lastTime);
    if (index === lastIndex) { paintFlights(); lastTime = time; return; }
    var seek = lastIndex >= 0 && (Math.abs(index - lastIndex) > 1 || time < lastTime - 0.5);
    if (seek) reset();
    else if (current) {
      current.classList.add('is-retiring');
      current.setAttribute('aria-hidden', 'true');
    }
    current = null;
    if (index >= 0) {
      current = makeVoice(lines[index], index);
      voices.appendChild(current);
      var next = lines[index + 1];
      var gap = next ? Math.max(1, next.t - lines[index].t) : 5;
      var tokens = Array.from(current.querySelectorAll('.record-token'));
      var interval = Math.max(0.13, Math.min(0.8, gap * 0.68 / Math.max(1, tokens.length)));
      var words = tokens.map(function (el, i) { return { el: el, born: flightClock + i * interval, width: el.offsetWidth, order: i }; });
      var sub = current.querySelector('.record-sub');
      if (sub) words.push({ el: sub, born: flightClock + Math.min(1.2, interval * tokens.length), width: sub.offsetWidth, order: tokens.length, subtitle: true });
      flights.push({ row: current, life: Math.max(8, Math.min(12, gap * 1.2 + 4)), words: words });
      // Preserve a few overlapping spirals without letting dense songs fill the screen.
      while (flights.length > 3) flights.shift().row.remove();
    }
    paintFlights();
    lastIndex = index;
    lastTime = time;
  }
  window.MikuRecordLyrics = { setLyrics: setLyrics, setActive: setActive, update: update };
})();
