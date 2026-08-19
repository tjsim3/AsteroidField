/* =====================================================
   screens.js - builds and controls the Menu, Store,
   Achievements, Multiplayer and Settings screens, plus
   the achievement toast.
   ===================================================== */

window.UI = (function () {

  const save = SAVE;
  const $ = id => document.getElementById(id);

  let toastTimer = null;
  let freeDrops = false;   // cheat mode: opening drops costs nothing
  let p2Cfg = null;        // per-player skins chosen on the 2P setup screen

  /* ---------------- Main menu props ---------------- */
  function updateMenuStats() {
    const s = save.load();
    const unlocked = Object.keys(s.achievements).length;
    $("menu-stats").innerHTML =
      '<span class="money">' + fmt(s.money) + '</span>' +
      '<span class="score">Best Score: ' + s.stats.bestScore + '</span>' +
      '<span class="ach">Achievements: ' + unlocked + '/' + DATA.achievements.length + '</span>';
  }

  /* ---------------- Pro tip bar on the main menu ---------------- */
  let tipTimer = null;
  function setTip() {
    const box = $("tip-box");
    if (!box) return;
    if (!DATA.tips.length) return;
    const tip = DATA.tips[(Math.random() * DATA.tips.length) | 0];
    box.innerHTML = "";
    const text = document.createElement("div");
    text.className = "tip-text";
    text.textContent = tip;
    box.appendChild(text);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(setTip, 8000);   // rotate tips every few seconds
  }

  /* ---------------- Achievements screen ---------------- */
  // Achievements are laid out as progressive groups (e.g. "Points in One
  // Round" -> 500/2000/5000/10000/25000) with a lifetime-stats panel on top.
  function buildAchievements() {
    const grid = $("achievements-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const s = save.load();

    const stats = $("ach-stats");
    if (stats) stats.innerHTML = lifetimeStats(s);

    let lastGroup = null;
    let inner = null;
    DATA.achievements.forEach(function (a) {
      if (a.group !== lastGroup) {
        lastGroup = a.group;
        const groupEl = document.createElement("div");
        groupEl.className = "ach-group";
        const head = document.createElement("div");
        head.className = "ach-group-title";
        head.innerHTML =
          "<h3>" + a.group + "</h3>" +
          '<span class="ach-progress">' + groupProgress(s, a.group) + "</span>";
        groupEl.appendChild(head);
        inner = document.createElement("div");
        inner.className = "ach-list";
        groupEl.appendChild(inner);
        grid.appendChild(groupEl);
      }
      inner.appendChild(achItem(a, !!s.achievements[a.id]));
    });
  }

  function groupProgress(s, group) {
    const list = DATA.achievements.filter(function (a) { return a.group === group; });
    let got = 0;
    list.forEach(function (a) { if (s.achievements[a.id]) got++; });
    return got + " / " + list.length + " Unlocked";
  }

  /* One achievement badge (the image is the button, like the original). */
  function achItem(a, unlocked) {
    const item = document.createElement("div");
    item.className = "ach-item" + (unlocked ? "" : " locked");
    const img = document.createElement("img");
    img.src = a.src;
    img.alt = a.name;
    item.appendChild(img);
    if (unlocked) {
      item.title = "Unlocked: " + a.name;
    } else {
      item.title = "Locked: " + a.name + " \u2014 Progress " + progressLabel(a);
    }
    return item;
  }

  // Live progress for a not-yet-unlocked achievement.
  function progressLabel(a) {
    const s = save.load();
    const cur = trackValue(s, a);
    if (a.track === "buyall") {
      return cur + " / " + totalCustomizations() + " items owned";
    }
    return num(cur) + " / " + num(a.goal);
  }

  function trackValue(s, a) {
    if (a.track === "buyall") return countOwned(s);
    return s.stats[a.track] || 0;
  }

  function countOwned(s) {
    let n = 0;
    allCustomizations().forEach(function (g) {
      g.items.forEach(function (it) {
        if (isOwned(s, g.cat, it.id)) n++;
      });
    });
    return n;
  }

  function totalCustomizations() {
    let n = 0;
    allCustomizations().forEach(function (g) {
      n += g.items.length;
    });
    return n;
  }

  /* Lifetime-stats panel shown above the achievement groups. */
  function lifetimeStats(s) {
    const st = s.stats;
    const pk = st.pickups || {};
    const rows = [
      ["Total Score Earned", num(st.lifetimeScore)],
      ["Total Money Earned", '<span class="money">' + fmt(st.lifetimeMoney) + "</span>"],
      ["Money Spent in Store", '<span class="money">' + fmt(st.lifetimeSpent) + "</span>"],
      ["Best Score in One Round", num(st.bestScore)],
      ["Longest Run", fmtDur(st.bestTime)],
      ["Total Play Time", fmtDur(st.totalTime)],
      ["Rounds Played", num(st.runsPlayed)],
      ["Asteroids Destroyed", num(st.asteroidsDestroyed)],
      ["Shots Fired", num(st.bulletsFired)],
      ["Asteroids Blasted by Shots", num(st.asteroidsByBullets)],
      ["Damage Hits Taken", num(st.timesDowned)],
      ["Best Shot Combo", '<span class="combo-stat">x' + (st.bestCombo || 0) + "</span>"],
      ["Total Combos", num(st.comboTotal)],
      ["Shop Drops Opened", num(st.dropsBought)],
      ["Dollar Bills Collected", num(pk.money)],
      ["Reload Packs Found", num(pk.reload)],
      ["Health Restores", num(pk.health)],
      ["Slow-Mo Drops Found", num(pk.slow)],
      ["Shrink Drops Found", num(pk.shrink)],
      ["Screen Clears Found", num(pk.clear)],
      ["Laser Drops Found", num(pk.laser)],
      ["Shotgun Drops Found", num(pk.shotgun)],
      ["Rocket Drops Found", num(pk.rockets)],
      ["Rapid Fire Drops Found", num(pk.rapidfire)],
      ["Shock Drops Found", num(pk.shock)]
    ];
    let html = '<div class="stats-head">Lifetime Stats</div><div class="stats-grid">';
    rows.forEach(function (r) {
      html += '<div class="stat-row"><span>' + r[0] + "</span><span>" + r[1] + "</span></div>";
    });
    return html + "</div>";
  }

  function fmtDur(sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + "h " + m + "m " + s + "s";
    if (m > 0) return m + "m " + s + "s";
    return s + "s";
  }

  /* ---------------- Toast (achievement + shop reveals) ---------------- */
  function notify(text, imgSrc) {
    const el = $("toast");
    el.innerHTML = "";
    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.alt = "";
      el.appendChild(img);
    }
    const msg = document.createElement("span");
    msg.textContent = text;
    el.appendChild(msg);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 3500);
  }

  /* ---------------- Store screen (Shop drops) ----------------
     A "Drop" is a chest that gives you ONE random customization
     you don't own yet (ship, shot, trail or background). */
  // All customization categories and their skin lists.
  function allCustomizations() {
    return [
      { cat: "ship", name: "Ships", items: DATA.ships },
      { cat: "bullet", name: "Shots", items: DATA.bullets },
      { cat: "boost", name: "Trails", items: DATA.trails },
      { cat: "background", name: "Backgrounds", items: DATA.backgrounds }
    ];
  }

  function isOwned(s, cat, id) {
    return (s.owned[cat] || []).indexOf(id) > -1;
  }

  /* Everything still missing from the collection for one drop type.
   "random" means any category. */
  function customizationPool(s) {
    const pool = [];
    allCustomizations().forEach(function (group) {
      group.items.forEach(function (item) {
        if (!isOwned(s, group.cat, item.id)) {
          pool.push({ cat: group.cat, item: item });
        }
      });
    });
    return pool;
  }

  /* Human label + how many skins remain for a category (drives the card text). */
  const CAT_NAMES = { ship: "a ship", bullet: "a bullet", boost: "a boost trail", background: "a background" };

  function poolFor(s, type) {
    return type === "random"
      ? customizationPool(s)
      : customizationPool(s).filter(function (p) { return p.cat === type; });
  }

  function buildStore() {
    const grid = $("store-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const s = save.load();

    DATA.DROP_ORDER.forEach(function (type) {
      const pool = poolFor(s, type);
      const count = s.stats.dropCounts[type] || 0;
      const price = DATA.dropPrice(type, count);
      const nextPrice = DATA.dropPrice(type, count + 1);
      const canAfford = freeDrops || s.money >= price;
      const def = DATA.DROPS[type];

      const card = document.createElement("div");
      card.className = "drop-card dc-" + type;

      // Icon: the golden chest for the random drop, otherwise a preview of the
      // base item that drop will hand out (ship / shot / trail / background).
      const pic = type === "random"
        ? (function () {
            const d = document.createElement("div");
            d.className = "drop-visual";
            return d;
          })()
        : basePreview(type);
      card.appendChild(pic);

      const title = document.createElement("h3");
      title.textContent = def.name;
      card.appendChild(title);

      const desc = document.createElement("p");
      desc.textContent = pool.length
        ? type === "random"
            ? "A mystery chest with any skin inside. " + pool.length +
              " skin" + (pool.length === 1 ? "" : "s") + " missing total!"
            : "Guaranteed to hold " + CAT_NAMES[type] + ". " + pool.length +
              " still missing from this category."
        : "You have collected every " +
          (type === "random" ? "customization" : def.name.toLowerCase().replace(/ drop$/, "").replace("bullet", "shot")) +
          "!";
      card.appendChild(desc);

      const priceEl = document.createElement("span");
      priceEl.className = "price";
      priceEl.textContent = freeDrops ? "FREE" : fmt(price);
      card.appendChild(priceEl);

      const toast = document.createElement("span");
      toast.className = "price-toast";
      toast.textContent = pool.length && !freeDrops && nextPrice > price
        ? "next: " + fmt(nextPrice)
        : "\u00a0";
      card.appendChild(toast);

      const btn = document.createElement("button");
      btn.className = "buy-btn";
      btn.disabled = !canAfford || !pool.length;
      btn.textContent = pool.length ? "Open Chest" : "Sold Out";
      btn.addEventListener("click", function () { openDrop(type); });
      card.appendChild(btn);

      grid.appendChild(card);
    });

    buildCollection(s);
  }

  /* A preview of the base (default) item each drop category sells. */
  function basePreview(type) {
    const box = document.createElement("div");
    box.className = "drop-pic";
    if (type === "background") {
      box.appendChild(bgCanvas(DATA.backgrounds[0], 64));
    } else {
      const defs = type === "ship" ? DATA.ships : (type === "bullet" ? DATA.bullets : DATA.trails);
      const img = document.createElement("img");
      img.src = defs[0].src;
      img.alt = defs[0].name;
      box.appendChild(img);
    }
    return box;
  }

  function openDrop(type) {
    const s = save.load();
    const pool = poolFor(s, type);
    const count = s.stats.dropCounts[type] || 0;
    const price = DATA.dropPrice(type, count);

    if (!pool.length) return;
    if (!freeDrops && s.money < price) return;

    if (!freeDrops) {
      s.money -= price;
      s.stats.lifetimeSpent += price;
    }
    s.stats.dropCounts[type] = count + 1;
    s.stats.dropsBought = (s.stats.dropsBought || 0) + 1;

    const pick = pool[(Math.random() * pool.length) | 0];
    s.owned[pick.cat].push(pick.item.id);
    save.save();

    updateStoreMoney();
    buildStore();

    // dramatic chest-opening reveal
    showReveal(pick);

    // "Buy all the items" achievement: the collection is complete
    if (customizationPool(s).length === 0) unlock("buy_all");
  }

  /* Installed-collection grid under the chest. Owned skins are buttons:
     click one to equip it; the currently equipped skin gets a ring. */
  function buildCollection(s) {
    const box = $("store-collection");
    if (!box) return;
    box.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "coll-hint";
    hint.textContent = "Click a collected skin to equip it";
    box.appendChild(hint);

    allCustomizations().forEach(function (group) {
      const g = document.createElement("div");
      g.className = "coll-group";
      const title = document.createElement("h4");
      title.textContent = group.name;
      g.appendChild(title);
      const chips = document.createElement("div");
      chips.className = "coll-chips";
      group.items.forEach(function (item) {
        const owned = isOwned(s, group.cat, item.id);
        const chip = document.createElement("button");
        chip.type = "button";
        if (!owned) {
          chip.className = "coll-chip locked";
          chip.textContent = "?";
          chip.title = "Locked - open a " + CAT_NAMES[group.cat] + " drop to unlock it";
          chip.disabled = true;
        } else {
          const equipped = s.equipment[group.cat] === item.id;
          chip.className = "coll-chip" + (equipped ? " equipped" : "");
          chip.title = item.name + (equipped ? " (equipped)" : "");
          chip.addEventListener("click", function () { equipSkin(group.cat, item); });
          if (group.cat === "background") {
            // Backgrounds are procedural (drawn), not image files.
            chip.appendChild(bgCanvas(item, 34));
          } else {
            const img = document.createElement("img");
            img.src = item.src;
            img.alt = item.name;
            chip.appendChild(img);
          }
        }
        chips.appendChild(chip);
      });
      g.appendChild(chips);
      box.appendChild(g);
    });
  }

  /* Equip a skin for its category and refresh the collection ring. */
  function equipSkin(cat, item) {
    const s = save.load();
    if (s.equipment[cat] === item.id) return;
    s.equipment[cat] = item.id;
    save.save();
    if (cat === "background") applyTheme();
    buildCollection(s);
  }

  function updateStoreMoney() {
    $("store-money").textContent = fmt(save.load().money);
  }

  /* ---------------- Dramatic drop reveal ----------------
     A full-screen chest that shakes, then bursts open to
     show what was inside, with a burst of sparkles. */
  let revealTimer = null;
  function showReveal(pick) {
    const el = $("drop-reveal");
    if (!el) { notify("You found: " + pick.item.name + "!", pick.item.src); return; }

    clearTimeout(revealTimer);
    el.innerHTML = "";
    el.classList.remove("hidden");

    const panel = document.createElement("div");
    panel.className = "reveal-panel";

    const title = document.createElement("div");
    title.className = "reveal-title";
    title.textContent = "Opening Drop...";
    panel.appendChild(title);

    const chestWrap = document.createElement("div");
    chestWrap.className = "reveal-chest";
    const chest = document.createElement("div");
    chest.className = "drop-visual";
    chestWrap.appendChild(chest);
    panel.appendChild(chestWrap);

    const hint = document.createElement("div");
    hint.className = "reveal-hint";
    hint.textContent = "click to close";
    panel.appendChild(hint);

    el.appendChild(panel);

    let revealed = false;
    el.addEventListener("click", function closeReveal() {
      if (!revealed) return;
      clearTimeout(revealTimer);
      el.classList.add("hidden");
      el.innerHTML = "";
      el.removeEventListener("click", closeReveal);
    });

    // beat of suspense, then blow the chest open
    revealTimer = setTimeout(function () {
      revealed = true;
      title.textContent = "You found...";
      chestWrap.classList.add("burst");
      hint.textContent = "";

      const item = document.createElement("div");
      item.className = "reveal-item";
      if (pick.cat === "background") {
        // Procedural backgrounds are drawn onto a canvas, not an image file.
        item.appendChild(bgCanvas(pick.item, 130));
      } else {
        const img = document.createElement("img");
        img.src = pick.item.src;
        img.alt = pick.item.name;
        item.appendChild(img);
      }
      panel.insertBefore(item, hint);

      const name = document.createElement("div");
      name.className = "reveal-name";
      name.textContent = pick.item.name;
      panel.insertBefore(name, hint);

      const tag = document.createElement("div");
      tag.className = "reveal-new";
      tag.textContent = "NEW ITEM!";
      panel.insertBefore(tag, hint);

      addSparkles(panel);
    }, 1000);
  }

  /* Little starburst around the revealed item. */
  function addSparkles(container) {
    for (let i = 0; i < 12; i++) {
      const sp = document.createElement("span");
      sp.className = "spark";
      const angle = (i / 12) * Math.PI * 2;
      const dist = 110 + Math.random() * 60;
      sp.style.setProperty("--dx", Math.round(Math.cos(angle) * dist) + "px");
      sp.style.setProperty("--dy", Math.round(Math.sin(angle) * dist) + "px");
      sp.style.setProperty("--delay", (Math.random() * 0.15).toFixed(2) + "s");
      sp.style.setProperty("--color", ["#ffd23e", "#58e06c", "#be86ff", "#3ac6ff"][i % 4]);
      container.appendChild(sp);
    }
  }

  /* ---------------- Customize is gone: skins are equipped right in
   the Store's collection. Each owned skin is a button; clicking it
   equips it for its category (backgrounds recolor every screen). */

  /* A ready-made canvas thumbnail of a procedural background. */
  function bgCanvas(bg, size) {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    cv._bg = bg;
    drawBackgroundPreview(cv, bg);
    return cv;
  }

  /* Draw a little thumbnail of a moving background onto a canvas. */
  function drawBackgroundPreview(cv, bg) {
    const ctx = cv.getContext("2d");
    const size = cv.width;
    const t = Date.now() / 1000;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, bg.skyTop);
    grad.addColorStop(1, bg.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    bg.stars.forEach(function (layer, li) {
      for (let i = 0; i < layer.count; i++) {
        const sx = (Math.sin(i * 997.7) * 0.5 + 0.5) * size;
        const sy = (Math.cos(i * 613.1) * 0.5 + 0.5) * size;
        const sm = li + 1;
        // star drifts slowly to the left
        const x = ((sx - t * (20 + 30 * li) * 1.2 * sm) % size + size) % size;
        ctx.fillStyle = layer.colors[i % layer.colors.length];
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(sy + t * (1 + li));
        ctx.fillRect(x, sy, 1 + layer.size[0] / 2, 1 + layer.size[0] / 2);
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- Two-player setup ---------------- */
  /* The skin categories each player can pick from (unlocked items only). */
  const P2_FIELDS = [
    { key: "ship",   cat: "ship",   defs: DATA.ships,   name: "Ship" },
    { key: "boost",  cat: "boost",  defs: DATA.trails,  name: "Boost Trail" },
    { key: "bullet", cat: "bullet", defs: DATA.bullets, name: "Shot" }
  ];

  /* Which owned item to suggest for Player 2 - the first one that differs
     from Player 1's pick, so the two ships don't look identical. */
  function firstDifferent(s, cat, fromId) {
    const defs = P2_FIELDS.find(function (f) { return f.cat === cat; }).defs;
    const diff = (s.owned[cat] || []).find(function (id) {
      return id !== fromId && defs.some(function (x) { return x.id === id; });
    });
    return diff || fromId;
  }

  function initP2Cfg(s) {
    return {
      p1: {
        ship: s.equipment.ship,
        boost: s.equipment.boost,
        bullet: s.equipment.bullet
      },
      p2: {
        ship: firstDifferent(s, "ship", s.equipment.ship),
        boost: firstDifferent(s, "boost", s.equipment.boost),
        bullet: firstDifferent(s, "bullet", s.equipment.bullet)
      }
    };
  }

  /* Build the two player cards (one per player, three pickers each). */
  function buildP2Setup() {
    const wrap = $("p2-setup");
    if (!wrap) return;
    const s = save.load();
    if (!p2Cfg) p2Cfg = initP2Cfg(s);

    wrap.innerHTML = "";

    ["p1", "p2"].forEach(function (who) {
      const card = document.createElement("div");
      card.className = "p2-card " + who;
      const cfg = p2Cfg[who];
      const color = who === "p1" ? "#6ea8ff" : "#ff6ac1";
      const controls = who === "p1" ? "W/S + Shift" : "Arrows + Space";

      const head = document.createElement("div");
      head.className = "p2-head";
      head.innerHTML =
        '<span class="p2-dot" style="background:' + color + '"></span>' +
        '<span class="p2-title">' + (who === "p1" ? "PLAYER 1" : "PLAYER 2") + '</span>' +
        '<span class="p2-controls">' + controls + '</span>';
      card.appendChild(head);

      P2_FIELDS.forEach(function (field) {
        const box = document.createElement("div");
        box.className = "p2-picker";

        const lbl = document.createElement("div");
        lbl.className = "p2-label";
        lbl.textContent = field.name;
        box.appendChild(lbl);

        const thumbs = document.createElement("div");
        thumbs.className = "p2-thumbs";
// Iterate the defs (id / store-menu order) so every player sees the
      // same layout as the Store collection, then keep only what's owned.
        field.defs.forEach(function (def) {
          const owned = (s.owned[field.cat] || []).indexOf(def.id) > -1;
          if (!owned) return;
          const thumb = document.createElement("div");
          thumb.className = "p2-thumb" + (cfg[field.key] === def.id ? " selected" : "");
          thumb.title = def.name;
          thumb.dataset.pfield = field.key;
          thumb.dataset.pid = def.id;
          const img = document.createElement("img");
          img.src = def.src;
          img.alt = def.name;
          thumb.appendChild(img);
          thumb.addEventListener("click", function () {
            P2_FOCUS[who] = Array.prototype.indexOf.call(
              thumb.closest(".p2-card").querySelectorAll(".p2-thumb"), thumb
            );
            cfg[field.key] = def.id;
            buildP2Setup();
          });
          thumbs.appendChild(thumb);
        });
        box.appendChild(thumbs);
        card.appendChild(box);
      });

      wrap.appendChild(card);
    });

    // Park each player's keyboard cursor on what they have equipped.
    p2SyncFocus();
  }

  /* Per-player keyboard costume picking: P1 uses W/S + Shift, P2 uses the
     arrow keys + Space. Each card is one long row of thumbnails that wraps. */
  const P2_FOCUS = { p1: -1, p2: -1 };   // -1 = "start on the equipped costume"

  function p2Thumbs(who) {
    const card = document.querySelector(".p2-card." + who);
    return card ? Array.prototype.slice.call(card.querySelectorAll(".p2-thumb")) : [];
  }

  /* Validate each player's cursor and draw its highlight ring. */
  function p2SyncFocus() {
    ["p1", "p2"].forEach(function (who) {
      const thumbs = p2Thumbs(who);
      if (!thumbs.length) return;
      let idx = P2_FOCUS[who];
      if (idx < 0) {
        idx = -1;
        thumbs.forEach(function (t, i) {
          if (p2Cfg[who][t.dataset.pfield] === t.dataset.pid) idx = i;
        });
        if (idx < 0) idx = 0;
        P2_FOCUS[who] = idx;
      } else {
        P2_FOCUS[who] = Math.max(0, Math.min(idx, thumbs.length - 1));
      }
      thumbs.forEach(function (t) { t.classList.remove("focused"); });
      thumbs[P2_FOCUS[who]].classList.add("focused");
    });
  }

  function p2Move(who, dir) {
    const thumbs = p2Thumbs(who);
    if (!thumbs.length) return;
    if (P2_FOCUS[who] < 0) P2_FOCUS[who] = 0;
    P2_FOCUS[who] = (P2_FOCUS[who] + dir + thumbs.length) % thumbs.length;
    p2SyncFocus();
  }

  function p2Pick(who) {
    const thumbs = p2Thumbs(who);
    if (!thumbs.length) return;
    if (P2_FOCUS[who] < 0) p2SyncFocus();
    const t = thumbs[P2_FOCUS[who]];
    if (!t) return;
    p2Cfg[who][t.dataset.pfield] = t.dataset.pid;
    buildP2Setup();
  }

  /* Wire up keyboard costume picking while the 2P screen is open. */
  document.addEventListener("keydown", function (e) {
    const screen = $("screen-p2");
    if (!screen || screen.classList.contains("hidden") || e.repeat) return;
    const k = (e.key || "").toLowerCase();
    if (k === "w") { p2Move("p1", -1); e.preventDefault(); return; }
    if (k === "s") { p2Move("p1", 1); e.preventDefault(); return; }
    if (k === "shift") { p2Pick("p1"); e.preventDefault(); return; }
    if (k === "arrowup") { p2Move("p2", -1); e.preventDefault(); return; }
    if (k === "arrowdown") { p2Move("p2", 1); e.preventDefault(); return; }
    if (k === " ") { p2Pick("p2"); e.preventDefault(); }
  });

  /* The full skin config for the run (falls back to equipped gear in game.js). */
  function getP2Config() {
    if (!p2Cfg) {
      const s = save.load();
      p2Cfg = initP2Cfg(s);
    }
    return p2Cfg;
  }

  /* ---------------- helpers ---------------- */
  function fmt(n) {
    return "$" + Math.round(n).toLocaleString();
  }

  function num(n) {
    return Math.round(n || 0).toLocaleString();
  }

  /* Generic achievement unlocker used across the whole game. */
  function unlock(id) {
    const def = DATA.achievements.find(function (a) { return a.id === id; });
    if (!def) return;
    const s = save.load();
    if (s.achievements[id]) return;
    s.achievements[id] = true;
    save.save();
    if (def) notify("Achievement unlocked: " + def.name, def.src);
    if (window.SFX) SFX.unlockFx();
    buildAchievements();
  }

    /* ---------------- Background theme ---------------- */
  function hexToRgba(hex, a) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function mixHex(a, b, t) {
    let ha = a.replace("#", "");
    let hb = b.replace("#", "");
    if (ha.length === 3) ha = ha.split("").map(c => c + c).join("");
    if (hb.length === 3) hb = hb.split("").map(c => c + c).join("");
    const na = parseInt(ha, 16);
    const nb = parseInt(hb, 16);
    const ch = (shift) => {
      const v = Math.round((((na >> shift) & 255) * (1 - t)) + (((nb >> shift) & 255) * t));
      return ("0" + v.toString(16)).slice(-2);
    };
    return "#" + ch(16) + ch(8) + ch(0);
  }

  /* Paint every screen with the equipped background's palette. */
  function applyTheme() {
    const root = document.documentElement;
    const bg = DATA.backgrounds.find(function (b) {
      return b.id === save.load().equipment.background;
    }) || DATA.backgrounds[0];
    root.style.setProperty("--bg-top", bg.skyTop);
    root.style.setProperty("--bg-mid", mixHex(bg.skyTop, bg.skyBottom, 0.46));
    root.style.setProperty("--bg-bottom", bg.skyBottom);
    root.style.setProperty("--bg-glow-a", hexToRgba(bg.accent, 0.28));
    root.style.setProperty("--bg-glow-b", hexToRgba(bg.accent, 0.22));
    root.style.setProperty("--bg-glow-c", hexToRgba(bg.accent, 0.12));
    root.style.setProperty("--bg-star", mixHex(bg.accent, "#ffffff", 0.45));
  }

  /* ---------------- Settings ---------------- */
  /* Expects the *settings object* (s.settings on disk), never the
     whole save - reading e.g. s.shake off the full save is always
     undefined and would force every toggle back on. */
  function applySettings(s) {
    s = s || {};
    FX.setShake(s.shake !== false);
    FX.setFx(s.fx !== false);
    if (window.SFX) SFX.setVolume(soundLevel(s.sound));
  }

  /* Sound is a volume number 0-100 now; old saves may still hold
     a boolean, which maps to all-the-way (true) or muted (false). */
  function soundLevel(v) {
    return typeof v === "number" ? v / 100 : (v ? 1 : 0);
  }

  function buildSettings() {
    const s = save.load();
    applySettings(s.settings);
    const shake = $("set-shake");
    const fx = $("set-fx");
    const sound = $("set-sound");
    if (shake) shake.checked = s.settings.shake !== false;
    if (fx) fx.checked = s.settings.fx !== false;
    if (sound) {
      sound.value = Math.round(soundLevel(s.settings.sound) * 100);
      const lbl = $("set-sound-val");
      if (lbl) lbl.textContent = sound.value;
    }
  }

  function toggleSetting(key, on) {
    const s = save.load();
    s.settings[key] = on;
    save.save();
    applySettings(s.settings);
  }

  /* Keep every visible background thumbnail drifting every frame.
     Canvases hidden inside a closed overlay report offsetWidth 0,
     so they're skipped until they become visible again. */
  function tickBGPreviews() {
    document.querySelectorAll(".coll-chips canvas, .reveal-item canvas")
      .forEach(function (cv) {
        if (cv._bg && cv.offsetWidth > 0) {
          drawBackgroundPreview(cv, cv._bg);
        }
      });
    requestAnimationFrame(tickBGPreviews);
  }
  requestAnimationFrame(tickBGPreviews);

  return {
    updateMenuStats, notify, setTip, buildStore,
    buildAchievements, unlock, updateStoreMoney, fmt,
    buildP2Setup, getP2Config,
    buildSettings, toggleSetting, applySettings, applyTheme,
    setFreeDrops: function (on) { freeDrops = on; buildStore(); },
    isFreeDrops: function () { return freeDrops; }
  };
})();