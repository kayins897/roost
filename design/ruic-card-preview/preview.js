// Keeps one WebGL context alive: the RuiC iframe moves into whichever cover is
// selected and reloads there. The 1280x900 viewer is scaled to the plate width.
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.cover-tab'));
  var decks = Array.prototype.slice.call(document.querySelectorAll('.deck'));
  var iframe = document.querySelector('.plate--ruic iframe');

  function layout() {
    var plate = iframe.parentElement;
    var width = plate.clientWidth || 1280;
    var scale = width / 1280;
    iframe.style.transform = 'scale(' + scale + ')';
    plate.style.height = Math.round(900 * scale) + 'px';
  }

  function select(slug) {
    tabs.forEach(function (tab) {
      tab.setAttribute('aria-pressed', String(tab.dataset.cover === slug));
    });
    decks.forEach(function (deck) {
      var active = deck.dataset.cover === slug;
      deck.hidden = !active;
      if (active) {
        var plate = deck.querySelector('.plate--ruic');
        plate.appendChild(iframe);
        iframe.src = './cards/' + slug + '/index.html';
      }
    });
    layout();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { select(tab.dataset.cover); });
  });
  window.addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(layout); }
  layout();
}());