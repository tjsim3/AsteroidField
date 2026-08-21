/* =====================================================
   main.js - ties everything together

   - tracks keyboard input (shared with the game)
   - switches between the Menu / Game / Store / Achievements
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

  /* Sound: browsers need a click/keypress before audio can start.
     Any button press also gets a little UI "click". */
  document.addEventListener("pointerdown", function () { SFX.unlock(); });
  document.addEventListener("keydown", function () { SFX.unlock(); });
  document.addEventListener("click", function (e) {
    const t = e.target;
    if (t && t.closest && t.closest("button, label")) {
      SFX.unlock();
      SFX.click();
    }
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

  /* ---------------- button wiring ---------------- */
  $("btn-play").addEventListener("click", function () {
    fadeTransition(function () {
      showScreen("screen-game");
      Game.startRun({});
    });
  });

  $("btn-play2").addEventListener("click", function () {
    UI.buildP2Setup();
    showScreen("screen-p2");
  });

  $("btn-p2-start").addEventListener("click", function () {
    fadeTransition(function () {
      showScreen("screen-game");
      Game.startRun({ two: true, cfg: UI.getP2Config() });
    });
  });

  $("btn-store").addEventListener("click", function () {
    UI.buildStore();
    UI.updateStoreMoney();
    showScreen("screen-store");
  });

  $("btn-achievements").addEventListener("click", function () {
    UI.buildAchievements();
    showScreen("screen-achievements");
  });

  $("btn-settings").addEventListener("click", function () {
    UI.buildSettings();
    showScreen("screen-settings");
  });

  $("store-back").addEventListener("click", goToMenu);
  $("achievements-back").addEventListener("click", goToMenu);
  $("settings-back").addEventListener("click", goToMenu);

  // Reset account: wipes every save (money, skins, achievements, stats).
  // Two confirmations so a stray click can never nuke the account.
  const resetBtn = $("btn-reset-account");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Reset your account? This wipes all money, skins, achievements and progress. This cannot be undone.")) return;
      if (!confirm("Are you absolutely sure? There is no way to restore your data.")) return;
      SAVE.reset();
      UI.applySettings(SAVE.load().settings);
      UI.applyTheme();
      UI.updateMenuStats();
      UI.setTip();
      goToMenu();
      UI.notify("Account reset", null);
    });
  }

  // Settings toggles (shake / special effects) + the sound volume slider
  ["shake", "fx"].forEach(function (key) {
    const el = $("set-" + key);
    if (!el) return;
    el.addEventListener("change", function () {
      UI.toggleSetting(key, el.checked);
    });
  });
  const soundEl = $("set-sound");
  if (soundEl) {
    const soundVal = $("set-sound-val");
    soundEl.addEventListener("input", function () {
      UI.toggleSetting("sound", Number(soundEl.value));
      if (soundVal) soundVal.textContent = soundEl.value;
    });
  }

  $("btn-resume").addEventListener("click", function () {
    Game.togglePause();
  });

  $("btn-game-menu").addEventListener("click", goToMenu);
  $("btn-over-menu").addEventListener("click", goToMenu);
  $("p2-back").addEventListener("click", goToMenu);

  // Level rewards screen
  $("btn-claim-all").addEventListener("click", function () {
    Game.claimAllRewards();
  });
  $("btn-rewards-close").addEventListener("click", function () {
    Game.closeRewards();
  });

  // Clicking the menu XP bar opens the rewards track
  $("menu-xp").addEventListener("click", function () {
    Game.openRewards();
  });

  $("btn-retry").addEventListener("click", function () {
    fadeTransition(function () {
      Game.startRun();
    });
  });

  // Cheat code: type "FREE" on the Store screen to toggle free drops, and
  // type a weapon code anywhere (menu or in a run) to equip that gun on P1.
  //   LASER / SHOT / ROCKET / RAPID / SHOCK
  const GUN_CODES = {
    LASER: "laser", SHOT: "shotgun", ROCKET: "rockets", RAPID: "rapidfire", SHOCK: "shock"
  };
  let cheatBuf = "";
  document.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (e.key && e.key.length === 1) {
      cheatBuf += e.key.toUpperCase();
      if (cheatBuf.length > 7) cheatBuf = cheatBuf.slice(-7);
      if (cheatBuf === "FREE" && !$("screen-store").classList.contains("hidden")) {
        const on = !UI.isFreeDrops();
        UI.setFreeDrops(on);
        UI.notify(on ? "Cheat on: drops are FREE" : "Cheat off", null);
        cheatBuf = "";
      } else {
        const hit = Object.keys(GUN_CODES).find(function (c) { return cheatBuf.endsWith(c); });
        if (hit) {
          const id = GUN_CODES[hit];
          if (Game.grantGun(id)) {
            UI.notify("Cheat: loaded " + hit, null);
          } else {
            UI.notify("Cheat: " + hit + " ready - start a run first", null);
          }
          cheatBuf = "";
        }
      }
    }
  });

  /* ---------------- easter eggs ---------------- */

  // Egg 1: the classic Konami code (up up down down left right left right
  // B A) anywhere in the game digs $100 out of the couch cushions - once.
  const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown",
                  "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  let konamiBuf = [];
  document.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    const k = normalise(e);
    if (!k) return;
    konamiBuf.push(k);
    if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
    if (konamiBuf.length === KONAMI.length && KONAMI.every(function (key, i) { return konamiBuf[i] === key; })) {
      konamiBuf = [];
      const s = SAVE.load();
      s.eggs = s.eggs || {};
      if (!s.eggs.konami) {
        s.eggs.konami = true;
        s.money += 100;
        s.stats.lifetimeMoney += 100;
        SAVE.save();
        UI.updateMenuStats();
        UI.notify("KONAMI CODE! +$100 found in the couch cushions.", null);
        if (window.SFX) SFX.unlockFx();
      } else {
        UI.notify("The couch is empty. You already found the Konami cash.", null);
      }
    }
  });

  // Egg 2: click the menu title 10 times and it starts talking back.
  const TITLE_SECRETS = [
    "You found a secret: the asteroids are just rocks.",
    "Achievement unlocked: Persistence. (Not really.)",
    "The developer thanks you for your curiosity.",
    "Still nothing here. Or is there?",
    "Fine. You win. Free hugs. Redeem nowhere."
  ];
  let titleClicks = 0;
  document.querySelector(".title").addEventListener("click", function () {
    titleClicks++;
    if (titleClicks % 10 === 0) {
      UI.notify(TITLE_SECRETS[(titleClicks / 10 - 1) % TITLE_SECRETS.length], null);
      if (window.SFX) SFX.click();
    }
  });

  /* ---------------- boot ---------------- */
  Game.init();
  UI.applySettings(SAVE.load().settings);
  UI.applyTheme();
  scatterStars($("menu-stars"));
  scatterStars($("store-stars"));
  scatterStars($("achievements-stars"));
  scatterStars($("p2-stars"));
  scatterStars($("settings-stars"));

  // preload every sprite in the background (the menu shows right away);
  // when it's done, refresh the menu stats
  ASSETS.preloadAll().then(function () {
    UI.updateMenuStats();
  });

  UI.setTip();

  // keep the loop ticking
  requestAnimationFrame(Game.loop);
})();