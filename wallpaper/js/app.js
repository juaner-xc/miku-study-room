/* ------------------------------------------------------------------
   Miku Study Room · Wallpaper Engine web wallpaper
   - 混合音源：默认内置播放（Meting 歌单），检测到系统媒体会话则镜像
   - 居中滚动歌词 / 歌单抽屉 /  / 音频频谱 / 动态背景
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
    settingsPanel: $('settingsPanel'),
    settingsBtn: $('settingsBtn'),
    closeSettings: $('closeSettings'),
    drawerTitle: $('drawerTitle'),
    closeDrawer: $('closeDrawer'),
    playlist: $('playlist'),
    drawerFoot: $('drawerFoot'),
    modeBtn: $('modeBtn'),
    modeText: $('modeText'),
    bgBtn: $('bgBtn'),
    themeBtn: $('themeBtn'),
    offMinus: $('offMinus'),
    offPlus: $('offPlus'),
    offVal: $('offVal'),
    modeChips: $('modeChips'),
    modePicker: $('modePicker'),
    fontPicker: $('fontPicker'),
    fontChips: $('fontChips'),
    bgChips: $('bgChips'),
    sourceChips: $('sourceChips'),
    aiOpen: $('aiOpen'),
    aiEnabled: $('aiEnabled'),
    aiBase: $('aiBase'),
    aiKey: $('aiKey'),
    aiModel: $('aiModel'),
    aiSave: $('aiSave'),
    aiState: $('aiState'),
    fontBtn: $('fontBtn'),
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

      var inlineSub = '';
      var inlineMatch = content.match(/^(.*?)[（(【\[]([^）)】\]]*[\u4e00-\u9fa5][^）)】\]]*)[）)】\]]\s*$/);
      if (inlineMatch && inlineMatch[1].trim()) {
        content = inlineMatch[1].trim();
        inlineSub = inlineMatch[2].trim();
      }
      if (/^[^：:]{0,24}(作词|作曲|词曲|编曲|改编|制作|监制|混音|母带|录音|吉他|贝斯|鼓|和声|和音|配唱|伴唱|人声|弦乐|钢琴|键盘|出品|发行|统筹|企划|封面|OP|SP)[^：:]{0,24}[：:]/.test(content)) return;

      stamps.forEach(function (t) {
        var key = t.toFixed(2);
        if (!map[key]) {
          map[key] = { t: t, text: content, sub: inlineSub };
        } else if (!map[key].sub) {
          map[key].sub = content || inlineSub;
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
    S.lrcIndex = -999;

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
      div.innerHTML = '<span class="main">' + colorizeLyric(line.text) + '</span>' +
        (line.sub ? '<span class="sub">' + (S.lyricTheme === 'lumiere' ? colorizeSub(line.sub) : esc(line.sub)) + '</span>' : '');
      frag.appendChild(div);
    });
    el.lyrics.appendChild(frag);
  }

  function centerActive() {
    var active = el.lyrics.querySelector('.line.active');
    if (!active) return;
    var target = active.querySelector('.main') || active;
    var vh = el.viewport.clientHeight;

    var top = 0;
    var node = target;
    while (node && node !== el.lyrics) {
      top += node.offsetTop;
      node = node.offsetParent;
    }

    var y = top + target.offsetHeight / 2;
    el.lyrics.style.transform = 'translateY(' + (vh / 2 - y) + 'px)';
  }


  function setLyricOffset(v) {
    v = Math.max(-5, Math.min(5, Math.round(v * 10) / 10));
    S.lyricOffset = v;
    try { localStorage.setItem('lyricOffset', String(v)); } catch (e) {}
    if (el.offVal) el.offVal.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + 's';
    S.lrcIndex = -999;
    updateLyrics(S.position);
  }


  function b64(s) {
    try { return btoa(unescape(encodeURIComponent(String(s)))); } catch (e) { return ''; }
  }

  function loadAiSettings() {
    fetch(BRIDGE + 'ai.config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        S.aiEnabled = !!(c && c.enabled);
        S.aiBase = (c && c.base) || '';
        S.aiModel = (c && c.model) || '';
        if (el.aiState) {
          el.aiState.textContent = S.aiEnabled
            ? ('AI 已启用 · ' + (S.aiModel || 'default'))
            : 'AI 未启用（使用封面取色，免费）';
        }
      })
      .catch(function () {
        if (el.aiState) el.aiState.textContent = '读取 AI 配置失败';
      });
  }

  function saveAiSettings() {
    S.aiEnabled = el.aiEnabled ? el.aiEnabled.checked : false;
    S.aiBase = el.aiBase ? el.aiBase.value.trim().replace(/\/+$/, '') : '';
    S.aiKey = el.aiKey ? el.aiKey.value.trim() : '';
    S.aiModel = el.aiModel ? el.aiModel.value.trim() : '';
    localStorage.setItem('aiEnabled', S.aiEnabled ? '1' : '0');
    localStorage.setItem('aiBase', S.aiBase);
    localStorage.setItem('aiKey', S.aiKey);
    localStorage.setItem('aiModel', S.aiModel);
    if (el.aiState) el.aiState.textContent = S.aiEnabled ? (S.aiKey && S.aiBase ? '已启用' : '缺少 Key/地址') : '未启用';
    toast(S.aiEnabled ? 'AI 主题已开启' : 'AI 主题已关闭');
  }

  function buildAiPrompt(d) {
    var lyric = S.lrc.slice(0, 40).map(function (l) { return l.text; }).join('\n').slice(0, 800);
    return '你是音乐壁纸的配色设计师。根据歌曲情绪生成一套深色主题，只输出 JSON，不要解释。\n' +
      'JSON 字段：{"name":"4字主题名","accent":"#RRGGBB","background":"#RRGGBB","primary":"#RRGGBB","secondary":"#RRGGBB","wordColors":[{"word":"歌词里的词","color":"#RRGGBB"}],"emphasis":["歌词里最该强调的3-5个词"],"lineKeywords":[{"line":"原句","keyword":"该句最关键的2-5字词语"}]}\n' +
      '要求：accent 与 background 对比明显；wordColors 8-12 个；lineKeywords 尽量覆盖每一句，keyword 必须是该句中最有情绪、最具体的 2-5 字词语（不要选“他/我/就/把”这类虚词开头的半截词）；整体贴合情绪。\n' +
      '歌曲：' + (d.title || '') + ' - ' + (d.artist || '') + '\n歌词：\n' + lyric;
  }

  function applyAiTheme(t) {
    if (!t || !t.accent) return;
    S.aiTheme = t;
    document.body.style.setProperty('--accent', morandi(t.accent, 0.30, 0.45, 0.72));
    if (t.secondary) document.body.style.setProperty('--pink', morandi(t.secondary, 0.26, 0.50, 0.74));
    if (t.background) document.body.style.setProperty('--theme-bg', morandi(t.background, 0.14, 0.08, 0.20));
    if (t.primary) document.body.style.setProperty('--theme-primary', morandi(t.primary, 0.12, 0.82, 0.96));
    renderLyrics(S.lrc);
    updateLyrics(S.position);
    if (el.aiState) el.aiState.textContent = '已应用：' + (t.name || 'AI 主题');
  }

  function maybeAiTheme(d) {
    if (!S.aiEnabled || !d || !d.id) return;

    var cacheKey = 'aiTheme:v3:' + d.id;
    try {
      var cached = localStorage.getItem(cacheKey);
      if (cached) { applyAiTheme(JSON.parse(cached)); return; }
    } catch (e) {}

    if (S.aiBusy) return;
    S.aiBusy = true;
    if (el.aiState) el.aiState.textContent = '生成中…';

    var url = BRIDGE + 'ai.theme?p=' + encodeURIComponent(b64(buildAiPrompt(d)));

    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.error) throw new Error(String(res.error).slice(0, 120));
        var txt = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
        if (!txt) throw new Error('empty ai response');
        var obj = JSON.parse(String(txt).replace(/```json/gi, '').replace(/```/g, '').trim());
        try { localStorage.setItem(cacheKey, JSON.stringify(obj)); } catch (e) {}
        applyAiTheme(obj);
        toast('AI 主题 · ' + (obj.name || '已应用'));
      })
      .catch(function (err) {
        if (el.aiState) el.aiState.textContent = '失败：' + err.message;
      })
      .then(function () { S.aiBusy = false; });
  }




  function splitLyricSegments(text, maxParts) {
    var boundary = '的了着过和与在是就都也又还而但却把被让给对从到向于中里上下后前时のをがにはでともへやからまで';
    var raw = String(text || '').split(/[，。！？、；：,.!?;:]+/).filter(function (s) { return s.trim().length > 0; });

    function splitAtBest(s) {
      if (s.length <= 10) return [s];
      var mid = Math.floor(s.length / 2);
      var best = -1;
      var bestDist = 1e9;
      for (var i = 2; i < s.length - 2; i++) {
        if (boundary.indexOf(s.charAt(i)) >= 0) {
          var d = Math.abs(i - mid);
          if (d < bestDist) { bestDist = d; best = i; }
        }
      }
      if (best < 0) best = mid - 1;
      return [s.slice(0, best + 1), s.slice(best + 1)];
    }

    var out = [];
    raw.forEach(function (part) {
      var pieces = [part];
      while (pieces.length < maxParts) {
        var longest = 0;
        for (var i = 1; i < pieces.length; i++) if (pieces[i].length > pieces[longest].length) longest = i;
        if (pieces[longest].length <= 12) break;
        var halves = splitAtBest(pieces[longest]);
        if (halves[0].length === 0 || halves[1].length === 0) break;
        pieces.splice.apply(pieces, [longest, 1].concat(halves));
      }
      out = out.concat(pieces);
    });

    out = out.filter(function (s) { return s.trim().length > 0; });
    if (out.length === 0) out = [String(text || '')];
    return out.slice(0, maxParts);
  }


  function keyBoundaryOk(text, word) {
    var pos = text.indexOf(word);
    if (pos < 0) return false;
    var next = text.charAt(pos + word.length);
    var prev = pos > 0 ? text.charAt(pos - 1) : '';

    if (/[A-Za-z]/.test(word)) {
      var wordChar = /[A-Za-z'’-]/;
      if (prev && wordChar.test(prev)) return false;
      if (next && wordChar.test(next)) return false;
      return true;
    }

    if (!next) return true;
    return 'をがにはでとへもやの、。！？,.!? '.indexOf(next) >= 0;
  }

  function jpChunks(text) {
    var arr = Array.from(text);
    var chunks = [];
    var cur = '';
    var marks = 'をがにはでとへもやの';
    arr.forEach(function (ch) {
      cur += ch;
      if (marks.indexOf(ch) >= 0) { chunks.push(cur); cur = ''; }
    });
    if (cur) chunks.push(cur);
    return chunks;
  }

  function pickTiltKey(text, seed) {
    var candidates = [];

    if (S.aiTheme && S.aiTheme.lineKeywords) {
      for (var li = 0; li < S.aiTheme.lineKeywords.length; li++) {
        var lk = S.aiTheme.lineKeywords[li];
        if (lk && lk.line === text && lk.keyword && lk.keyword.length >= 2 && text.indexOf(lk.keyword) >= 0 && lk.keyword.length < text.length) {
          return lk.keyword;
        }
      }
    }

    if (S.aiTheme && S.aiTheme.emphasis) {
      S.aiTheme.emphasis.forEach(function (w) {
        if (w && w.length >= 2 && w.length <= 6 && text.indexOf(w) >= 0 && w.length < text.length && keyBoundaryOk(text, w)) {
          candidates.push(w);
        }
      });
    }
    if (!candidates.length && S.aiTheme && S.aiTheme.wordColors) {
      S.aiTheme.wordColors.forEach(function (wc) {
        if (wc && wc.word && wc.word.length >= 2 && wc.word.length <= 6 && text.indexOf(wc.word) >= 0 && wc.word.length < text.length && keyBoundaryOk(text, wc.word)) {
          candidates.push(wc.word);
        }
      });
    }

    if (!candidates.length) {
      if (/[A-Za-z]/.test(text) && !/[\u4e00-\u9fff\u3040-\u30ff]/.test(text)) {
        var stop = ' the a an and or of to in on at for with from by is are was were be been am do does did it its this that these those i you he she we they me him her us them my your his their our as so if but not no yes'.split(' ');
        var words = text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
        candidates = words.filter(function (w) {
          var lw = w.toLowerCase();
          return w.length >= 3 && w.length < text.length && stop.indexOf(lw) < 0;
        });
      } else if (/[\u3040-\u30ff]/.test(text)) {
        candidates = jpChunks(text).filter(function (w) { return w.length >= 2 && w.length < text.length; });
      } else {
        var chunks = text.split(/[，。！？、；：\s]+/).filter(function (s) { return s.length >= 2; });
        chunks.forEach(function (chunk) {
          var arr = Array.from(chunk);
          for (var i = 0; i + 2 <= arr.length; i += 1) {
            candidates.push(arr.slice(i, i + Math.min(3, arr.length - i)).join(''));
          }
        });
        var badStart = '的了着过和与在是就都也又还而但却把被让给对从到向于中里上下后前时我你他她它们';
        candidates = candidates.filter(function (w) {
          return w.length >= 2 && w.length <= 4 && w.length < text.length && badStart.indexOf(w.charAt(0)) < 0;
        });
      }
    }

    if (!candidates.length) return '';
    return candidates[Math.abs(seed) % candidates.length];
  }

  function buildTiltLine(idx) {
    S.charSpans = [];
    S.tiltSegs = [];
    S.scatterWords = [];

    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;

    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    var line = S.lrc[idx];
    var text = line.text || '';
    var seed = Math.floor(line.t * 1000) + text.length;

    var key = pickTiltKey(text, seed);
    if (!key) key = text;

    var keyPos = text.indexOf(key);
    if (keyPos < 0) { key = text; keyPos = 0; }

    var before = text.slice(0, keyPos);
    var after = text.slice(keyPos + key.length);

    var keyColor = '';
    if (S.aiTheme && S.aiTheme.wordColors) {
      S.aiTheme.wordColors.forEach(function (wc) {
        if (wc && wc.word === key && wc.color) keyColor = wc.color;
      });
    }
    var accentKey = (getComputedStyle(document.body).getPropertyValue('--accent') || '').trim() || '#7fd6ff';

    var s = Math.min(window.innerWidth * 0.000390625, window.innerHeight * 0.00069444) || 1;
    var base = 58 * s;
    var maxPx = window.innerWidth * 0.68 / Math.max(1, key.length);
    var keyEm = Math.min(2.6, Math.max(1.5, maxPx / base));

    main.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'tilt-line';

    function addSmall(part, align) {
      if (!part) return;
      var row = document.createElement('div');
      row.className = 'tilt-small';
      row.style.justifyContent = (align === 'left') ? 'flex-start' : 'flex-end';
      row.style.transform = (align === 'left') ? 'translate(-6%, -10px)' : 'translate(6%, 10px)';
      row.style.paddingLeft = (align === 'left') ? '6%' : '0';
      row.style.paddingRight = (align === 'right') ? '6%' : '0';

      Array.from(part).forEach(function (ch, ci) {
        var sp = document.createElement('span');
        sp.className = 'tilt-sm-char';
        sp.textContent = ch === ' ' ? '\u00a0' : ch;
        var rr = Math.abs((Math.sin(seed + ci * 9) * 10000) % 1);
        sp.style.fontSize = (0.55 + rr * 0.18).toFixed(2) + 'em';
        sp.style.transform = 'translateY(' + ((rr - 0.5) * 26).toFixed(1) + 'px) rotate(' + ((rr - 0.5) * 12).toFixed(1) + 'deg)';
        if (ci % 5 === 2) sp.style.color = accentKey;
        row.appendChild(sp);
      });

      wrap.appendChild(row);
    }

    addSmall(before, 'left');

    var keyEl = document.createElement('div');
    keyEl.className = 'tilt-key';
    Array.from(key).forEach(function (ch, ci) {
      var c = document.createElement('span');
      c.className = 'tilt-key-char';
      c.textContent = ch;
      var rr = Math.abs((Math.sin(seed + ci * 13) * 10000) % 1);
      c.style.transform = 'translateY(' + ((rr - 0.5) * 30).toFixed(1) + 'px) rotate(' + ((rr - 0.5) * 9).toFixed(1) + 'deg)';
      keyEl.appendChild(c);
    });
    keyEl.style.setProperty('font-size', keyEm.toFixed(2) + 'em', 'important');
    keyEl.style.color = keyColor || accentKey;
    keyEl.style.transform = 'rotate(-3deg) skewX(-7deg) translateY(' + ((seed % 17) - 8) + 'px)';
    keyEl.style.textShadow = '0 0 calc(34 * var(--s)) ' + (keyColor || accentKey) + ', 0 calc(10 * var(--s)) calc(32 * var(--s)) rgba(0,0,0,0.45)';
    wrap.appendChild(keyEl);

    addSmall(after, 'right');

    main.appendChild(wrap);
  }

  function paintTilt(pos) {
    if (!S.tiltSegs || !S.tiltSegs.length) return;
    var accent = S.charAccent || '#8ef';

    for (var i = 0; i < S.tiltSegs.length; i++) {
      var seg = S.tiltSegs[i];
      var t0 = +seg.dataset.t0;
      var t1 = +seg.dataset.t1;
      var on = pos >= t0 - 0.15;

      seg.classList.toggle('on', on);

      if (!on) {
        seg.style.color = '';
        seg.style.textShadow = 'none';
      } else if (pos < t1) {
        seg.style.color = accent;
        seg.style.textShadow = '0 0 calc(18 * var(--s)) ' + accent;
      } else {
        seg.style.color = '#ffffff';
        seg.style.textShadow = 'none';
      }
    }
  }



  function cssHsl(input) {
    var hex = String(input || '').trim().match(/^#([0-9a-fA-F]{6})$/);
    if (hex) {
      var hv = hex[1];
      var rr = parseInt(hv.substr(0, 2), 16) / 255;
      var gg = parseInt(hv.substr(2, 2), 16) / 255;
      var bb = parseInt(hv.substr(4, 2), 16) / 255;
      var mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
      var hh = 0, ss = 0, ll = (mx + mn) / 2;
      if (mx !== mn) {
        var dd = mx - mn;
        ss = ll > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
        if (mx === rr) hh = ((gg - bb) / dd) % 6;
        else if (mx === gg) hh = (bb - rr) / dd + 2;
        else hh = (rr - gg) / dd + 4;
        hh = (hh * 60 + 360) % 360;
      }
      return { h: hh, s: ss, l: ll };
    }
    var m = String(input || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return { h: 190, s: 0.55, l: 0.6 };
    var p = m[1].split(',').map(function (v) { return parseFloat(v); });
    var r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: h, s: s, l: l };
  }

  function hslStr(h, s, l) {
    return 'hsl(' + Math.round((h + 360) % 360) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)';
  }


  function morandi(color, maxS, minL, maxL) {
    var c = cssHsl(color);
    var s = Math.min(maxS == null ? 0.30 : maxS, c.s);
    var l = Math.min(maxL == null ? 0.78 : maxL, Math.max(minL == null ? 0.42 : minL, c.l));
    return 'hsl(' + Math.round(c.h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)';
  }

  function lyricPalette() {
    var cs = getComputedStyle(document.body);
    var base = cssHsl(cs.getPropertyValue('--accent'));
    var h = base.h;
    var s = Math.max(0.16, Math.min(0.30, base.s));

    return [
      hslStr(h, s * 0.18, 0.96),
      hslStr(h, s * 0.85, 0.74),
      hslStr(h + 18, s * 0.72, 0.66),
      hslStr(h - 18, s * 0.72, 0.70),
      hslStr(h, s * 0.45, 0.86)
    ];
  }


  function lyricComplement() {
    var base = cssHsl(getComputedStyle(document.body).getPropertyValue('--accent'));
    var s = Math.max(0.20, Math.min(0.32, base.s));
    return hslStr(base.h + 165, s * 0.78, 0.66);
  }

  function aiWordColor(text) {
    var t = S.aiTheme;
    if (!t || !t.wordColors) return '';
    for (var i = 0; i < t.wordColors.length; i++) {
      var w = t.wordColors[i];
      if (w && w.word && w.color && text.indexOf(w.word) >= 0) return w.color;
    }
    return '';
  }

  function lyricWordColor(text, i, pal) {
    var c = aiWordColor(text);
    if (c) return c;
    return pal[i % pal.length];
  }




  var BUBBLES = [];

  function clearBubbles() {
    var layer = $('bubbleLayer');
    if (layer) layer.innerHTML = '';
    BUBBLES = [];
    S.bubbleLine = -1;
  }

  function updateBubbles(dt) {
    if (!S.lrc.length) return;
    var layer = $('bubbleLayer');
    if (!layer) return;

    var cur = S.lrcIndex;
    var want = [];
    [-1, 0, 1].forEach(function (d) {
      var i = cur + d;
      if (i >= 0 && i < S.lrc.length) want.push(i);
    });

    BUBBLES = BUBBLES.filter(function (b) {
      if (want.indexOf(b.idx) < 0) {
        if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
        return false;
      }
      return true;
    });

    want.forEach(function (i) {
      var exists = false;
      for (var k = 0; k < BUBBLES.length; k++) if (BUBBLES[k].idx === i) exists = true;
      if (exists) return;

      var el = document.createElement('span');
      el.className = 'bubble';
      Array.from(S.lrc[i].text || '').forEach(function (ch) {
        var cs = document.createElement('span');
        cs.className = 'bch';
        cs.textContent = ch === ' ' ? '\u00a0' : ch;
        el.appendChild(cs);
      });

      var rel = i - cur;
      var yInit = window.innerHeight * (rel < 0 ? 0.24 : rel === 0 ? 0.50 : 0.92);
      el.style.opacity = '0';
      el.style.transform = 'translate3d(' + (window.innerWidth / 2) + 'px,' + yInit.toFixed(1) + 'px,0) translateX(-50%)';
      layer.appendChild(el);

      BUBBLES.push({
        idx: i,
        el: el,
        phase: Math.random() * Math.PI * 2,
        born: performance.now(),
        bx: (Math.random() - 0.5) * window.innerWidth * 0.18,
        by: (Math.random() - 0.5) * window.innerHeight * 0.05,
        amp: 70 + Math.random() * 80,
        freqX: 0.18 + Math.random() * 0.22,
        freqY: 0.45 + Math.random() * 0.4,
        rotBase: (Math.random() - 0.5) * 5,
        scaleJitter: 0.9 + Math.random() * 0.2
      });
    });

    var W = window.innerWidth;
    var H = window.innerHeight;
    var accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7fd6ff';

    var now = performance.now();

    BUBBLES.forEach(function (b) {
      var rel = b.idx - cur;
      var yFactor = rel < 0 ? 0.24 : rel === 0 ? 0.50 : 0.76;
      var isCur = rel === 0;

      var age = (now - b.born) / 1000;
      var tt = now / 1000;

      var bobY = Math.sin(tt * b.freqY + b.phase) * 18 + Math.sin(tt * b.freqY * 0.53 + b.phase * 1.9) * 9 + Math.sin(tt * 0.85 + b.phase) * 4.5;
      var bobX = Math.sin(tt * b.freqX + b.phase * 1.7) * b.amp + Math.sin(tt * b.freqX * 0.47 + b.phase * 2.3) * b.amp * 0.45;
      var rot = b.rotBase + Math.sin(tt * 0.37 + b.phase) * 2.2;

      var y = H * yFactor + b.by + bobY - (isCur ? Math.min(26, age * 2.6) : 0);
      var x = W / 2 + b.bx + bobX;
      var scale = (0.78 + (1 - y / H) * 0.62) * b.scaleJitter;

      var fadeIn = Math.min(1, age / 0.8);
      var op = (isCur ? 1 : 0.34) * fadeIn;

      var skew = Math.sin(tt * 0.52 + b.phase * 1.3) * 1.7 + Math.sin(tt * 0.23 + b.phase * 2.1) * 0.8;
      b.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translateX(-50%) rotate(' + rot.toFixed(2) + 'deg) skewX(' + skew.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      b.el.style.opacity = op.toFixed(3);
      b.el.style.setProperty('font-size', 'calc(42 * var(--s))', 'important');
      var hl = '#8ff0e2';
      b.el.style.color = isCur ? hl : 'rgba(255,255,255,0.72)';
      b.el.style.textShadow = isCur
        ? '0 0 calc(26 * var(--s)) ' + hl + ', 0 calc(6 * var(--s)) calc(24 * var(--s)) rgba(0,0,0,0.5)'
        : '0 calc(4 * var(--s)) calc(18 * var(--s)) rgba(0,0,0,0.45)';

      for (var ci = 0; ci < b.el.children.length; ci++) {
        var chEl = b.el.children[ci];
        var __f = (+chEl.dataset.freq || 1.5);
        var __a = (+chEl.dataset.amp || 4);
        var __common = Math.sin(tt * 1.6 + b.phase) * 7;
        var wy = __common + Math.sin(tt * __f + (+chEl.dataset.phase || 0)) * __a;
        var wr = Math.sin(tt * 0.9 + (+chEl.dataset.phase || 0)) * 1.1;
        chEl.style.transform = 'translateY(' + wy.toFixed(2) + 'px) rotate(' + wr.toFixed(2) + 'deg)';
      }
    });
  }

  function buildFumeLine(idx) {
    S.charSpans = [];
    S.tiltSegs = [];
    S.scatterWords = [];

    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;
    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    var line = S.lrc[idx];
    var text = line.text || '';
    var parts = text.split(/[，。！？、；：]+/).filter(function (s) { return s.trim().length > 0; });
    if (parts.length === 1) {
      var mid = Math.max(2, Math.round(text.length * 0.6));
      parts = [text.slice(0, mid), text.slice(mid)].filter(function (s) { return s.trim().length > 0; });
    }

    parts = parts.slice(0, 3);
    var sorted = parts.slice().sort(function (a, b) { return b.length - a.length; });
    var big = sorted[0] || text;
    var smalls = sorted.slice(1);

    main.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'fume-wrap';

    if (smalls[0]) {
      var r0 = document.createElement('div');
      r0.className = 'fume-row r0';
      r0.textContent = smalls[0];
      wrap.appendChild(r0);
    }

    var r1 = document.createElement('div');
    r1.className = 'fume-row r1';
    r1.textContent = big;
    wrap.appendChild(r1);

    if (smalls[1]) {
      var r2 = document.createElement('div');
      r2.className = 'fume-row r2';
      r2.textContent = smalls[1];
      wrap.appendChild(r2);
    }

    main.appendChild(wrap);
  }



  function ensureQsTrack() {
    var layer = $('qsLayer');
    if (!layer || !S.lrc.length) return;

    if (S.qsTrack && S.qsLrcRef === S.lrc) return;

    layer.innerHTML = '';
    var track = document.createElement('div');
    track.className = 'qs-track';

    S.lrc.forEach(function (line) {
      if (!line || !line.text) return;

      var col = document.createElement('div');
      col.className = 'qs-col';

      var textCol = document.createElement('div');
      textCol.className = 'qs-text';
      Array.from(line.text).forEach(function (ch) {
        var sp = document.createElement('span');
        sp.className = 'qs-char';
        sp.textContent = ch === ' ' ? '\u00a0' : ch;
        textCol.appendChild(sp);
      });
      col.appendChild(textCol);

      if (line.sub) {
        var subCol = document.createElement('div');
        subCol.className = 'qs-text qs-sub-text';
        Array.from(line.sub).forEach(function (ch) {
          var sp = document.createElement('span');
          sp.className = 'qs-sub-char';
          sp.textContent = ch === ' ' ? '\u00a0' : ch;
          subCol.appendChild(sp);
        });
        col.appendChild(subCol);
      }

      track.appendChild(col);
    });

    layer.appendChild(track);
    S.qsTrack = track;
    S.qsLrcRef = S.lrc;
    S.qsCols = track.children;
    S.qsLastIdx = -999;
  }

  function updateQingshu() {
    if (S.lyricTheme !== 'qingshu') return;

    ensureQsTrack();
    var layer = $('qsLayer');
    if (!layer || !S.qsTrack || !S.qsCols || !S.qsCols.length) return;
    if (S.lrcIndex < 0) return;

    var idx = Math.min(S.lrcIndex, S.qsCols.length - 1);
    if (S.qsLastIdx === idx) return;
    S.qsLastIdx = idx;

    for (var i = 0; i < S.qsCols.length; i++) {
      var dist = Math.abs(i - idx);
      var op = dist === 0 ? 1 : Math.max(0, 0.55 - (dist - 1) * 0.24);
      S.qsCols[i].style.opacity = op.toFixed(3);
      S.qsCols[i].style.visibility = op < 0.02 ? 'hidden' : 'visible';
      S.qsCols[i].classList.toggle('current', i === idx);
    }

    var col = S.qsCols[idx];
    var cx = layer.clientWidth / 2;
    var x = cx - (col.offsetLeft + col.offsetWidth / 2);
    S.qsTrack.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
  }


  function buildQingshuLine(idx) {
    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;

    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    main.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'qs-cols';

    var list = [];
    if (idx > 0) list.push(idx - 1);
    list.push(idx);
    if (idx + 1 < S.lrc.length) list.push(idx + 1);

    list.forEach(function (li) {
      var line = S.lrc[li];
      if (!line || !line.text) return;

      var isCur = li === idx;
      var col = document.createElement('div');
      col.className = 'qs-col' + (isCur ? ' current' : '');

      var fit = Math.min(1, 16 / Math.max(1, Array.from(line.text).length));
      col.style.setProperty('font-size', 'calc(' + (42 * fit).toFixed(1) + ' * var(--s))', 'important');

      Array.from(line.text).forEach(function (ch, ci) {
        var sp = document.createElement('span');
        sp.className = 'qs-char';
        sp.textContent = ch === ' ' ? '\u00a0' : ch;
        if (isCur) sp.style.animationDelay = (ci * 0.04).toFixed(2) + 's';
        col.appendChild(sp);
      });

      wrap.appendChild(col);

      if (isCur && line.sub) {
        var subCol = document.createElement('div');
        subCol.className = 'qs-col qs-sub-col';
        Array.from(line.sub).forEach(function (ch) {
          var sp = document.createElement('span');
          sp.className = 'qs-sub-char';
          sp.textContent = ch === ' ' ? '\u00a0' : ch;
          subCol.appendChild(sp);
        });
        wrap.appendChild(subCol);
      }
    });

    main.appendChild(wrap);
  }

  function buildLumiLine(idx) {
    S.charSpans = [];
    S.tiltSegs = [];
    S.scatterWords = [];

    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;
    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    var line = S.lrc[idx];
    var text = line.text || '';
    var pal = lyricPalette();
    S.charAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7fd6ff';

    main.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'lumi-line';

    Array.from(text).forEach(function (ch, ci) {
      var sp = document.createElement('span');
      sp.textContent = ch;
      sp.style.color = (ci % 7 === 3) ? pal[1] : '#ffffff';
      wrap.appendChild(sp);
    });

    main.appendChild(wrap);
  }

  var FX = { canvas: null, ctx: null, parts: [], lastBurst: 0, w: 0, h: 0 };

  function initFx() {
    FX.canvas = $('fxCanvas');
    if (!FX.canvas) return;
    FX.ctx = FX.canvas.getContext('2d');
    var resize = function () {
      FX.w = FX.canvas.width = window.innerWidth;
      FX.h = FX.canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  function fxBurst(now) {
    var accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7fd6ff';
    var x = FX.w * (0.15 + Math.random() * 0.7);
    var y = FX.h * (0.15 + Math.random() * 0.45);
    var count = 46;
    for (var i = 0; i < count; i++) {
      var a = Math.PI * 2 * i / count + Math.random() * 0.2;
      var sp = 1.4 + Math.random() * 3.2;
      FX.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.008 + Math.random() * 0.01,
        color: (i % 5 === 0) ? '#ffffff' : accent,
        size: 1 + Math.random() * 2
      });
    }
  }

  function fxLoop(now) {
    if (!FX.ctx) return;

    if (false) {
      FX.canvas.style.display = 'block';
      FX.ctx.clearRect(0, 0, FX.w, FX.h);
      FX.ctx.globalCompositeOperation = 'lighter';

      if (now - FX.lastBurst > 1500) {
        FX.lastBurst = now;
        fxBurst(now);
      }

      for (var i = FX.parts.length - 1; i >= 0; i--) {
        var p = FX.parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.035;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.life -= p.decay;

        if (p.life <= 0) { FX.parts.splice(i, 1); continue; }

        FX.ctx.globalAlpha = Math.max(0, p.life);
        FX.ctx.fillStyle = p.color;
        FX.ctx.beginPath();
        FX.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        FX.ctx.fill();
      }
      FX.ctx.globalAlpha = 1;
    } else if (FX.canvas.style.display !== 'none') {
      FX.canvas.style.display = 'none';
      FX.parts.length = 0;
    }

    requestAnimationFrame(fxLoop);
  }

  function buildScatterLine(idx) {
    S.charSpans = [];
    S.tiltSegs = [];
    S.scatterWords = [];

    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;

    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    var line = S.lrc[idx];
    var text = line.text || '';
    var t0 = line.t;
    var t1 = S.lrc[idx + 1] ? S.lrc[idx + 1].t : t0 + Math.max(4, text.length * 0.35);
    var dur = Math.max(1.4, t1 - t0);
    var seed = Math.floor(t0 * 1000) + text.length;

    var units = text.split(/[，。！？、；：\s]+/).filter(function (s) { return s.trim().length > 0; });
    if (units.length < 3) {
      units = [];
      var chars = Array.from(text);
      for (var ci = 0; ci < chars.length; ci += 1) units.push(chars[ci]);
    }

    S.charAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8ef';

    main.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'scatter-wrap';

    var units = text.split(/[，。！？、；：\s]+/).filter(function (s) { return s.trim().length > 0; });
    if (units.length < 3) {
      units = Array.from(text).filter(function (ch) { return !/\s/.test(ch); });
    }

    var pal = lyricPalette();

    units.forEach(function (unit, i) {
      var sp = document.createElement('span');
      sp.className = 'sc-word';
      sp.textContent = unit;

      var r = Math.abs((Math.sin(seed + i * 13) * 10000) % 1);
      var r2 = Math.abs((Math.sin(seed + i * 23) * 10000) % 1);
      var r3 = Math.abs((Math.sin(seed + i * 31) * 10000) % 1);
      sp.style.fontSize = (0.9 + r * 0.6).toFixed(2) + 'em';
      var dx = (r2 - 0.5) * 18;
      var dy = (r3 - 0.5) * 46;
      sp.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + ((r - 0.5) * 32).toFixed(1) + 'deg) skewX(' + ((r2 - 0.5) * 16).toFixed(1) + 'deg)';
      sp.style.color = lyricWordColor(unit, i, pal);

      var floatWrap = document.createElement('span');
      floatWrap.className = 'sc-float';
      floatWrap.style.setProperty('--ax', (4 + r * 10).toFixed(1) + 'px');
      floatWrap.style.setProperty('--ay', (3 + r2 * 9).toFixed(1) + 'px');
      floatWrap.style.setProperty('--ar', (1.2 + r3 * 3.2).toFixed(2) + 'deg');
      floatWrap.style.setProperty('--dur', (3.2 + r * 4.5).toFixed(2) + 's');
      floatWrap.style.setProperty('--delay', (-r2 * 3).toFixed(2) + 's');
      floatWrap.appendChild(sp);
      wrap.appendChild(floatWrap);
      S.scatterWords.push(sp);
    });

    main.appendChild(wrap);
  }

  function paintScatter(pos) {
    if (!S.scatterWords || !S.scatterWords.length) return;
    var accent = S.charAccent || '#8ef';

    for (var i = 0; i < S.scatterWords.length; i++) {
      var w = S.scatterWords[i];
      var t0 = +w.dataset.t0;
      var p = (pos - t0) / 0.6;
      if (p < 0) p = 0;
      else if (p > 1) p = 1;

      w.style.opacity = (0.12 + 0.88 * p).toFixed(3);
      if (pos < t0) w.style.textShadow = 'none';
      else if (pos < t0 + 1.2) w.style.textShadow = '0 0 calc(16 * var(--s)) ' + accent;
      else w.style.textShadow = 'none';
    }
  }

  function renderStyleChips() {
    if (el.modeChips) {
      el.modeChips.innerHTML = '';
      LYRIC_THEMES.forEach(function (t) {
        var b = document.createElement('button');
        b.className = 'style-chip' + (S.lyricTheme === t.id ? ' on' : '');
        b.textContent = t.name;
        b.addEventListener('click', function () {
          applyLyricTheme(t.id);
          renderStyleChips();
    renderPickers();
          toast('歌词特效 · ' + t.name);
        });
        el.modeChips.appendChild(b);
      });
    }

    if (el.fontChips) {
      el.fontChips.innerHTML = '';
      LYRIC_FONTS.forEach(function (f) {
        var b = document.createElement('button');
        b.className = 'style-chip' + (S.lyricFont === f.id ? ' on' : '');
        b.textContent = f.name;
        b.addEventListener('click', function () {
          applyLyricFont(f.id);
          renderStyleChips();
    renderPickers();
          toast('字体 · ' + f.name);
        });
        el.fontChips.appendChild(b);
      });
    }
  }



  function renderSceneChips() {
    if (el.bgChips) {
      el.bgChips.innerHTML = '';
      for (var i = 0; i < BACKGROUNDS.length; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.className = 'style-chip' + (bgIndex === idx ? ' on' : '');
          b.textContent = '场景 ' + (idx + 1);
          b.addEventListener('click', function () {
            applyBg(idx);
            renderSceneChips();
            toast('背景 · 场景 ' + (idx + 1));
          });
          el.bgChips.appendChild(b);
        })(i);
      }
    }

    if (el.sourceChips) {
      el.sourceChips.innerHTML = '';
      var modes = [
        { id: 'mirror', name: '跟随网易云' },
        { id: 'local', name: '内置播放' }
      ];
      modes.forEach(function (m) {
        var b = document.createElement('button');
        b.className = 'style-chip' + (S.mode === m.id ? ' on' : '');
        b.textContent = m.name;
        b.addEventListener('click', function () {
          setMode(m.id, true);
          renderSceneChips();
          toast('音乐来源 · ' + m.name);
        });
        el.sourceChips.appendChild(b);
      });
    }
  }

  function closePickers() {
    if (el.modePicker) el.modePicker.classList.remove('open');
    if (el.fontPicker) el.fontPicker.classList.remove('open');
  }

  function renderPickers() {
    function fill(host, items, current) {
      if (!host) return;
      host.innerHTML = '';
      items.forEach(function (it) {
        var b = document.createElement('button');
        b.className = 'picker-item' + (current === it.id ? ' on' : '');
        b.textContent = it.name;
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          if (host === el.modePicker) {
            applyLyricTheme(it.id);
            toast('歌词特效 · ' + it.name);
          } else {
            applyLyricFont(it.id);
            toast('字体 · ' + it.name);
          }
          renderStyleChips();
    renderPickers();
          renderPickers();
          closePickers();
        });
        host.appendChild(b);
      });
    }

    fill(el.modePicker, LYRIC_THEMES, S.lyricTheme);
    fill(el.fontPicker, LYRIC_FONTS, S.lyricFont);
  }

  function buildActiveChars(idx) {
    S.charSpans = [];
    if (S.lyricTheme === 'tilt') { buildTiltLine(idx); for (var ti = 0; ti < S.tiltSegs.length; ti++) S.tiltSegs[ti].classList.add('on'); return; }
    if (S.lyricTheme === 'fume') { return; }
    if (S.lyricTheme === 'lumiere') { buildLumiLine(idx); return; }
    if (S.lyricTheme === 'scatter') { buildScatterLine(idx); return; }
    if (S.lyricTheme === 'qingshu') { return; }
    
    if (S.lyricTheme === 'bubble') return;
    return;
    var nodes = el.lyrics.children;
    if (idx < 0 || idx >= nodes.length) return;

    var main = nodes[idx].querySelector('.main');
    if (!main) return;

    var line = S.lrc[idx];
    var text = line.text || '';
    var t0 = line.t;
    var t1 = S.lrc[idx + 1] ? S.lrc[idx + 1].t : t0 + Math.max(4, text.length * 0.35);
    var dur = Math.max(0.8, t1 - t0);
    var chars = Array.from(text);
    var per = dur / Math.max(1, chars.length);

    S.charAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8ef';

    main.innerHTML = '';
    for (var i = 0; i < chars.length; i++) {
      var span = document.createElement('span');
      span.className = 'ch';
      span.textContent = chars[i];
      span.dataset.t0 = (t0 + i * per).toFixed(3);
      span.dataset.t1 = (t0 + (i + 1) * per).toFixed(3);
      main.appendChild(span);
      S.charSpans.push(span);
    }
  }

  function paintChars(pos) {
    if (!S.charSpans || !S.charSpans.length) return;
    var accent = S.charAccent || '#8ef';

    for (var i = 0; i < S.charSpans.length; i++) {
      var s = S.charSpans[i];
      var t0 = +s.dataset.t0;
      var t1 = +s.dataset.t1;
      var p = (pos - t0) / Math.max(0.05, t1 - t0);
      if (p < 0) p = 0;
      else if (p > 1) p = 1;

      s.style.opacity = (0.35 + 0.65 * p).toFixed(3);
      s.style.color = p >= 1 ? '#ffffff' : 'rgba(255,255,255,' + (0.35 + 0.55 * p).toFixed(3) + ')';
      s.style.textShadow = p > 0.02 ? '0 0 ' + (8 + 14 * p).toFixed(1) + 'px ' + accent : 'none';
    }
  }

  function updateLyrics(time) {
    if (!S.lrc.length) return;
    var t = time + (S.lyricOffset || 0);
    var idx = -1;
    for (var i = 0; i < S.lrc.length; i++) {
      if (S.lrc[i].t <= t + 0.15) idx = i; else break;
    }
    if (idx === S.lrcIndex) return;
    S.lrcIndex = idx;

    var nodes = el.lyrics.children;

    if (S.lyricTheme !== 'fume') clearBubbles();


    if (idx < 0) {
      document.body.classList.add('lyrics-idle');
      if (nodes[0]) {
        var vp = el.lyrics.parentElement.clientHeight || 0;
        el.lyrics.style.transform = 'translateY(' + Math.max(0, vp / 2 - nodes[0].offsetHeight / 2) + 'px)';
      }
      return;
    }
    document.body.classList.remove('lyrics-idle');
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].classList.toggle('active', j === idx);
      nodes[j].classList.toggle('past', j < idx);
      nodes[j].classList.toggle('near', Math.abs(j - idx) === 1);
      nodes[j].classList.toggle('far', Math.abs(j - idx) > 1);
      nodes[j].classList.toggle('recent', j === idx - 1);
    }
    document.body.classList.toggle('lyrics-active', idx >= 0);
    buildActiveChars(idx);
    centerActive();
  }

  function lrcCacheKey() {
    if (S.mode !== 'mirror' || !S.netease || !S.netease.id) return '';
    return 'lrc:' + S.netease.id;
  }

  function saveLrcCache(key, text) {
    if (!key || !text) return;
    try {
      localStorage.setItem(key, text);
      var keys = JSON.parse(localStorage.getItem('lrcKeys') || '[]');
      if (keys.indexOf(key) < 0) keys.push(key);
      while (keys.length > 200) {
        var old = keys.shift();
        localStorage.removeItem(old);
      }
      localStorage.setItem('lrcKeys', JSON.stringify(keys));
    } catch (e) {}
  }

  function loadLyrics(url, title) {
    var token = ++S.lyricToken;
    S.lrc = [];

    if (!url) {
      renderLyrics([]);
      el.empty.textContent = '暂无歌词 · 尽情享受音乐吧';
      return;
    }

    var cacheKey = lrcCacheKey();
    if (cacheKey) {
      var cached = '';
      try { cached = localStorage.getItem(cacheKey) || ''; } catch (e) {}
      if (cached) {
        S.lrc = parseLrc(cached);
        if (S.lrc.length) {
          document.body.classList.remove('no-lyrics');
          renderLyrics(S.lrc);
          return;
        }
      }
    }

    el.empty.textContent = '歌词加载中…';
    document.body.classList.add('no-lyrics');

    fetch(url)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (text) {
        if (token !== S.lyricToken) return;
        saveLrcCache(cacheKey, text);
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
    var show = true;
    if (el.listBtn) el.listBtn.style.display = show ? '' : 'none';
    if (!show && el.drawer.classList.contains('open')) {
      el.drawer.classList.remove('open');
      sendAction('showicons').catch(function () {});
    }
  }
  function renderPlaylist() {
    if (S.mode === 'mirror') {
      el.playlist.innerHTML = '<li class="queue-note">跟随网易云播放中，歌单为只读。<br>切歌用播放器上的 ⏮ ⏸ ⏭；<br>歌词快慢用上方的 ±0.5s 校准。</li>';
      updateListButton();
      return;
    }

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
        if (!d || !d.ok || !d.title) { S.bridgeFails = (S.bridgeFails || 0) + 1; if (S.bridgeFails > 3) { S.bridgeAlive = false; document.body.classList.add('bridge-down'); } return; }
        S.bridgeAlive = true;
        S.bridgeFails = 0;
        document.body.classList.remove('bridge-down');
        if (S.localPinned && S.mode === 'local') return;

        var prevId = S.netease.id || '';
        var idChanged = (d.id || '') !== prevId;
        var changed = d.title !== S.netease.title || d.artist !== S.netease.artist || idChanged;
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
          if (!S.mirrorUserPaused) setPlaying(true);

          if (changed) {
            if (d.pic) { var _p = d.pic.replace(/^http:/, 'https:'); el.cover.src = _p; applyCoverPalette(_p); }
            if (d.duration) S.duration = d.duration;
            if (idChanged) { S.position = 0; S.mirrorUserPaused = false; }
            if (d.lrc) loadLyrics(d.lrc, d.title);
          setTimeout(function () { maybeAiTheme(d); }, 1500);
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
        var _p = song.pic.replace(/^http:/, 'https:');
        el.cover.src = _p;
        applyCoverPalette(_p);
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
    if (S.mode === 'mirror') {
      var wasPlaying = S.playing;
      sendAction('playpause').catch(function () {});
      S.mirrorUserPaused = wasPlaying;
      setPlaying(!wasPlaying);
      return;
    }
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
    el.pos.textContent = (S.mode === 'mirror' ? '≈ ' : '') + fmt(S.position);
    el.dur.textContent = fmt(S.duration);
  }

  /* ------------------------------------------------------------------
     模式：内置 / 镜像系统媒体
  ------------------------------------------------------------------ */

  function setMode(mode, byUser) {
    if (mode === S.mode) return;
    S.mode = mode;
    if (byUser) S.userModeChosen = true;
    S.localPinned = (mode === 'local' && byUser);

    document.body.classList.toggle('mirror', mode === 'mirror');
    document.body.classList.toggle('source-mirror', mode === 'mirror');
    document.body.classList.toggle('source-local', mode !== 'mirror');
    if (el.modeText) el.modeText.textContent = mode === 'mirror' ? '跟随系统' : '内置';
    if (el.source) {
      el.source.textContent = mode === 'mirror' ? '网易云' : '内置';
      el.source.className = 'source ' + (mode === 'mirror' ? 'is-mirror' : 'is-local');
      el.source.title = mode === 'mirror' ? '来源：网易云（进度为估算）' : '来源：内置播放器';
    }
    if (el.bar) el.bar.title = mode === 'mirror' ? '网易云不提供真实播放进度，此处为估算' : '';

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
      }
    };

    if (window.wallpaperRegisterAudioListener) {
      window.wallpaperRegisterAudioListener(function (arr) { audioData = arr; });
    }

    window.wallpaperRegisterMediaStatusListener(function (e) {
      if (S.bridgeAlive) return;
      if (e && e.enabled === false) {
        S.hasMedia = false;
        if (S.mode === 'mirror') setMode('local');
      }
    });

    window.wallpaperRegisterMediaPropertiesListener(function (e) {
      if (S.bridgeAlive) return;
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
      var __M = window.wallpaperMediaIntegration || {};
      var __playing = (__M.PLAYBACK_PLAYING !== undefined) ? e.state === __M.PLAYBACK_PLAYING : e.state === 1;
      if (__playing && S.mode === 'local' && el.audio && !el.audio.paused) {
        el.audio.pause();
        setPlaying(false);
      }
      if (S.bridgeAlive) return;
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
      if (S.bridgeAlive) return;
      if (typeof e.position === 'number') S.mirror.position = e.position;
      if (typeof e.duration === 'number') S.mirror.duration = e.duration;
      if (S.mode === 'mirror') {
        S.position = S.mirror.position;
        S.duration = S.mirror.duration;
        renderProgress();
      }
    });

    window.wallpaperRegisterMediaThumbnailListener(function (e) {
      if (S.bridgeAlive) return;
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
    var src = demoAudio(now / 1000);
    if (!DEMO && audioData) {
      var __sum = 0;
      for (var ai = 0; ai < audioData.length; ai++) __sum += audioData[ai] || 0;
      if (__sum > 0.02) src = audioData;
    }

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
     
  ------------------------------------------------------------------ */

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
  }

  /* ------------------------------------------------------------------
     主循环
  ------------------------------------------------------------------ */

  var last = performance.now();

  function loop(now) {
    var rawDt = Math.max(0, (now - last) / 1000);
    last = now;
    var dt = Math.min(rawDt, 0.05);
    var realDt = Math.min(rawDt, 0.25);

    if (S.demo) {
      S.position += realDt;
      if (S.position > S.duration) S.position = 0;
      renderProgress();
      updateLyrics(S.position);
    } else if (S.mode === 'local') {
      updateLyrics(S.position);
    } else {
      if (S.mirror.playing && S.playing) {
        S.position = Math.min(S.duration || 1e9, S.position + realDt);
        renderProgress();
      }
      updateLyrics(S.position);
    }


    updateBubbles(dt);
    updateQingshu();

    drawSpectrum(now);

    initFx();
    requestAnimationFrame(fxLoop);
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     事件绑定
  ------------------------------------------------------------------ */


  function initOnboarding() {
    var mask = $('onboardMask');
    if (!mask) return;

    var obBridge = $('obBridge');
    var obAi = $('obAi');
    var obRetry = $('obRetry');
    var obAiOpen = $('obAiOpen');
    var obDone = $('obDone');
    var guideBtn = $('guideBtn');

    function checkBridge() {
      if (!obBridge) return;
      obBridge.textContent = '检测中…';
      fetch(BRIDGE + 'now.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            obBridge.textContent = '已连接 · ' + (d.title || '');
            obBridge.className = 'ok';
          } else {
            obBridge.textContent = '未连接';
            obBridge.className = 'bad';
          }
        })
        .catch(function () {
          obBridge.textContent = '未连接';
          obBridge.className = 'bad';
        });
    }

    function checkAi() {
      if (!obAi) return;
      fetch(BRIDGE + 'ai.config', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.enabled) {
            obAi.textContent = '已启用 · ' + (d.model || '');
            obAi.className = 'ok';
          } else {
            obAi.textContent = '未配置（会用封面配色）';
            obAi.className = 'bad';
          }
        })
        .catch(function () {
          obAi.textContent = '未配置';
          obAi.className = 'bad';
        });
    }

    function openMask() {
      mask.classList.add('open');
      checkBridge();
      checkAi();
    }

    if (obRetry) obRetry.addEventListener('click', checkBridge);
    if (obAiOpen) obAiOpen.addEventListener('click', function () {
      fetch(BRIDGE + 'ai.open', { cache: 'no-store' }).catch(function () {});
    });
    if (obDone) obDone.addEventListener('click', function () {
      mask.classList.remove('open');
      try { localStorage.setItem('onboarded', '1'); } catch (e) {}
    });
    if (guideBtn) guideBtn.addEventListener('click', openMask);

    var openGuideBtn = document.getElementById('openGuide');
    if (openGuideBtn) openGuideBtn.addEventListener('click', openMask);

    window.__restartBridge = function () {
      var rb = document.getElementById('restartBridge');
      if (!rb) return;
      rb.disabled = true;
      rb.textContent = '重启中…';
      fetch('http://127.0.0.1:51790/restart', { cache: 'no-store' })
        .catch(function () {})
        .then(function () {
          setTimeout(function () { rb.disabled = false; rb.textContent = '重启桥接'; }, 2600);
        });
    };

    var restartBridgeBtn = document.getElementById('restartBridge');
    if (restartBridgeBtn) restartBridgeBtn.addEventListener('click', function () {
      restartBridgeBtn.disabled = true;
      restartBridgeBtn.textContent = '重启中…';
      fetch('http://127.0.0.1:51790/restart', { cache: 'no-store' })
        .catch(function () {})
        .then(function () {
          setTimeout(function () {
            restartBridgeBtn.disabled = false;
            restartBridgeBtn.textContent = '重启桥接';
          }, 2600);
        });
    });

    var seen = false;
    try { seen = localStorage.getItem('onboarded') === '1'; } catch (e) {}
  }


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
    if (el.settingsBtn) el.settingsBtn.addEventListener('click', function (e) { e.stopPropagation(); var open = el.settingsPanel.classList.toggle('open'); if (open) { closePickers(); } sendAction(open ? 'hideicons' : 'showicons').catch(function () {}); });
    if (el.closeSettings) el.closeSettings.addEventListener('click', function () { el.settingsPanel.classList.remove('open'); sendAction('showicons').catch(function () {}); });

    el.listBtn.addEventListener('click', function () {
      var open = el.drawer.classList.toggle('open');
      sendAction(open ? 'hideicons' : 'showicons').catch(function () {});
      if (open) { scrollActiveIntoView(); setTimeout(syncScrollbar, 80); loadAiSettings(); }
    });
    el.closeDrawer.addEventListener('click', function () {
      el.drawer.classList.remove('open');
      sendAction('showicons').catch(function () {});
    });

    document.addEventListener('click', closePickers);
    if (el.aiOpen) el.aiOpen.addEventListener('click', function (e) { e.stopPropagation(); fetch(BRIDGE + 'ai.open', { cache: 'no-store' }).catch(function () {}); });

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

    if (el.themeBtn) el.themeBtn.addEventListener('click', function (e) { e.stopPropagation(); renderPickers(); closePickers(); el.modePicker.classList.add('open'); });
    if (el.fontBtn) el.fontBtn.addEventListener('click', function (e) { e.stopPropagation(); renderPickers(); closePickers(); el.fontPicker.classList.add('open'); });
    if (el.offMinus) el.offMinus.addEventListener('click', function () { setLyricOffset((S.lyricOffset || 0) - 0.1); });
    if (el.offPlus) el.offPlus.addEventListener('click', function () { setLyricOffset((S.lyricOffset || 0) + 0.1); });

    el.bgBtn.addEventListener('click', function () {
      applyBg(bgIndex + 1);
      toast('背景 ' + (bgIndex + 1) + ' / ' + BACKGROUNDS.length);
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


  var LYRIC_THEMES = [
    { id: 'plain', name: '简洁' },
    { id: 'fume', name: '浮名' },
    { id: 'lumiere', name: '流光' },
    { id: 'scatter', name: '心象' },
    { id: 'tilt', name: '倾诉' },
    { id: 'qingshu', name: '青书' }
  ];

  function applyLyricTheme(id) {
    var __found = false;
    for (var __i = 0; __i < LYRIC_THEMES.length; __i++) if (LYRIC_THEMES[__i].id === id) __found = true;
    if (!__found) id = 'plain';
    document.body.className = document.body.className.split(/\s+/).filter(function (c) { return c.indexOf('theme-') !== 0; }).join(' ') + ' theme-' + id;
    try { localStorage.setItem('lyricTheme', id); } catch (e) {}
    S.lyricTheme = id;
    if (S.lrc && S.lrc.length) renderLyrics(S.lrc);
    S.lrcIndex = -999;
    if (S.lrc && S.lrc.length) updateLyrics(S.position);
  }

  function cycleLyricTheme() {
    var cur = S.lyricTheme || 'flow';
    var idx = 0;
    for (var i = 0; i < LYRIC_THEMES.length; i++) if (LYRIC_THEMES[i].id === cur) idx = i;
    var next = LYRIC_THEMES[(idx + 1) % LYRIC_THEMES.length];
    applyLyricTheme(next.id);
    S.lrcIndex = -999;
    updateLyrics(S.position);
    toast('歌词主题 · ' + next.name);
  }

  var LYRIC_FONTS = [
    { id: 'sans', name: '现代' },
    { id: 'hei', name: '黑体' },
    { id: 'serif', name: '宋体' },
    { id: 'dengxian', name: '等线' },
    { id: 'youyuan', name: '圆体' },
    { id: 'light', name: '细体' },
    { id: 'kai', name: '楷体' },
    { id: 'fangsong', name: '仿宋' },
    { id: 'yahei', name: '雅黑' },
    { id: 'mono', name: '等宽' }
  ];

  function applyLyricFont(id) {
    var __ok = false;
    for (var __i = 0; __i < LYRIC_FONTS.length; __i++) if (LYRIC_FONTS[__i].id === id) __ok = true;
    if (!__ok) id = 'sans';
    document.body.className = document.body.className.split(/\s+/).filter(function (c) { return c.indexOf('font-') !== 0; }).join(' ') + ' font-' + id;
    try { localStorage.setItem('lyricFont', id); } catch (e) {}
    S.lyricFont = id;
  }

  function cycleLyricFont() {
    var cur = S.lyricFont || 'sans';
    var idx = 0;
    for (var i = 0; i < LYRIC_FONTS.length; i++) if (LYRIC_FONTS[i].id === cur) idx = i;
    var next = LYRIC_FONTS[(idx + 1) % LYRIC_FONTS.length];
    applyLyricFont(next.id);
    toast('歌词字体 · ' + next.name);
  }

  var paletteCache = {};

  function rgbHue(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    var d = max - min, h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function setCoverPalette(p) {
    S.paletteHue = p.h1;
    document.body.style.setProperty('--accent', 'hsl(' + p.h2 + ' 30% 64%)');
    document.body.style.setProperty('--pink', 'hsl(' + ((p.h2 + 320) % 360) + ' 26% 68%)');
    document.body.style.setProperty('--theme-bg', 'hsl(' + p.h1 + ' 12% 11%)');
    document.body.style.setProperty('--theme-primary', 'hsl(' + p.h1 + ' 10% 92%)');
  }

  function applyCoverPalette(url) {
    if (!url) return;
    if (paletteCache[url]) { setCoverPalette(paletteCache[url]); return; }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var size = 32;
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, size, size);
        var data = g.getImageData(0, 0, size, size).data;
        var buckets = {};

        for (var i = 0; i < data.length; i += 4) {
          var r = data[i], gg = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 200) continue;
          var max = Math.max(r, gg, b), min = Math.min(r, gg, b);
          var sat = (max - min) / 255;
          if (sat < 0.12 || max < 40) continue;
          var key = Math.round(rgbHue(r, gg, b) / 15) * 15 % 360;
          buckets[key] = (buckets[key] || 0) + sat;
        }

        var keys = Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; });
        if (!keys.length) return;

        var h1 = +keys[0], h2 = +keys[0];
        for (var k = 1; k < keys.length; k++) {
          if (Math.abs(+keys[k] - h1) > 40) { h2 = +keys[k]; break; }
        }

        var p = { h1: h1, h2: h2 };
        paletteCache[url] = p;
        setCoverPalette(p);
      } catch (e) {}
    };
    img.src = url;
  }

  var LYRIC_KEYWORDS = ['雨', '夜', '梦', '光', '风', '海', '天空', '星', '月', '花', '夏', '冬',
    '心', '爱', '时间', '远方', '青春', '回忆', '世界', '孤单', '温柔', '离别', '永远',
    '沉默', '城市', '街', '黄昏', '清晨', '眼泪', '微笑', '呼吸', '拥抱', '失眠'];


  function colorizeSub(text) {
    var pal = lyricPalette();
    var chars = Array.from(String(text || ''));
    var out = '';

    chars.forEach(function (ch, i) {
      if (/\s/.test(ch)) {
        out += ' ';
        return;
      }

      var color = '';
      if (i % 5 === 2) color = pal[1];
      else if (i % 5 === 4) color = pal[2];

      out += color
        ? '<span class="sub-ch" style="color:' + color + '">' + esc(ch) + '</span>'
        : esc(ch);
    });

    return out;
  }

  function colorizeLyric(text) {
    var ai = S.aiTheme;
    if (ai && ai.wordColors && ai.wordColors.length) {
      var html = esc(text);
      ai.wordColors
        .filter(function (w) { return w && w.word && w.color; })
        .sort(function (a, b) { return b.word.length - a.word.length; })
        .forEach(function (w) {
          try {
            var safe = String(w.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(safe, 'g'), '<span class="kw" style="color:' + w.color + '">' + esc(w.word) + '</span>');
          } catch (e) {}
        });
      return html;
    }

    var base = (S.paletteHue != null ? S.paletteHue : 180);
    var parts = String(text).split(new RegExp('(' + LYRIC_KEYWORDS.join('|') + ')', 'g'));

    return parts.map(function (part) {
      var idx = LYRIC_KEYWORDS.indexOf(part);
      if (idx < 0) return esc(part);
      var hue = (base + 30 + idx * 41) % 360;
      return '<span class="kw" style="color:hsl(' + hue + ' 34% 70%)">' + esc(part) + '</span>';
    }).join('');
  }

  function discoverBridgePort() {
    var ports = [51789, 52789, 53789, 54789];
    var i = 0;
    function next() {
      if (i >= ports.length) return;
      var p = ports[i++];
      fetch('http://127.0.0.1:' + p + '/now.json', { cache: 'no-store' })
        .then(function (r) { if (r.ok) { BRIDGE = 'http://127.0.0.1:' + p + '/'; } else { next(); } })
        .catch(next);
    }
    next();
  }

  function start() {
    discoverBridgePort();
    var cleanBtn = $('cleanBtn');
    var cleanCoverImg = $('cleanCoverImg');
    var cleanEye = $('cleanEye');

    var cleanCover = $('cleanCover');
    var syncCleanCover = function () {
      var c = $('cover');
      if (!c || !cleanCover) return;
      if (cleanCoverImg && c.src) cleanCoverImg.src = c.src;
      var r = c.getBoundingClientRect();
      cleanCover.style.left = r.left + 'px';
      cleanCover.style.top = r.top + 'px';
      cleanCover.style.width = r.width + 'px';
      cleanCover.style.height = r.height + 'px';
    };

    if (cleanBtn) {
      var applyClean = function (on) {
        document.body.classList.toggle('clean-wallpaper', on);
        cleanBtn.classList.toggle('on', on);
        if (on) syncCleanCover();
        try { localStorage.setItem('cleanWallpaper', on ? '1' : '0'); } catch (e) {}
      };
      var cleanSaved = false;
      try { cleanSaved = localStorage.getItem('cleanWallpaper') === '1'; } catch (e) {}
      applyClean(cleanSaved);

      cleanBtn.addEventListener('click', function () {
        applyClean(!document.body.classList.contains('clean-wallpaper'));
      });

      if (cleanEye) {
        cleanEye.addEventListener('click', function () {
          applyClean(false);
        });
      }

      setInterval(function () {
        if (document.body.classList.contains('clean-wallpaper')) syncCleanCover();
      }, 500);
      window.addEventListener('resize', function () {
        if (document.body.classList.contains('clean-wallpaper')) syncCleanCover();
      });
    }
    sizeSpectrum();
    applyBg(0);
    bind();
    initOnboarding();
    var savedTheme = 'plain';
    try { savedTheme = localStorage.getItem('lyricTheme') || 'plain'; } catch (e) {}
    applyLyricTheme(savedTheme);
    var savedFont = 'sans';
    try { savedFont = localStorage.getItem('lyricFont') || 'sans'; } catch (e) {}
    applyLyricFont(savedFont);
    var savedOff = 0;
    try { savedOff = parseFloat(localStorage.getItem('lyricOffset') || '0') || 0; } catch (e) {}
    setLyricOffset(savedOff);
    loadAiSettings();
    setInterval(loadAiSettings, 15000);
    renderStyleChips();
    renderSceneChips();
    renderPickers();
    if (el.aiSave) el.aiSave.addEventListener('click', saveAiSettings);
    if (el.aiEnabled) el.aiEnabled.addEventListener('change', saveAiSettings);
    setInterval(pollQueue, 2500);
    setInterval(pollNetease, 600);
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

  /* 独立初始化：引导与桥接重启，不依赖 start() */
  document.addEventListener('DOMContentLoaded', function setupGuideAndRestart() {
    var mask = document.getElementById('onboardMask');
    var obBridge = document.getElementById('obBridge');
    var obAi = document.getElementById('obAi');
    var obRetry = document.getElementById('obRetry');
    var obAiOpen = document.getElementById('obAiOpen');
    var obDone = document.getElementById('obDone');

    function checkBridge() {
      if (!obBridge) return;
      obBridge.textContent = '检测中…';
      fetch(BRIDGE + 'now.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { obBridge.textContent = '已连接 · ' + (d.title || ''); obBridge.className = 'ok'; }
          else { obBridge.textContent = '未连接'; obBridge.className = 'bad'; }
        })
        .catch(function () { obBridge.textContent = '未连接'; obBridge.className = 'bad'; });
    }

    function checkAi() {
      if (!obAi) return;
      fetch(BRIDGE + 'ai.config', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.enabled) { obAi.textContent = '已启用 · ' + (d.model || ''); obAi.className = 'ok'; }
          else { obAi.textContent = '未配置（会用封面配色）'; obAi.className = 'bad'; }
        })
        .catch(function () { obAi.textContent = '未配置'; obAi.className = 'bad'; });
    }

    window.__openGuide = function () {
      if (!mask) return;
      mask.classList.add('open');
      checkBridge();
      checkAi();
    };

    window.__restartBridge = function () {
      var rb = document.getElementById('restartBridge');
      if (rb) { rb.disabled = true; rb.textContent = '重启中…'; }
      fetch('http://127.0.0.1:51790/restart', { cache: 'no-store' })
        .catch(function () {})
        .then(function () {
          setTimeout(function () {
            if (rb) { rb.disabled = false; rb.textContent = '重启桥接'; }
          }, 2600);
        });
    };

    if (obRetry) obRetry.addEventListener('click', checkBridge);
    if (obAiOpen) obAiOpen.addEventListener('click', function () {
      fetch(BRIDGE + 'ai.open', { cache: 'no-store' }).catch(function () {});
    });
    if (obDone) obDone.addEventListener('click', function () {
      mask.classList.remove('open');
      try { localStorage.setItem('onboarded', '1'); } catch (e) {}
    });

    var seen = false;
    try { seen = localStorage.getItem('onboarded') === '1'; } catch (e) {}
    if (!seen) setTimeout(window.__openGuide, 1500);
  });

})();
