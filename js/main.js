/* =====================================================
   main.js - ties everything together

   - tracks keyboard input (shared with the game)
   - switches between the Menu / Game / Store / Customize
     screens
   - wires up every button on the page
   ===================================================== */

/* Global input tracker.
   Normalised keys: letters are lower-case ("w", "s"),
   everything else uses its key name ("arrowup", "arrowleft", " "). */
window.INPUT = { keys: {} };

(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  function normalise(e) {
    if (!e.key) return "";
    return e.key.trim() ? e.key.toLowerCase() : " ";   // space -> " "
  }

  document.addEventListener("keydown", function (e) {
    const k = normalise(e);
    // Never let the page scroll with the game keys
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].indexOf(k) > -1) {
      e.preventDefault();
    }
    if (e.repeat || !k) return;
    INPUT.keys[k] = true;
  });

  document.addEventListener("keyup", function (e) {
    const k = normalise(e);
    if (!k) return;
    delete INPUT.keys[k];
  });

  // Pause the game when the tab loses focus
  window.addEventListener("blur", function () {
    if (Game.isInGame()) Game.togglePause();
  });

  /* ---------------- screen navigation ---------------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.add("hidden");
    });
    $(id).classList.remove("hidden");
  }

  function goToMenu() {
    Game.exitToMenu();
    UI.updateMenuStats();
    UI.setTip();
    showScreen("screen-menu");
  }

  /* Full-screen flash used on screen transitions (the fade PNG). */
  function fadeTransition(cb) {
    const el = $("fade");
    el.style.backgroundImage = 'url("' + DATA.hud.fade + '")';
    el.classList.remove("hidden");
    el.classList.add("active");
    setTimeout(function () {
      el.classList.remove("active");
      el.classList.add("hidden");
      if (cb) cb();
    }, 820);
  }

  /* Scatter twinkling stars over a space-themed screen. */
  function scatterStars(wrap) {
    if (!wrap) return;
    for (let i = 0; i < 110; i++) {
      const star = document.createElement("span");
      star.className = "star";
      const size = (Math.random() * 2.2 + 0.6).toFixed(1);
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 100 + "%";
      star.style.animationDelay = (Math.random() * 4).toFixed(2) + "s";
      star.style.animationDuration = (2.5 + Math.random() * 3.5).toFixed(2) + "s";
      wrap.appendChild(star);
    }
  }

  /* The menu buttons ARE images. Point each button at its sprite. */
  function setMenuButtonImages() {
    const mapping = {
      "btn-play": DATA.menuButtons.play,
      "btn-store": DATA.menuButtons.store,
      "btn-customize": DATA.menuButtons.customize,
      "btn-achievements": DATA.menuButtons.achievements
    };
    Object.keys(mapping).forEach(function (id) {
      const btn = $(id);
      if (!btn) return;
      btn.style.backgroundImage = 'url("' + mapping[id] + '")';
    });
  }

  /* ---------------- button wiring ---------------- */
  $("btn-play").addEventListener("click", function () {
    fadeTransition(function () {
      showScreen("screen-game");
      Game.startRun();
    });
  });

  $("btn-store").addEventListener("click", function () {
    UI.buildStore();
    UI.updateStoreMoney();
    showScreen("screen-store");
  });

  $("btn-customize").addEventListener("click", function () {
    // Secret(ish) reset: hold the Up arrow and click Customize
    if (INPUT.keys["arrowup"] || INPUT.keys.w) {
      const sure = window.confirm("Reset your entire account? This cannot be undone!");
      if (sure) {
        SAVE.reset();
        window.location.reload();
      }
      return;
    }
    UI.buildCustomize();
    showScreen("screen-customize");
  });

  $("btn-achievements").addEventListener("click", function () {
    UI.buildAchievements();
    showScreen("screen-achievements");
  });

  $("store-back").addEventListener("click", goToMenu);
  $("customize-back").addEventListener("click", goToMenu);
  $("achievements-back").addEventListener("click", goToMenu);

  $("btn-resume").addEventListener("click", function () {
    Game.togglePause();
  });

  $("btn-game-menu").addEventListener("click", goToMenu);
  $("btn-over-menu").addEventListener("click", goToMenu);

  $("btn-retry").addEventListener("click", function () {
    fadeTransition(function () {
      Game.startRun();
    });
  });

  // Space advances to the next group of options on the Customize screen only
  document.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (e.key !== " " && e.key !== "Spacebar") return;
    if (!$("screen-customize").classList.contains("hidden")) {
      e.preventDefault();
      UI.nextField();
    }
  });

  // Cheat code: type "FREE" on the Store screen to toggle free drops.
  let cheatBuf = "";
  document.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (!$("screen-store").classList.contains("hidden")) {
      if (e.key && e.key.length === 1) cheatBuf += e.key.toUpperCase();
      if (cheatBuf.length > 4) cheatBuf = cheatBuf.slice(-4);
      if (cheatBuf === "FREE") {
        const on = !UI.isFreeDrops();
        UI.setFreeDrops(on);
        UI.notify(on ? "Cheat on: drops are FREE" : "Cheat off", null);
        cheatBuf = "";
      }
    } else {
      cheatBuf = "";
    }
  });

  /* ---------------- boot ---------------- */
  Game.init();
  setMenuButtonImages();
  scatterStars($("menu-stars"));
  scatterStars($("store-stars"));
  scatterStars($("customize-stars"));
  scatterStars($("achievements-stars"));

  // preload every sprite in the background (the menu shows right away);
  // when it's done, refresh the menu buttons and stats
  ASSETS.preloadAll().then(function () {
    setMenuButtonImages();
    UI.updateMenuStats();
  });

  UI.setTip();

  // keep the loop ticking
  requestAnimationFrame(Game.loop);
})();