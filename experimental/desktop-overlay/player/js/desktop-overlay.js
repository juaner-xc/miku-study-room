(function () {
  'use strict';
  // Compatibility registrations only. The unmodified author's bridge supplies media data.
  [
    'wallpaperRegisterMediaPropertiesListener', 'wallpaperRegisterMediaStatusListener',
    'wallpaperRegisterMediaPlaybackListener', 'wallpaperRegisterMediaTimelineListener',
    'wallpaperRegisterMediaThumbnailListener', 'wallpaperRegisterAudioListener'
  ].forEach(function (name) { window[name] = function () {}; });
  try {
    localStorage.removeItem('aiKey');
    localStorage.setItem('onboarded', '1');
    if (!localStorage.getItem('lyricTheme')) localStorage.setItem('lyricTheme', 'fume');
  } catch (e) {}
  function sendRegions() {
    if (!window.chrome || !window.chrome.webview) return;
    var rects = [];
    ['#player', '.settings.open', '.drawer.open', '.picker.open', '#cleanCover'].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        var style = getComputedStyle(node), r = node.getBoundingClientRect();
        if (style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity > 0.05 && r.width > 0 && r.height > 0) {
          rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      });
    });
    window.chrome.webview.postMessage(JSON.stringify({
      kind: 'regions', width: innerWidth, height: innerHeight, rects: rects
    }));
  }
  addEventListener('DOMContentLoaded', function () {
    var backgrounds = document.getElementById('bgChips');
    if (backgrounds && backgrounds.previousElementSibling) backgrounds.previousElementSibling.style.display = 'none';
    setInterval(sendRegions, 180);
    setTimeout(sendRegions, 500);
  });
  addEventListener('resize', sendRegions);
})();
