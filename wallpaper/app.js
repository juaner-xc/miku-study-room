/* ------------------------------------------------------------------
   Miku Study Room · Wallpaper Engine web wallpaper
   - 混合音源：默认内置播放（Meting 歌单），检测到系统媒体会话则镜像
   - 居中滚动歌词 / 歌单抽屉 / 番茄钟 / 音频频谱 / 动态背景
------------------------------------------------------------------ */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var WE = typeof window.wallpaperRegisterMediaPropertiesListener === 'function';
  var DEMO = params.has('demo') || !WE;

  var METING = 'https://api.injahow.cn/meting/';
  var PLAYLIST_ID = '17543418420';
  var BRIDGE = 'http://127.0.0.1:51789/';

  var BACKGROUNDS = [
    { src: 'assets/bg/2.webm', poster: 'assets/bg/2.jpg' },
    { src: 'assets/bg/3.webm', poster: 'assets/bg/3.jpg' },
    { src: 'assets/bg/1.webm', poster: 'assets/bg/1.jpg' }
  ];

  var el = {
    bg: $('bg'),
    bgStill: $('bgStill'),
    spectrum: $('spectrum'),
    lyrics: $('lyrics'),
    viewport: $('lyricsViewport'),
    empty: $('lyricsEmpty'),
    cover: $('cover'),
    title: $('title'),
    artist: $('artist'),
    source: $('source'),
    fill: $('fill'),
    pos: $('pos'),
    dur: $('dur'),
    play: $('play'),
    prev: $('prev'),
    next: $('next'),
    listBtn: $('listBtn'),
    pageUp: $('pageUp'),
    pageDown: $('pageDown'),
    scrollRail: $('scrollRail'),
    scrollThumb: $('scrollThumb'),
    drawer: $('drawer'),
    drawerTitle: $('drawerTitle'),
    closeDrawer: $('closeDrawer'),
    playlist: $('playlist'),
    drawerFoot: $('drawerFoot'),
    modeBtn: $('modeBtn'),
    modeText: $('modeText'),
    bgBtn: $('bgBtn'),
    pomo: $('pomodoro'),
    pomoTime: $('pomoTime'),
    pomoLabel: $('pomoLabel'),
    pomoRing: $('pomoRing'),
    toast: $('toast'),
    audio: $('audio')
  };

  var S = {
    songs: [],
    index: 0,
    mode: 'local',
    playing: false,
    position: 0,
    duration: 0,
    lrc: [],
    lrcIndex: -1,
    mirror: { title: '', artist: '', playing: false, position: 0, duration: 0 },
    netease: { title: '', artist: '', id: '' },
    hasMedia: false,
    autoWindow: true,
    userModeChosen: false,
    demo: DEMO,
    lyricToken: 0,
    mirrorLrcId: ''
  };

  // 从网易云客户端同步过来的当前播放队列
  var queue = { list: [], name: '', id: '', ver: '' };

  /* ------------------------------------------------------------------
     小工具
  ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function cleanName(name) {
    return String(name || '').replace(/\s*-\s*STUDY WITH MIKU ver\.\s*-\s*$/, '');
  }

  var toastTimer = null;
  function toast(text, ms) {
    el.toast.textContent = text;
    el.toast.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, ms || 2600);
  }

  /* ------------------------------------------------------------------
     歌词
  ------------------------------------------------------------------ */

  function parseLrc(text) {
    var map = {};
    var re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

    String(text || '').split(/\r?\n/).forEach(function (line) {
      var stamps = [];
      var m;
      while ((m = re.exec(line)) !== null) {
        var frac = m[3] || '0';
        var ms = frac.length === 3 ? +frac : (+frac) * 10;
        stamps.push(+m[1] * 60 + +m[2] + ms / 1000);
      }
      if (!stamps.length) return;
      var content = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!content) return;

      stamps.forEach(function (t) {
        var key = t.toFixed(2);
        if (!map[key]) {
          map[key] = { t: t, text: content, sub: '' };
        } else if (!map[key].sub) {
          map[key].sub = content;
        } else {
          map[key].sub += ' / ' + content;
        }
      });
    });

    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function renderLyrics(lines) {
    el.lyrics.innerHTML = '';
    el.lyrics.style.transform = 'translateY(0px)';
    S.lrcIndex = -1;

    if (!lines || !lines.length) {
      document.body.classList.add('no-lyrics');
      el.empty.textContent = '暂无歌词 · 尽情享受音乐吧';
      return;
    }

    document.body.classList.remove('no-lyrics');
    var frag = document.createDocumentFragment();
    lines.forEach(function (line, i) {
      var div = document.createElement('div');
      div.className = 'line';
      div.dataset.i = i;
      div.innerHTML = esc(line.text) + (line.sub ? '<span class="sub">' + esc(line.sub) + '</span>' : '');
      frag.appendChild(div);
    });
    el.lyrics.appendChild(frag);
  }

  function centerActive() {
    var active = el.lyrics.querySelector('.line.active');
    if (!active) return;
    var vh = el.viewport.clientHeight;
    var y = active.offsetTop + active.offsetHeight / 2;
    el.lyrics.style.transform = 'translateY(' + (vh / 2 - y) + 'px)';
  }

  function updateLyrics(time) {
    if (!S.lrc.length) return;
    var idx = -1;
    for (var i = 0; i < S.lrc.length; i++) {
      if (S.lrc[i].t <= time + 0.15) idx = i; else break;
    }
    if (idx === S.lrcIndex) return;
    S.lrcIndex = idx;

    var nodes = el.lyrics.children;
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].classList.toggle('active', j === idx);
      nodes[j].classList.toggle('past', j < idx);
      nodes[j].classList.toggle('near', Math.abs(j - idx) === 1);
      nodes[j].classList.toggle('far', Math.abs(j - idx) > 1);
    }
    centerActive();
  }

  function loadLyrics(url, title) {
    var token = ++S.lyricToken;
    S.lrc = [];

    if (!url) {
      renderLyrics([]);
      el.empty.textContent = '暂无歌词 · 尽情享受音乐吧';
      return;
    }

    el.empty.textContent = '歌词加载中…';
    document.body.classList.add('no-lyrics');

    fetch(url)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (text) {
        if (token !== S.lyricToken) return;
        S.lrc = parseLrc(text);
        renderLyrics(S.lrc);
      })
      .catch(function () {
        if (token !== S.lyricToken) return;
        renderLyrics([]);
        el.empty.textContent = '歌词加载失败';
      });
  }

  /* ------------------------------------------------------------------
     播放列表
  ------------------------------------------------------------------ */

  function fetchPlaylist() {
    return fetch(METING + '?server=netease&type=playlist&id=' + encodeURIComponent(PLAYLIST_ID))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data)) return [];
        return data.map(function (s) {
          return {
            name: cleanName(s.name || s.title || ''),
            artist: s.artist || s.author || '',
            url: s.url,
            pic: s.pic || s.cover || '',
            lrc: s.lrc || ''
          };
        }).filter(function (s) { return s.url; });
      });
  }

  function currentList() {
    return (S.mode === 'mirror' && queue.list.length) ? queue.list : S.songs;
  }

  function normTitle(s) {
    return cleanName(String(s || '')).toLowerCase().replace(/\s+/g, '');
  }

  function findQueueIndex(title) {
    var t = normTitle(title);
    if (!t) return -1;
    var i;
    for (i = 0; i < queue.list.length; i++) {
      if (normTitle(queue.list[i].name) === t) return i;
    }
    for (i = 0; i < queue.list.length; i++) {
      var n = normTitle(queue.list[i].name);
      if (n && (n.indexOf(t) >= 0 || t.indexOf(n) >= 0)) return i;
    }
    return -1;
  }


  function syncScrollbar() {
    if (!el.scrollRail || !el.scrollThumb) return;
    if (!el.drawer.classList.contains('open')) return;

    var r = el.playlist.getBoundingClientRect();
    var d = el.drawer.getBoundingClientRect();
    if (r.height <= 0) return;

    var railH = Math.max(40, r.height - 8);
    el.scrollRail.style.top = (r.top - d.top + 4) + 'px';
    el.scrollRail.style.height = railH + 'px';

    var max = el.playlist.scrollHeight - el.playlist.clientHeight;
    var ratio = max > 0 ? el.playlist.scrollTop / max : 0;
    var thumbH = Math.max(30, railH * (el.playlist.clientHeight / Math.max(1, el.playlist.scrollHeight)));
    el.scrollThumb.style.height = thumbH + 'px';
    el.scrollThumb.style.top = (Math.min(1, Math.max(0, ratio)) * (railH - thumbH)) + 'px';
    el.scrollRail.style.opacity = max > 0 ? '1' : '0';
  }


  function updateListButton() {
    var show = S.mode === 'local';
    if (el.listBtn) el.listBtn.style.display = show ? '' : 'none';
    if (!show && el.drawer.classList.contains('open')) {
      el.drawer.classList.remove('open');
      sendAction('showicons').catch(function () {});
    }
  }
  function renderPlaylist() {
    var list = currentList();
    var active = S.mode === 'mirror' ? findQueueIndex(S.mirror.title) : S.index;
    var html = '';

    list.forEach(function (s, i) {
      html += '<li data-i="' + i + '" class="' + (i === active ? 'active' : '') + '">' +
        '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="song"><b>' + esc(s.name) + '</b><small>' + esc(s.artist) + '</small></span>' +
        '</li>';
    });

    el.playlist.innerHTML = html;
    updateListButton();
    setTimeout(syncScrollbar, 0);

    if (S.mode === 'mirror') {
      el.drawerTitle.textContent = queue.name || '网易云歌单';
      el.drawerFoot.textContent = queue.list.length
        ? '同步自网易云 · ' + queue.list.length + ' 首'
        : '等待控制桥同步…';
    } else {
      el.drawerTitle.textContent = 'STUDY WITH MIKU · 歌单';
      el.drawerFoot.textContent = '来自网易云 · ' + S.songs.length + ' 首';
    }
  }

  /* ------------------------------------------------------------------
     网易云队列同步（bridge 读取客户端 playingList）
  ------------------------------------------------------------------ */

  function pollQueue() {
    if (S.mode !== 'mirror') return;

    fetch(BRIDGE + 'queue.version', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (ver) {
        if (!ver || ver === queue.ver) return null;
        return fetch(BRIDGE + 'queue.json', { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (text) {
            if (!text) return;
            var data;
            try { data = JSON.parse(text); } catch (e) { return; }
            applyQueue(data, ver);
          });
      })
      .catch(function () {});
  }


  var neteaseTimer = null;

  function pollNetease() {
    fetch(BRIDGE + 'now.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.title) return;

        var changed = d.title !== S.netease.title || d.artist !== S.netease.artist || (d.id || '') !== (S.netease.id || '');
        S.netease = { title: d.title, artist: d.artist, id: d.id || '' };
        S.hasMedia = true;

        if (S.mode === 'local' && !S.userModeChosen) {
          S.mirror.title = d.title;
          S.mirror.artist = d.artist;
          setMode('mirror');
          changed = true;
        }

        if (S.mode === 'mirror') {
          S.mirror.title = d.title;
          S.mirror.artist = d.artist;
          S.mirror.playing = true;
          el.title.textContent = d.title;
          el.artist.textContent = d.artist;
          setPlaying(true);

          if (changed) {
            if (d.pic) el.cover.src = d.pic;
            if (d.duration) { S.duration = d.duration; S.position = 0; }
            if (d.lrc) loadLyrics(d.lrc, d.title);
            renderProgress();
            renderPlaylist();
          }
        }
      })
      .catch(function () {});
  }

  function applyQueue(data, ver) {
    var list = (data && Array.isArray(data.list)) ? data.list : [];
    queue.ver = ver;

    queue.list = list.map(function (item) {
      var t = item.track || {};
      var album = t.album || {};
      return {
        id: String(t.id || item.id || ''),
        name: t.name || '',
        artist: (t.artists || []).map(function (a) { return a.name; }).filter(Boolean).join(' / '),
        pic: album.picUrl || album.cover || '',
        playlist: item.text || '',
        href: item.href || ''
      };
    }).filter(function (s) { return s.name; });

    queue.name = list.length ? (list[0].text || '') : '';
    queue.id = list.length ? String(list[0].href || '').split('/').pop() : '';

    if (S.mode === 'mirror') {
      renderPlaylist();
      syncMirrorLyrics();
    }
  }

  function syncMirrorLyrics() {
    if (S.mode !== 'mirror') return;

    var idx = findQueueIndex(S.mirror.title);
    if (idx < 0) return;

    var song = queue.list[idx];
    if (!song.id || S.mirrorLrcId === song.id) return;

    S.mirrorLrcId = song.id;
    loadLyrics(METING + '?server=netease&type=lrc&id=' + encodeURIComponent(song.id), song.name);

    if (!document.body.classList.contains('has-cover') && song.pic) {
      el.cover.src = song.pic;
    }
  }

  function selectSong(i, autoplay) {
    if (i < 0 || i >= S.songs.length) return;
    S.index = i;
    var song = S.songs[i];

    if (S.mode !== 'mirror') {
      el.title.textContent = song.name || '未知曲目';
      el.artist.textContent = song.artist || '';
      if (song.pic) {
        el.cover.src = song.pic;
      }
    }

    el.audio.src = song.url;
    if (S.mode !== 'mirror') {
      S.position = 0;
      S.duration = 0;
      el.fill.style.width = '0%';
      el.pos.textContent = '0:00';
      el.dur.textContent = '0:00';
    }

    renderPlaylist();
    if (S.mode !== 'mirror') loadLyrics(song.lrc, song.name);

    if (autoplay !== false) playAudio();
    scrollActiveIntoView();
  }

  function scrollActiveIntoView() {
    var li = el.playlist.querySelector('li.active');
    if (li && el.drawer.classList.contains('open')) {
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* ------------------------------------------------------------------
     音频
  ------------------------------------------------------------------ */

  function playAudio() {
    var p = el.audio.play();
    if (p && p.catch) {
      p.catch(function () {
        toast('点击画面任意位置开始播放');
      });
    }
  }

  function toggleAudio() {
    if (S.mode === 'mirror') { sendAction('playpause'); return; }
    if (el.audio.paused) playAudio(); else el.audio.pause();
  }

  function nextSong(dir) {
    if (!S.songs.length) return;
    var i = (S.index + dir + S.songs.length) % S.songs.length;
    selectSong(i, true);
  }

  el.audio.addEventListener('timeupdate', function () {
    if (S.mode !== 'local') return;
    S.position = el.audio.currentTime || 0;
    S.duration = el.audio.duration || 0;
    renderProgress();
  });

  el.audio.addEventListener('loadedmetadata', function () {
    if (S.mode !== 'local') return;
    S.duration = el.audio.duration || 0;
    renderProgress();
  });

  el.audio.addEventListener('play', function () { setPlaying(true); });
  el.audio.addEventListener('pause', function () { setPlaying(false); });
  el.audio.addEventListener('ended', function () { nextSong(1); });

  function setPlaying(v) {
    S.playing = !!v;
    document.body.classList.toggle('playing', S.playing);
  }

  function renderProgress() {
    var pct = S.duration > 0 ? Math.min(1, S.position / S.duration) * 100 : 0;
    el.fill.style.width = pct + '%';
    el.pos.textContent = fmt(S.position);
    el.dur.textContent = fmt(S.duration);
  }

  /* ------------------------------------------------------------------
     模式：内置 / 镜像系统媒体
  ------------------------------------------------------------------ */

  function setMode(mode, byUser) {
    if (mode === S.mode) return;
    S.mode = mode;
    if (byUser) S.userModeChosen = true;

    document.body.classList.toggle('mirror', mode === 'mirror');
    el.modeText.textContent = mode === 'mirror' ? '跟随系统' : '内置';
    el.source.textContent = mode === 'mirror' ? '网易云' : '内置';

    if (mode === 'mirror') {
      el.audio.pause();
      var m = S.mirror;
      el.title.textContent = m.title || '等待系统媒体';
      el.artist.textContent = m.artist || '';
      S.position = m.position;
      S.duration = m.duration;
      setPlaying(m.playing);
      renderProgress();

      S.mirrorLrcId = '';
      renderPlaylist();
      pollQueue();

      if (findQueueIndex(m.title) >= 0) {
        syncMirrorLyrics();
      } else {
        S.lrc = [];
        renderLyrics([]);
        el.empty.textContent = queue.list.length
          ? '当前歌曲暂无歌词'
          : '运行控制桥后可同步网易云歌单与歌词';
      }
    } else {
      S.mirrorLrcId = '';
      var song = S.songs[S.index];
      if (song) {
        el.title.textContent = song.name;
        el.artist.textContent = song.artist;
        if (song.pic) el.cover.src = song.pic;
        if (S.mode !== 'mirror') loadLyrics(song.lrc, song.name);
      }
      renderPlaylist();
      if (song) playAudio();
    }
  }

  function findSongByTitle(title) {
    if (!title) return null;
    var t = cleanName(title).toLowerCase().replace(/\s+/g, '');
    for (var i = 0; i < S.songs.length; i++) {
      var n = cleanName(S.songs[i].name).toLowerCase().replace(/\s+/g, '');
      if (n && (n === t || n.indexOf(t) >= 0 || t.indexOf(n) >= 0)) return S.songs[i];
    }
    return null;
  }

  function sendAction(action) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        img.src = '';
        reject(new Error('timeout'));
      }, 1500);

      img.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      img.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('offline'));
      };
      img.src = BRIDGE + action + '.gif?t=' + Date.now();
    });
  }

  /* ------------------------------------------------------------------
     系统媒体（SMTC）监听
  ------------------------------------------------------------------ */

  function registerMedia() {
    window.wallpaperPropertyListener = {
      applyUserProperties: function (p) {
        if (!p) return;
        if (p.lyrics && p.lyrics.value === false) {
          document.body.classList.add('no-lyrics');
          el.lyrics.style.display = 'none';
          el.empty.style.display = 'none';
        }
        if (p.spectrum && p.spectrum.value === false) {
          el.spectrum.style.display = 'none';
        }
        if (p.pomodoro && p.pomodoro.value === false) {
          el.pomo.style.display = 'none';
        }
      }
    };

    if (window.wallpaperRegisterAudioListener) {
      window.wallpaperRegisterAudioListener(function (arr) { audioData = arr; });
    }

    window.wallpaperRegisterMediaStatusListener(function (e) {
      if (e && e.enabled === false) {
        S.hasMedia = false;
        if (S.mode === 'mirror') setMode('local');
      }
    });

    window.wallpaperRegisterMediaPropertiesListener(function (e) {
      if (S.netease && S.netease.id) return;
      S.mirror.title = e.title || '';
      S.mirror.artist = e.artist || '';
      S.hasMedia = !!S.mirror.title;

      if (S.mode === 'mirror') {
        el.title.textContent = S.mirror.title || '等待系统媒体';
        el.artist.textContent = S.mirror.artist || '';
        renderPlaylist();
        syncMirrorLyrics();
      } else if (!S.userModeChosen && S.hasMedia) {
        setMode('mirror');
      }
    });

    window.wallpaperRegisterMediaPlaybackListener(function (e) {
      if (S.netease && S.netease.id) return;
      var M = window.wallpaperMediaIntegration || {};
      var playing = (M.PLAYBACK_PLAYING !== undefined)
        ? e.state === M.PLAYBACK_PLAYING
        : e.state === 1;
      S.mirror.playing = playing;
      if (S.mode === 'mirror') setPlaying(playing);

      // 任何时候网易云开始播放，只要用户没手动选过模式，就跟随系统
      if (playing && S.mode === 'local' && !S.userModeChosen) {
        setMode('mirror');
      }
    });

    window.wallpaperRegisterMediaTimelineListener(function (e) {
      if (typeof e.position === 'number') S.mirror.position = e.position;
      if (typeof e.duration === 'number') S.mirror.duration = e.duration;
      if (S.mode === 'mirror') {
        S.position = S.mirror.position;
        S.duration = S.mirror.duration;
        renderProgress();
      }
    });

    window.wallpaperRegisterMediaThumbnailListener(function (e) {
      if (e.thumbnail) {
        el.cover.src = e.thumbnail;
        document.body.classList.add('has-cover');
      }
    });

    setTimeout(function () { S.autoWindow = false; }, 6000);
  }

  /* ------------------------------------------------------------------
     频谱
  ------------------------------------------------------------------ */

  var audioData = null;
  var levels = new Array(64).fill(0);
  var specCtx = null;
  var specGrad = null;

  function sizeSpectrum() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = Math.max(90, Math.round(window.innerHeight * 0.118));
    el.spectrum.width = Math.round(w * dpr);
    el.spectrum.height = Math.round(h * dpr);
    specCtx = el.spectrum.getContext('2d');
    specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    specGrad = specCtx.createLinearGradient(0, h, 0, 0);
    specGrad.addColorStop(0, 'rgba(57,197,187,0.9)');
    specGrad.addColorStop(0.6, 'rgba(255,123,172,0.75)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0.9)');
  }

  function demoAudio(t) {
    var arr = new Array(64);
    for (var i = 0; i < 64; i++) {
      var bass = 0.7 * Math.exp(-i / 11) * (0.55 + 0.45 * Math.sin(t * 4.6 + i * 0.4));
      var mid = 0.4 * Math.exp(-Math.pow((i - 27) / 14, 2)) * (0.55 + 0.45 * Math.sin(t * 2.0 + i * 0.6));
      var hi = 0.16 * Math.exp(-Math.pow((i - 51) / 12, 2)) * (0.5 + 0.5 * Math.sin(t * 7.2 + i * 1.8));
      arr[i] = Math.max(0, Math.min(1, bass + mid + hi + 0.05 * Math.random()));
    }
    return arr;
  }

  function drawSpectrum(now) {
    if (!specCtx) return;
    var src = (DEMO || !audioData) ? demoAudio(now / 1000) : audioData;

    for (var i = 0; i < 64; i++) {
      var v = Math.min(1, Math.max(src[i] || 0, src[i + 64] || 0));
      levels[i] += (v - levels[i]) * 0.3;
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = el.spectrum.width / dpr;
    var h = el.spectrum.height / dpr;
    specCtx.clearRect(0, 0, w, h);

    var gap = Math.max(2, (w / 64) * 0.42);
    var bw = (w - gap * 63) / 64;
    var maxH = h * 0.9;

    specCtx.fillStyle = specGrad;
    for (var b = 0; b < 64; b++) {
      var bh = Math.pow(levels[b], 1.4) * maxH;
      if (bh < 1) bh = 1;
      specCtx.globalAlpha = 0.18 + levels[b] * 0.55;
      specCtx.beginPath();
      specCtx.roundRect(b * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
      specCtx.fill();
    }
    specCtx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------
     番茄钟
  ------------------------------------------------------------------ */

  var POMO = {
    focus: 25 * 60,
    rest: 5 * 60,
    mode: 'focus',
    remain: 25 * 60,
    running: false,
    last: 0
  };

  function updatePomo() {
    el.pomoTime.textContent = fmt(POMO.remain);
    el.pomoLabel.textContent = POMO.mode === 'focus' ? '专注' : '休息';
    el.pomo.classList.toggle('break', POMO.mode === 'rest');
    el.pomo.classList.toggle('running', POMO.running);

    var total = POMO.mode === 'focus' ? POMO.focus : POMO.rest;
    var ratio = total > 0 ? POMO.remain / total : 0;
    el.pomoRing.style.strokeDashoffset = String(119.4 * (1 - ratio));
  }

  function togglePomo() {
    POMO.running = !POMO.running;
    updatePomo();
  }

  function resetPomo() {
    POMO.mode = 'focus';
    POMO.remain = POMO.focus;
    POMO.running = false;
    updatePomo();
  }

  function tickPomo(dt) {
    if (!POMO.running) return;
    POMO.remain -= dt;
    if (POMO.remain <= 0) {
      if (POMO.mode === 'focus') {
        POMO.mode = 'rest';
        POMO.remain = POMO.rest;
        toast('专注结束 · 休息 5 分钟');
      } else {
        POMO.mode = 'focus';
        POMO.remain = POMO.focus;
        toast('休息结束 · 继续加油');
      }
      POMO.running = false;
    }
    updatePomo();
  }

  /* ------------------------------------------------------------------
     背景
  ------------------------------------------------------------------ */

  var bgIndex = 0;
  var bgTimer = null;
  var bgFails = 0;

  function applyBg(i) {
    bgIndex = ((i % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length;
    var item = BACKGROUNDS[bgIndex];

    el.bg.classList.remove('ready');
    clearTimeout(bgTimer);

    // 先显示静态帧，视频就绪后再淡入
    if (el.bgStill.src.indexOf(item.poster) === -1) {
      el.bgStill.src = item.poster;
    }

    bgTimer = setTimeout(function () {
      el.bg.poster = item.poster;
      el.bg.src = item.src;
      var p = el.bg.play();
      if (p && p.catch) p.catch(function () {});
    }, 260);
  }

  el.bg.addEventListener('canplay', function () {
    bgFails = 0;
    el.bg.classList.add('ready');
  });

  el.bg.addEventListener('error', function () {
    el.bg.classList.remove('ready');
    bgFails++;
    if (bgFails < BACKGROUNDS.length) applyBg(bgIndex + 1);
  });

  /* ------------------------------------------------------------------
     演示数据
  ------------------------------------------------------------------ */

  var DEMO_LRC = [
    { t: 0, text: '夜が明ける 街の音' },
    { t: 9, text: 'まだ眠い目をこすって' },
    { t: 18, text: '今日もまた はじまる' },
    { t: 27, text: '窓の外 光がさす' },
    { t: 36, text: '君の声が聞こえた気がした' },
    { t: 45, text: '遠く 遠く 響いて' },
    { t: 54, text: 'この瞬間を 忘れないように' },
    { t: 63, text: '心に刻んで 歩いてゆく' },
    { t: 72, text: '夢の続きを 探しにゆこう' },
    { t: 81, text: '何度でも 立ち上がって' }
  ];

  function startDemo() {
    S.songs = [
      { name: '夜明けの旋律', artist: 'Aoi Tsubaki', url: '', pic: 'assets/demo-cover.png', lrc: '' },
      { name: 'Starlight Memo', artist: 'Miku', url: '', pic: 'assets/demo-cover.png', lrc: '' },
      { name: '放課後のソーダ', artist: 'Miku', url: '', pic: 'assets/demo-cover.png', lrc: '' }
    ];
    S.index = 0;
    el.title.textContent = S.songs[0].name;
    el.artist.textContent = S.songs[0].artist;
    el.cover.src = S.songs[0].pic;
    el.source.textContent = '内置';
    S.duration = 214;
    S.position = 63;
    S.playing = true;
    document.body.classList.add('playing', 'has-cover');
    S.lrc = DEMO_LRC;
    renderLyrics(S.lrc);
    renderPlaylist();
    renderProgress();
    updateLyrics(S.position);
    updatePomo();
  }

  /* ------------------------------------------------------------------
     主循环
  ------------------------------------------------------------------ */

  var last = performance.now();

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (S.demo) {
      S.position += dt;
      if (S.position > S.duration) S.position = 0;
      renderProgress();
      updateLyrics(S.position);
    } else if (S.mode === 'local') {
      updateLyrics(S.position);
    } else {
      if (S.mirror.playing) {
        S.position = Math.min(S.duration || 1e9, S.position + dt);
        renderProgress();
      }
      updateLyrics(S.position);
    }

    tickPomo(dt);
    drawSpectrum(now);

    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     事件绑定
  ------------------------------------------------------------------ */

  function bind() {
    el.cover.addEventListener('load', function () {
      document.body.classList.add('has-cover');
    });

    el.play.addEventListener('click', toggleAudio);
    el.prev.addEventListener('click', function () {
      if (S.mode === 'mirror') { sendAction('prev').catch(function () {}); return; }
      nextSong(-1);
    });
    el.next.addEventListener('click', function () {
      if (S.mode === 'mirror') { sendAction('next').catch(function () {}); return; }
      nextSong(1);
    });

    el.pageUp.addEventListener('click', function () {
      el.playlist.scrollBy({ top: -Math.max(120, el.playlist.clientHeight * 0.85), behavior: 'smooth' });
    });
    el.pageDown.addEventListener('click', function () {
      el.playlist.scrollBy({ top: Math.max(120, el.playlist.clientHeight * 0.85), behavior: 'smooth' });
    });
    el.listBtn.addEventListener('click', function () {
      var open = el.drawer.classList.toggle('open');
      sendAction(open ? 'hideicons' : 'showicons').catch(function () {});
      if (open) { scrollActiveIntoView(); setTimeout(syncScrollbar, 80); }
    });
    el.closeDrawer.addEventListener('click', function () {
      el.drawer.classList.remove('open');
      sendAction('showicons').catch(function () {});
    });

    // 滚轮：在 window 捕获，避免事件被别的层吃掉
    window.addEventListener('wheel', function (e) {
      if (!el.drawer.classList.contains('open')) return;
      var r = el.playlist.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      el.playlist.scrollTop += e.deltaY;
      syncScrollbar();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    // 拖滚动条滑块
    var thumbDrag = null;
    el.scrollThumb.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      thumbDrag = { y: e.clientY, top: el.playlist.scrollTop };
    });
    window.addEventListener('mousemove', function (e) {
      if (!thumbDrag) return;
      var railH = el.scrollRail.clientHeight;
      var thumbH = el.scrollThumb.clientHeight;
      var track = Math.max(1, railH - thumbH);
      var ratio = (el.playlist.scrollHeight - el.playlist.clientHeight) / track;
      el.playlist.scrollTop = thumbDrag.top + (e.clientY - thumbDrag.y) * ratio;
      syncScrollbar();
    });
    window.addEventListener('mouseup', function () { thumbDrag = null; });

    el.scrollRail.addEventListener('mousedown', function (e) {
      if (e.target === el.scrollThumb) return;
      var rect = el.scrollRail.getBoundingClientRect();
      var ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
      el.playlist.scrollTop = ratio * (el.playlist.scrollHeight - el.playlist.clientHeight);
      syncScrollbar();
    });

    el.playlist.addEventListener('scroll', syncScrollbar);

    // 壁纸被切换/关闭时恢复图标，避免图标一直隐藏
    window.addEventListener('pagehide', function () {
      try { fetch(BRIDGE + 'showicons.gif', { keepalive: true, mode: 'no-cors' }); } catch (e) {}
    });

    el.playlist.addEventListener('click', function (e) {
      var li = e.target.closest('li');
      if (!li) return;
      if (S.mode === 'mirror') {
        toast('跟随系统模式：请在网易云里切歌');
        return;
      }
      selectSong(+li.dataset.i, true);
    });

    el.modeBtn.addEventListener('click', function () {
      setMode(S.mode === 'local' ? 'mirror' : 'local', true);
    });

    el.bgBtn.addEventListener('click', function () {
      applyBg(bgIndex + 1);
      toast('背景 ' + (bgIndex + 1) + ' / ' + BACKGROUNDS.length);
    });

    el.pomo.addEventListener('click', togglePomo);
    el.pomo.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      resetPomo();
      toast('番茄钟已重置');
    });

    document.addEventListener('mousemove', function () {
      document.body.classList.remove('idle');
    });

    window.addEventListener('resize', function () {
      sizeSpectrum();
      centerActive();
    });

    // 不在这里自动播放：只有点播放器按钮才开始，避免点桌面就出声
  }

  /* ------------------------------------------------------------------
     启动
  ------------------------------------------------------------------ */

  function start() {
    sizeSpectrum();
    applyBg(0);
    bind();
    updatePomo();
    setInterval(pollQueue, 2500);
    setInterval(pollNetease, 2000);
    pollNetease();
    requestAnimationFrame(loop);

    if (DEMO) {
      startDemo();
      return;
    }

    registerMedia();

    fetchPlaylist()
      .then(function (songs) {
        if (!songs.length) throw new Error('empty');
        S.songs = songs;
        renderPlaylist();
        el.drawerFoot.textContent = '来自网易云 · ' + songs.length + ' 首';
        selectSong(0, false);
        // 不自动播放：默认安静，用户点播放器 ▶ 才出声
      })
      .catch(function () {
        el.title.textContent = '歌单加载失败';
        el.artist.textContent = '检查网络后重试';
        toast('Meting 接口暂不可用');
      });
  }

  start();
})();
