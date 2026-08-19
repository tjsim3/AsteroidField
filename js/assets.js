/* =====================================================
   assets.js - loads the SVG images from disk so the game
   can draw them onto a canvas.
   ===================================================== */

window.ASSETS = (function () {

  // Cache: path -> HTMLImageElement
  const cache = {};

  /* Load a single image. Uses <img> (not fetch) so it also
     works when the game is opened straight from your hard drive. */
  function loadImage(src) {
    return new Promise(function (resolve) {
      if (cache[src] && cache[src].complete) {
        resolve(cache[src]);
        return;
      }
      const img = new Image();
      img.onload = function () {
        cache[src] = img;
        resolve(img);
      };
      // Even if an image file is missing, never block the game.
      img.onerror = function () {
        cache[src] = img;
        resolve(img);
      };
      img.src = src;
    });
  }

  /* Preload every skin + sprite used anywhere in the game. */
  function preloadAll(onProgress) {
    const srcs = [];
    DATA.ships.forEach(s => srcs.push(s.src));
    DATA.bullets.forEach(b => srcs.push(b.src));
    DATA.trails.forEach(t => srcs.push(t.src));
    Object.values(DATA.dropIcons).forEach(p => srcs.push(p));
    srcs.push("AsteroidsAndPowerups/Money.svg");
    srcs.push("AsteroidsAndPowerups/Health.svg");
    srcs.push("AsteroidsAndPowerups/RocketBullet.svg");
    srcs.push("AsteroidsAndPowerups/ShockBullet.svg");
    srcs.push(DATA.SPREAD.asteroid, DATA.SPREAD.explosion, DATA.SPREAD.healFx);

    // HUD, achievements + store icons
    Object.values(DATA.hud.digitFiles).forEach(p => srcs.push(p));
    srcs.push(DATA.hud.bulletDot, DATA.hud.fade);
    DATA.achievements.forEach(a => srcs.push(a.src));
    DATA.powerups.forEach(p => srcs.push(p.icon));

    let done = 0;
    return Promise.all(srcs.map(src =>
      loadImage(src).then(() => {
        done++;
        if (onProgress) onProgress(done, srcs.length);
      })
    ));
  }

  function get(src) {
    return cache[src] || null;
  }

  return { loadImage, preloadAll, get };
})();