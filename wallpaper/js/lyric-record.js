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
      var progress = (flightClock - flight.born) / flight.life;
      if (progress >= 1) { flight.row.remove(); return false; }
      progress = Math.max(0, progress);
      var angle = progress * Math.PI * 2 * 1.05;
      var envelope = Math.pow(Math.sin(progress * Math.PI), 0.85);
      var radius = Math.min(g.w * 0.16, Math.max(28, g.w / 2 - flight.width * 0.6 - 30));
      var axis = g.x + (g.w / 2 - g.x) * smooth(progress);
      var x = axis + Math.sin(angle) * radius * envelope;
      var rise = Math.max(g.h * 0.5, g.y - g.h * 0.19);
      var y = g.y - rise * progress + Math.sin(angle * 2) * g.h * 0.022 * envelope;
      var scale = (0.57 + 0.5 * Math.sin(Math.PI * Math.min(0.76, progress))) * (1 + 0.055 * Math.cos(angle));
      var half = Math.min(g.w * 0.45, flight.width * scale / 2 + 18);
      x = Math.max(half, Math.min(g.w - half, x));
      var fadeIn = smooth(Math.min(1, progress / 0.14));
      var fadeOut = 1 - smooth(Math.max(0, Math.min(1, (progress - 0.67) / 0.33)));
      var opacity = fadeIn * fadeOut * (0.78 + 0.22 * (Math.cos(angle) + 1) / 2);
      if (reduceMotion.matches) { x = g.w / 2; y = g.h * 0.44 - progress * g.h * 0.035; scale = 1; }
      flight.row.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) translate(-50%,-50%) rotate(' + (Math.sin(angle) * 2.2).toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')';
      flight.row.style.opacity = opacity.toFixed(4);
      return true;
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
      var width = current.querySelector('.record-main').offsetWidth;
      flights.push({ row: current, born: flightClock, life: Math.max(10, Math.min(16, gap * 1.8 + 5)), width: width });
      // Preserve a few overlapping spirals without letting dense songs fill the screen.
      while (flights.length > 3) flights.shift().row.remove();
    }
    paintFlights();
    lastIndex = index;
    lastTime = time;
  }
  window.MikuRecordLyrics = { setLyrics: setLyrics, setActive: setActive, update: update };
})();
