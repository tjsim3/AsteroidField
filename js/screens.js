/* =====================================================
   screens.js - builds and controls the Menu, Store and
   Customize screens + the achievement toast.
   ===================================================== */

window.UI = (function () {

  const save = SAVE;
  const $ = id => document.getElementById(id);

  let toastTimer = null;
  let freeDrops = false;   // cheat mode: opening drops costs nothing

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
    const img = document.createElement("img");
    img.src = tip.src;
    img.alt = "Pro tip";
    box.appendChild(img);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(setTip, 8000);   // rotate tips every few seconds
  }

  /* ---------------- Achievements screen ---------------- */
  function buildAchievements() {
    const grid = $("achievements-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const s = save.load();
    DATA.achievements.forEach(function (a) {
      grid.appendChild(achItem(a, !!s.achievements[a.id]));
    });
  }

  /* One achievement badge (the image is the button, like the original). */
  function achItem(a, unlocked) {
    const item = document.createElement("div");
    item.className = "ach-item" + (unlocked ? "" : " locked");
    const img = document.createElement("img");
    img.src = a.src;
    img.alt = a.name;
    const name = document.createElement("span");
    name.className = "ach-name";
    name.textContent = unlocked ? a.name : "???";
    const state = document.createElement("span");
    state.className = "ach-state";
    state.textContent = unlocked ? "UNLOCKED" : "LOCKED";
    item.appendChild(img);
    item.appendChild(name);
    item.appendChild(state);
    item.title = a.name + " \u2014 " + a.desc;
    return item;
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

  /* Everything still missing from the collection. */
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

  function buildStore() {
    const grid = $("store-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const s = save.load();
    const pool = customizationPool(s);
    const bought = s.stats.dropsBought || 0;
    const price = DATA.dropPrice(bought);
    const canAfford = freeDrops || s.money >= price;
    const nextPrice = DATA.dropPrice(bought + 1);

    const card = document.createElement("div");
    card.className = "drop-card";
    card.innerHTML =
      '<div class="drop-visual"></div>' +
      '<h3>Drop</h3>' +
      '<p>' + (pool.length
        ? "A mystery chest with a random skin inside. " + pool.length + " skin" + (pool.length === 1 ? "" : "s") + " left, and every drop costs a little more!"
        : "You have collected every customization!") + '</p>' +
      '<span class="price">' + (freeDrops ? "FREE" : fmt(price)) + '</span>' +
      (pool.length && !freeDrops && nextPrice > price ? '<span class="price-toast">next: ' + fmt(nextPrice) + '</span>' : '') +
      '<button class="buy-btn" ' + (!canAfford || !pool.length ? 'disabled' : '') + '>Open Chest</button>';

    card.querySelector(".buy-btn").addEventListener("click", openDrop);
    grid.appendChild(card);
    buildCollection(s);
  }

  function openDrop() {
    const s = save.load();
    const pool = customizationPool(s);
    const bought = s.stats.dropsBought || 0;
    const price = DATA.dropPrice(bought);

    if (!pool.length) return;
    if (!freeDrops && s.money < price) return;

    if (!freeDrops) {
      s.money -= price;
      s.stats.lifetimeSpent += price;
    }
    s.stats.dropsBought = bought + 1;

    const pick = pool[(Math.random() * pool.length) | 0];
    s.owned[pick.cat].push(pick.item.id);
    save.save();

    updateStoreMoney();
    buildStore();

    // dramatic chest-opening reveal
    showReveal(pick);

    // "Buy all the items" achievement: the collection is complete
    const done = customizationPool(s).length === 0;
    if (done) unlock("buy_all");
  }

  /* Installed-collection grid under the chest. */
  function buildCollection(s) {
    const box = $("store-collection");
    if (!box) return;
    box.innerHTML = "";
    allCustomizations().forEach(function (group) {
      const g = document.createElement("div");
      g.className = "coll-group";
      const title = document.createElement("h4");
      title.textContent = group.name;
      g.appendChild(title);
      const chips = document.createElement("div");
      chips.className = "coll-chips";
      group.items.forEach(function (item) {
        const chip = document.createElement("span");
        if (isOwned(s, group.cat, item.id)) {
          chip.className = "coll-chip";
          const img = document.createElement("img");
          img.src = item.src;
          img.alt = item.name;
          chip.appendChild(img);
        } else {
          chip.className = "coll-chip locked";
          chip.textContent = "?";
        }
        chips.appendChild(chip);
      });
      g.appendChild(chips);
      box.appendChild(g);
    });
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
      const img = document.createElement("img");
      img.src = pick.item.src;
      img.alt = pick.item.name;
      item.appendChild(img);
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

  /* ---------------- Customize screen ---------------- */
  // Each "field" is a group of choices: Ship, Bullet, Background, Trail, Achievements.
  const FIELDS = [
    { key: "ship", name: "Character", type: "skins" },
    { key: "bullet", name: "Bullets", type: "skins" },
    { key: "background", name: "Background", type: "backgrounds" },
    { key: "boost", name: "Trail", type: "skins" },
    { key: "achievements", name: "Achievements", type: "achievements" }
  ];
  let activeField = 0;

  const skinDefs = {
    ship: DATA.ships,
    bullet: DATA.bullets,
    boost: DATA.trails,
    background: DATA.backgrounds
  };

  function buildCustomize() {
    const wrap = $("customize-fields");
    const s = save.load();
    wrap.innerHTML = "";

    FIELDS.forEach(function (field, fi) {
      const box = document.createElement("div");
      box.className = "field-box" + (fi === activeField ? " active" : "");
      box.dataset.field = field.key;
      box.id = "field-" + field.key;

      // Header + click-to-jump
      const head = document.createElement("div");
      head.className = "field-head";
      head.innerHTML =
        '<h3>' + field.name + '</h3>' +
        (fi === activeField ? '<span class="active-tag">ACTIVE</span>' : '');
      head.addEventListener("click", function () { setActiveField(fi); });
      box.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "option-grid";
      addOptions(grid, field, s);

      box.appendChild(grid);
      wrap.appendChild(box);
    });
  }

  function addOptions(grid, field, s) {
    if (field.type === "achievements") {
      // Non-interactive achievement list (image badges)
      const list = document.createElement("div");
      list.className = "ach-list";
      DATA.achievements.forEach(function (a) {
        list.appendChild(achItem(a, !!s.achievements[a.id]));
      });
      grid.appendChild(list);
      return;
    }

    const defs = skinDefs[field.key];

    if (field.key === "background") {
      // Backgrounds show a small moving-preview drawing instead of a file.
      defs.forEach(function (bg, i) {
        const owned = isOwned(s, field.key, bg.id);
        const btn = document.createElement("div");
        btn.className = "option canvas-opt" +
          (s.equipment.background === bg.id ? " selected" : "") +
          (owned ? "" : " locked");
        const cv = document.createElement("canvas");
        cv.width = 74;
        cv.height = 74;
        drawBackgroundPreview(cv, bg);
        btn.appendChild(cv);
        btn.title = bg.name;
        btn.addEventListener("click", function () {
          if (!owned) {
            notify("Locked! Open a Shop drop to find this background.", null);
            return;
          }
          s.equipment.background = bg.id;
          save.save();
          setActiveFieldFor(field.key);
        });
        grid.appendChild(btn);
      });
    } else {
      defs.forEach(function (item, i) {
        const owned = isOwned(s, field.key, item.id);
        const btn = document.createElement("div");
        btn.className = "option" +
          (s.equipment[field.key] === item.id ? " selected" : "") +
          (owned ? "" : " locked");
        const img = document.createElement("img");
        img.src = item.src;
        img.alt = item.name;
        btn.appendChild(img);
        const label = document.createElement("span");
        label.className = "opt-name";
        label.textContent = item.name;
        btn.appendChild(label);
        // Clicking any owned skin selects it (and jumps to its group).
        btn.addEventListener("click", function () {
          if (!owned) {
            notify("Locked! Open a Shop drop to find this item.", null);
            return;
          }
          s.equipment[field.key] = item.id;
          save.save();
          setActiveFieldFor(field.key);
        });
        grid.appendChild(btn);
      });
    }
  }

  /* Jump to the group that fits the given field key, then re-render. */
  function setActiveFieldFor(fieldKey) {
    const fi = FIELDS.findIndex(function (f) { return f.key === fieldKey; });
    if (fi > -1) {
      activeField = fi;
    }
    buildCustomize();
  }

  /* Cycle to the next group of options (Space key). */
  function nextField() {
    setActiveField((activeField + 1) % FIELDS.length);
  }

  function setActiveField(index) {
    activeField = index;
    buildCustomize();
  }

  /* Draw a little thumbnail of a moving background onto a canvas. */
  function drawBackgroundPreview(cv, bg) {
    const ctx = cv.getContext("2d");
    const t = Date.now() / 1000;
    const grad = ctx.createLinearGradient(0, 0, 0, 74);
    grad.addColorStop(0, bg.skyTop);
    grad.addColorStop(1, bg.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 74, 74);

    bg.stars.forEach(function (layer, li) {
      for (let i = 0; i < layer.count; i++) {
        const sx = (Math.sin(i * 997.7) * 0.5 + 0.5) * 74;
        const sy = (Math.cos(i * 613.1) * 0.5 + 0.5) * 74;
        const sm = li + 1;
        // star drifts slowly to the left
        const x = ((sx - t * (20 + 30 * li) * 1.2 * sm) % 74 + 74) % 74;
        ctx.fillStyle = layer.colors[i % layer.colors.length];
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(sy + t * (1 + li));
        ctx.fillRect(x, sy, 1 + layer.size[0] / 2, 1 + layer.size[0] / 2);
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- helpers ---------------- */
  function fmt(n) {
    return "$" + Math.round(n).toLocaleString();
  }

  /* Generic achievement unlocker used across the whole game. */
  function unlock(id) {
    const s = save.load();
    if (s.achievements[id]) return;
    const def = DATA.achievements.find(function (a) { return a.id === id; });
    s.achievements[id] = true;
    save.save();
    if (def) notify("Achievement unlocked: " + def.name, def.src);
    buildAchievements();
  }

  return {
    updateMenuStats, notify, setTip, buildStore, buildCustomize,
    buildAchievements, nextField, setActiveField, unlock, updateStoreMoney, fmt,
    setFreeDrops: function (on) { freeDrops = on; buildStore(); },
    isFreeDrops: function () { return freeDrops; }
  };
})();