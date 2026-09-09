(function() {
  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }
  function updateMetaThemeColor() {
    var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (!bg) return;
    document.querySelectorAll('meta[name="theme-color"], meta[name="msapplication-TileColor"]').forEach(function(m) {
      m.setAttribute("content", bg);
    });
  }
  function applyTheme(theme) {
    var html = document.documentElement;
    if (theme === "light") html.setAttribute("data-theme", "light"); else html.removeAttribute("data-theme");
    try {
      localStorage.setItem("karhutla-theme", theme);
    } catch (e) {}
    updateMetaThemeColor();
    if (window.applyChartTheme) window.applyChartTheme();
    if (window.applyMapTheme) window.applyMapTheme();
  }
  function setThemeFade(theme) {
    var html = document.documentElement;
    html.classList.add("theme-transition");
    window.setTimeout(function() {
      html.classList.remove("theme-transition");
    }, 400);
    applyTheme(theme);
  }
  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }
  var revealBusy = false;
  function playCurtainWipe(theme) {
    if (!document.startViewTransition || prefersReducedMotion()) {
      setThemeFade(theme);
      return;
    }
    if (revealBusy) return;
    revealBusy = true;
    var transition = document.startViewTransition(function() {
      applyTheme(theme);
    });
    transition.ready.then(function() {
      document.documentElement.animate({
        clipPath: [ "inset(0 0 100% 0)", "inset(0 0 0% 0)" ]
      }, {
        duration: 900,
        easing: "cubic-bezier(.4,0,.2,1)",
        pseudoElement: "::view-transition-new(root)"
      });
    });
    transition.finished.finally(function() {
      revealBusy = false;
    });
  }
  window.__getKarhutlaTheme = getTheme;
  updateMetaThemeColor();
  var btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", function() {
      playCurtainWipe(getTheme() === "light" ? "dark" : "light");
    });
  }
  try {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", function(e) {
      if (localStorage.getItem("karhutla-theme")) return;
      playCurtainWipe(e.matches ? "light" : "dark");
    });
  } catch (e) {}
})();

const DEMO_DATA = {
  meta: {
    generated_at: "2026-08-08T10:00:00",
    fire_start: "2025-08-01",
    fire_end: "2026-08-08",
    total_hotspots: 48213,
    fire_grid_days: 9120,
    coverage: "Indonesia (Nasional)"
  },
  model: {
    auc_roc: .946,
    pr_auc: .13,
    pr_auc_baseline: .006,
    decision_threshold: .932,
    class_balance_note: "Ini DATA DEMO (bukan hasil model asli) -- ditampilkan hanya karena dashboard_data.json gagal dimuat.",
    confusion_matrix: [ [ 3210, 184 ], [ 201, 1405 ] ],
    roc_curve: {
      fpr: [ 0, .02, .05, .09, .15, .25, .4, .6, 1 ],
      tpr: [ 0, .42, .63, .76, .85, .91, .95, .98, 1 ]
    },
    classification_report: {
      "Tidak Terbakar": {
        precision: .996,
        recall: .988,
        "f1-score": .992,
        support: 932806
      },
      Terbakar: {
        precision: .151,
        recall: .368,
        "f1-score": .214,
        support: 5594
      },
      accuracy: .984
    },
    feature_importance: [ {
      feature: "precip_roll7",
      importance: .238
    }, {
      feature: "precip_roll14",
      importance: .201
    }, {
      feature: "lon_grid",
      importance: .152
    }, {
      feature: "lat_grid",
      importance: .134
    }, {
      feature: "precip_lag1",
      importance: .086
    }, {
      feature: "day_of_year",
      importance: .069
    }, {
      feature: "precip_lag7",
      importance: .051
    }, {
      feature: "precip_mm",
      importance: .037
    }, {
      feature: "month",
      importance: .019
    }, {
      feature: "precip_lag3",
      importance: .013
    } ]
  },
  eda: {
    precip_roll7_box: {
      no_fire: {
        q1: 18.4,
        median: 41.2,
        q3: 78.5
      },
      fire: {
        q1: 0,
        median: 2.1,
        q3: 9.6
      }
    },
    correlation: {
      columns: [ "fire_occurred", "precip_mm", "precip_lag1", "precip_lag3", "precip_lag7", "precip_roll7", "precip_roll14" ],
      matrix: [ [ 1, -.21, -.19, -.17, -.13, -.34, -.31 ], [ -.21, 1, .41, .22, .11, .61, .52 ], [ -.19, .41, 1, .38, .19, .68, .55 ], [ -.17, .22, .38, 1, .29, .59, .61 ], [ -.13, .11, .19, .29, 1, .44, .58 ], [ -.34, .61, .68, .59, .44, 1, .89 ], [ -.31, .52, .55, .61, .58, .89, 1 ] ]
    }
  },
  national: {
    daily_trend: Array.from({
      length: 30
    }, (_, i) => ({
      date: `2026-07-${(i % 30 + 1).toString().padStart(2, "0")}`,
      count: Math.round(200 + Math.random() * 900)
    })),
    regional: [ {
      region: "Kalimantan",
      count: 18420
    }, {
      region: "Sumatra",
      count: 14210
    }, {
      region: "Papua",
      count: 6800
    }, {
      region: "Sulawesi",
      count: 4120
    }, {
      region: "Jawa",
      count: 2140
    }, {
      region: "Lainnya",
      count: 2523
    } ],
    confidence: {
      nominal: 31200,
      low: 9800,
      high: 7213
    },
    daynight: {
      day: 33400,
      night: 14813
    },
    satellite: {
      N20: 21400,
      N: 18900,
      N21: 7913
    }
  },
  ews: {
    target_date: "2026-08-08",
    region_name: "Indonesia",
    mean_risk: .18,
    status_summary: {
      Aman: 78107,
      Waspada: 61,
      "SIAGA 2 (Bahaya)": 20,
      "SIAGA 1 (Sangat Bahaya)": 12
    },
    region_summary: {
      Sumatra: {
        Aman: 11941,
        Waspada: 1523,
        "SIAGA 2 (Bahaya)": 686,
        "SIAGA 1 (Sangat Bahaya)": 118
      },
      Jawa: {
        Aman: 3161,
        Waspada: 299,
        "SIAGA 2 (Bahaya)": 138,
        "SIAGA 1 (Sangat Bahaya)": 58
      },
      "Bali & Nusa Tenggara": {
        Aman: 3010,
        Waspada: 330,
        "SIAGA 2 (Bahaya)": 111,
        "SIAGA 1 (Sangat Bahaya)": 67
      },
      Kalimantan: {
        Aman: 9883,
        Waspada: 1250,
        "SIAGA 2 (Bahaya)": 248,
        "SIAGA 1 (Sangat Bahaya)": 64
      },
      Sulawesi: {
        Aman: 5160,
        Waspada: 308,
        "SIAGA 2 (Bahaya)": 63,
        "SIAGA 1 (Sangat Bahaya)": 7
      },
      Papua: {
        Aman: 11171,
        Waspada: 38,
        "SIAGA 2 (Bahaya)": 7,
        "SIAGA 1 (Sangat Bahaya)": 4
      },
      Maluku: {
        Aman: 7364
      },
      Lainnya: {
        Aman: 21063,
        Waspada: 114,
        "SIAGA 2 (Bahaya)": 14
      }
    },
    top_hazard: [ {
      lat: -1.2,
      lon: 112.4,
      region: "Kalimantan",
      precip_mm: 0,
      precip_roll7: 1.2,
      risk_score: .94,
      status: "SIAGA 1 (Sangat Bahaya)"
    }, {
      lat: -.8,
      lon: 113.1,
      region: "Kalimantan",
      precip_mm: 0,
      precip_roll7: .4,
      risk_score: .91,
      status: "SIAGA 1 (Sangat Bahaya)"
    }, {
      lat: .3,
      lon: 101.9,
      region: "Sumatra",
      precip_mm: .5,
      precip_roll7: 2.8,
      risk_score: .88,
      status: "SIAGA 1 (Sangat Bahaya)"
    } ],
    map_points: function() {
      const pts = [];
      const clusters = [ {
        lat: -1.4,
        lon: 111.6,
        region: "Kalimantan"
      }, {
        lat: .5,
        lon: 102,
        region: "Sumatra"
      } ];
      for (let lat = -8; lat <= 5; lat += .4) {
        for (let lon = 96; lon <= 139; lon += .4) {
          let best = 0;
          clusters.forEach(c => {
            const dist = Math.sqrt((lat - c.lat) ** 2 + ((lon - c.lon) * .85) ** 2);
            best = Math.max(best, Math.max(0, .95 - dist * .42));
          });
          const risk = Math.max(.01, Math.min(.98, best + (Math.random() * .05 - .025)));
          if (risk < .2 && Math.random() > .06) continue;
          const status = risk >= .75 ? "SIAGA 1 (Sangat Bahaya)" : risk >= .5 ? "SIAGA 2 (Bahaya)" : risk >= .25 ? "Waspada" : "Aman";
          const precip = Math.max(0, 25 - risk * 24 + (Math.random() * 6 - 3));
          pts.push({
            lat: +lat.toFixed(2),
            lon: +lon.toFixed(2),
            risk_score: +risk.toFixed(2),
            precip_mm: +precip.toFixed(1),
            status: status,
            region: "Lainnya"
          });
        }
      }
      return pts;
    }(),
    projection: [ 0, 1, 2, 3, 4, 5, 6, 7 ].map(i => ({
      date: `0${8 + i > 9 ? "" : "0"}${8 + i} Agt`.slice(-6),
      mean_risk: +(.15 + i * .02 + Math.random() * .03).toFixed(2),
      siaga1_count: Math.round(10 + i * 3 + Math.random() * 4)
    }))
  },
  realtime: {
    last_updated: "2026-08-11T06:00:00",
    recent: Array.from({
      length: 25
    }, (_, i) => ({
      date: `2026-08-${(11 - Math.floor(i / 4)).toString().padStart(2, "0")}`,
      lat: +(0 - Math.random() * 8).toFixed(3),
      lon: +(96 + Math.random() * 40).toFixed(3),
      frp: +(1 + Math.random() * 30).toFixed(1),
      confidence: [ "nominal", "low", "high" ][Math.floor(Math.random() * 3)],
      daynight: Math.random() > .5 ? "Siang" : "Malam",
      region: "Lainnya"
    })),
    drought_top: Array.from({
      length: 15
    }, () => ({
      lat: +(-8 + Math.random() * 13).toFixed(2),
      lon: +(96 + Math.random() * 43).toFixed(2),
      precip_roll14: +(Math.random() * 3).toFixed(1),
      region: [ "Kalimantan", "Sumatra", "Papua", "Sulawesi", "Jawa" ][Math.floor(Math.random() * 5)]
    }))
  }
};

const EMBER = "#FF7A33", EMBER_L = "#FFB454", RAIN = "#4FB8D0", SAFE = "#5FD98A", WARN = "#F2B84B", DANGER = "#EF5350", SIAGA1 = "#E4392E";

function applyChartTheme() {
  const css = getComputedStyle(document.documentElement);
  const gridColor = css.getPropertyValue("--border-soft").trim();
  const borderColor = css.getPropertyValue("--border").trim();
  const dimColor = css.getPropertyValue("--text-dim").trim();
  Chart.defaults.color = dimColor;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.borderColor = borderColor;
  if (!Chart.instances) return;
  Object.values(Chart.instances).forEach(ch => {
    const scales = ch.options && ch.options.scales;
    if (scales) {
      Object.values(scales).forEach(sc => {
        if (sc && sc.grid && typeof sc.grid.color !== "undefined") sc.grid.color = gridColor;
        if (sc) sc.border = Object.assign({}, sc.border, {
          color: gridColor
        });
      });
    }
    ch.update("none");
  });
}

window.applyChartTheme = applyChartTheme;

applyChartTheme();

function statusColor(status) {
  if (!status) return SAFE;
  if (status.includes("SIAGA 1")) return SIAGA1;
  if (status.includes("SIAGA 2")) return EMBER;
  if (status.includes("Waspada")) return WARN;
  return SAFE;
}

function fmtNum(n) {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

function onceVisible(el, fn, opts) {
  if (!el) return;
  if (!("IntersectionObserver" in window)) {
    fn();
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        fn();
        io.unobserve(entry.target);
      }
    });
  }, Object.assign({
    threshold: .35,
    rootMargin: "0px 0px -6% 0px"
  }, opts || {}));
  io.observe(el);
}

function onceVisibleAfterScroll(el, fn, opts) {
  if (!el) return;
  if (!("IntersectionObserver" in window)) {
    fn();
    return;
  }
  let scrolled = window.scrollY > 4 || window.pageYOffset > 4;
  let fired = false;
  const threshold = (opts && opts.threshold) ?? .35;

  function tryFire() {
    if (fired || !scrolled) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    if (rect.height > 0 && visible / rect.height >= threshold) {
      fired = true;
      fn();
      io.unobserve(el);
      window.removeEventListener("scroll", onScroll);
    }
  }
  function onScroll() {
    scrolled = true;
    tryFire();
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) tryFire();
    });
  }, Object.assign({ threshold, rootMargin: "0px 0px -6% 0px" }, opts || {}));
  io.observe(el);
  window.addEventListener("scroll", onScroll, { passive: true });
}

function animateCountUp(el, targetValue, formatFn, duration) {
  if (!el) return;
  duration = duration || 1300;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = formatFn(targetValue);
    return;
  }
  const startTime = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const val = targetValue * ease(p);
    el.textContent = formatFn(val);
    if (p < 1) requestAnimationFrame(tick); else el.textContent = formatFn(targetValue);
  }
  requestAnimationFrame(tick);
}

function showDemoDataBanner() {
  if (document.getElementById("demo-data-banner")) return;
  const banner = document.createElement("div");
  banner.id = "demo-data-banner";
  banner.setAttribute("role", "alert");
  banner.style.cssText = "position:sticky;top:0;z-index:9999;background:#B33A2E;color:#fff;" +
    "font-size:.85rem;font-weight:600;text-align:center;padding:8px 12px;";
  banner.textContent = "⚠️ dashboard_data.json gagal dimuat — dashboard ini sedang menampilkan DATA DEMO (contoh), bukan data nyata.";
  document.body.prepend(banner);
}

async function loadData() {
  try {
    const res = await fetch("/dashboard_data.json", {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("not found");
    return await res.json();
  } catch (e) {
    console.warn("dashboard_data.json tidak ditemukan, memakai data demo.", e);
    showDemoDataBanner();
    return DEMO_DATA;
  }
}

let LEAFLET_MAP, LAYER_GROUPS = {};
let BASE_LAYER = null, LABEL_LAYER = null;

const BASEMAPS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=" + (window.CARTO_API_KEY || ""),
    options: { attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19 }
  },
  light: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, GIS User Community",
      maxZoom: 19
    },
    labels: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      options: { maxZoom: 19, attribution: "" }
    }
  }
};

function currentThemeName() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function addBasemap(map, theme) {
  const cfg = BASEMAPS[theme] || BASEMAPS.dark;
  BASE_LAYER = L.tileLayer(cfg.url, cfg.options).addTo(map);
  LABEL_LAYER = cfg.labels ? L.tileLayer(cfg.labels.url, cfg.labels.options).addTo(map) : null;
}

function applyMapTheme() {
  if (!LEAFLET_MAP) return;
  if (BASE_LAYER) { LEAFLET_MAP.removeLayer(BASE_LAYER); BASE_LAYER = null; }
  if (LABEL_LAYER) { LEAFLET_MAP.removeLayer(LABEL_LAYER); LABEL_LAYER = null; }
  addBasemap(LEAFLET_MAP, currentThemeName());
}
window.applyMapTheme = applyMapTheme;

let CURRENT_DATA = null;

let CURRENT_REGION = "all";

loadData().then(data => {
  CURRENT_DATA = data;
  renderAll(data);
});

function renderAll(data) {
  renderNav(data);
  renderHero(data);
  renderRegionFilter(data);
  renderMap(data);
  renderProjection(data);
  renderTopHazard(data);
  renderNational(data);
  renderEDA(data);
  renderModel(data);
  renderRealtime(data);
  checkAndNotify(data);
  applyChartTheme();
}

let _navUpdatedAt = null; // date object dari meta.generated_at, dipakai timer relative-time

function formatRelativeID(deltaMs) {
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  return `${day} hari lalu`;
}

function tickNavUpdated() {
  const el = document.getElementById("nav-updated");
  const dot = document.querySelector(".live-dot");
  if (!el) return;
  if (!_navUpdatedAt) {
    el.textContent = "live";
    return;
  }
  const deltaMs = Date.now() - _navUpdatedAt.getTime();
  const deltaHours = deltaMs / 3_600_000;
  const abs = _navUpdatedAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  el.textContent = abs;
  if (dot) {
    let color = "#5fd98a"; // safe/hijau
    if (deltaHours >= 24) color = "#ef5350"; // danger/merah
    else if (deltaHours >= 6) color = "#f2b84b"; // warn/kuning
    // pakai custom property biar titik utama & 2 "jejak" gemanya (::before/::after)
    // selalu sinkron warnanya -- pseudo-element nggak ikut baca dot.style.background langsung
    dot.style.setProperty("--live-dot-color", color);
    dot.style.boxShadow = `0 0 0 3px ${color}2e`;
  }
}

function renderNav(data) {
  const t = data.meta?.generated_at || data.realtime?.last_updated;
  _navUpdatedAt = t ? new Date(t) : null;
  tickNavUpdated();
  if (!window._navUpdatedInterval) {
    window._navUpdatedInterval = setInterval(tickNavUpdated, 60_000);
  }
}

/* koordinat pusat tiap pulau */
const REGION_MAP_COORDS = {
  "Kalimantan": { x: 685.3, y: 531.4 },
  "Papua": { x: 739.8, y: 546.9 },
  "Sumatra": { x: 652.9, y: 530.0 },
  "Bali & Nusa Tenggara": { x: 700, y: 558 },
  "Sulawesi": { x: 706.2, y: 536.6 },
  "Jawa": { x: 675.4, y: 553.4 },
  "Maluku": { x: 723.1, y: 539.4 }
};

/* animasi peta */
function animateHeroMap() {
  const paths = Array.from(document.querySelectorAll("#islandGroup path"));
  const dotsEl = document.getElementById("hero-map-dots");
  if (!paths.length) return 1300;

  const items = paths.map(path => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    return { path, len, duration: Math.max(90, len * 4.5) };
  });
  const gap = 20;
  const totalDuration = items.reduce((s, it) => s + it.duration, 0) + gap * items.length;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  let startTime = null;
  let idx = 0;
  let elapsedBefore = 0;
  function step(ts) {
    if (!startTime) startTime = ts;
    if (idx >= items.length) {
      dotsEl?.classList.add("shown");
      return;
    }
    const it = items[idx];
    const localElapsed = ts - startTime - elapsedBefore;
    const t = Math.min(1, localElapsed / it.duration);
    const drawnLen = it.len * ease(t);
    it.path.style.strokeDashoffset = it.len - drawnLen;
    if (t >= 1) {
      it.path.classList.add("drawn");
      elapsedBefore += it.duration + gap;
      idx++;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return totalDuration;
}

function renderHero(data) {
  const ews = data.ews || {};
  const nat = data.national || {};
  const risk = ews.mean_risk ?? 0;
  const gaugeValueEl = document.getElementById("gauge-value");
  gaugeValueEl.textContent = "0";

  const totalGrid = Object.values(ews.status_summary || {}).reduce((a, b) => a + b, 0);
  document.getElementById("hero-meta-date").textContent = ews.target_date || "-";
  document.getElementById("hero-meta-grid").textContent = `${fmtNum(totalGrid)} sel · 0,1°`;

  const siaga1 = ews.status_summary?.["SIAGA 1 (Sangat Bahaya)"] || 0;
  const siaga2 = ews.status_summary?.["SIAGA 2 (Bahaya)"] || 0;
  const waspada = ews.status_summary?.["Waspada"] || 0;
  const level = siaga1 > 0 ? "SIAGA 1" : siaga2 > 0 ? "SIAGA 2" : waspada > 0 ? "WASPADA" : "AMAN";
  const levelCount = siaga1 > 0 ? siaga1 : siaga2 > 0 ? siaga2 : waspada > 0 ? waspada : totalGrid;
  const c = statusColor(level.includes("1") ? "SIAGA 1" : level.includes("2") ? "SIAGA 2" : level);
  const statusWordEl = document.getElementById("hero-status-word");
  statusWordEl.textContent = level;
  statusWordEl.style.color = c;
  document.getElementById("hero-status-badge").textContent = `${fmtNum(levelCount)} dari ${fmtNum(totalGrid)} grid 0,1° berstatus ${level}`;

  const reg = (nat.regional || []).slice().sort((a, b) => b.count - a.count);
  const totalReg = reg.reduce((s, r) => s + r.count, 0) || 1;
  const dotsEl = document.getElementById("hero-map-dots");
  if (dotsEl && reg.length) {
    const top = reg[0];
    dotsEl.innerHTML = reg.map(r => {
      const coord = REGION_MAP_COORDS[r.region];
      if (!coord) return "";
      const pct = r.count / totalReg * 100;
      if (r.region === top.region) {
        return `<circle class="hot-ring" cx="${coord.x}" cy="${coord.y}" r="6.5"/><circle cx="${coord.x}" cy="${coord.y}" r="2.6" fill="${SIAGA1}"/>`;
      }
      const rr = Math.max(0.8, Math.min(1.8, 0.6 + pct * 0.1));
      return `<circle cx="${coord.x}" cy="${coord.y}" r="${rr.toFixed(2)}" fill="${WARN}"/>`;
    }).join("");
    document.getElementById("hero-region-desc").textContent =
      `${top.region} menyumbang ${Math.round(top.count / totalReg * 100)}% dari seluruh titik panas nasional 30 hari terakhir — titik merah pada peta.`;
  }

  const kpiHotspotEl = document.getElementById("kpi-hotspot");
  const kpiSiaga1El = document.getElementById("kpi-siaga1");
  const kpiPrecipEl = document.getElementById("kpi-precip");
  const kpiAucEl = document.getElementById("kpi-auc");
  kpiHotspotEl.textContent = "0";
  kpiSiaga1El.textContent = "0";
  kpiPrecipEl.textContent = "0,0";
  kpiAucEl.textContent = "0,000";
  const totalHotspot = data.meta?.total_hotspots || 0;
  const avgPrecip = (ews.map_points || []).reduce((a, p) => a + (p.precip_mm || 0), 0) / Math.max(1, (ews.map_points || []).length);
  const auc = data.model?.auc_roc ?? 0;

  // grup 1: peta + persentase -- langsung jalan begitu halaman dibuka, TANPA nunggu scroll
  const mapDuration = animateHeroMap();
  animateCountUp(gaugeValueEl, risk * 100, v => v.toFixed(1), mapDuration);

  // grup 2: 4 kartu statistik -- baru jalan begitu user scroll sampai kartunya kelihatan
  onceVisibleAfterScroll(document.querySelector(".stat-row"), () => {
    animateCountUp(kpiHotspotEl, totalHotspot, v => fmtNum(v));
    animateCountUp(kpiSiaga1El, siaga1, v => fmtNum(v));
    animateCountUp(kpiPrecipEl, avgPrecip, v => v.toFixed(1).replace(".", ","));
    animateCountUp(kpiAucEl, auc, v => v.toFixed(3).replace(".", ","));
  });
  document.getElementById("map-date-label").textContent = "Tanggal analisis: " + (ews.target_date || "-");
  const note = document.getElementById("map-sampling-note");
  if (ews.map_points_total_grid && ews.map_points_sent && ews.map_points_sent < ews.map_points_total_grid) {
    note.textContent = `Menampilkan ${fmtNum(ews.map_points_sent)} dari ${fmtNum(ews.map_points_total_grid)} grid nasional.`;
  } else {
    note.textContent = "";
  }
}

function renderRegionFilter(data) {
  const wrap = document.getElementById("region-filter");
  const trigger = document.getElementById("region-filter-trigger");
  const label = document.getElementById("region-filter-label");
  const panel = document.getElementById("region-filter-panel");
  const regions = Object.keys(data.ews?.region_summary || {}).filter(r => r !== "Lainnya").sort();
  const options = [ {
    value: "all",
    text: "Semua Wilayah"
  }, ...regions.map(r => ({
    value: r,
    text: r
  })) ];
  const checkSvg = visible => `<svg class="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto; flex:none; display:block; opacity:${visible ? 1 : 0}; transform:scale(${visible ? 1 : .5}); color:var(--ember); transition:opacity .15s ease, transform .18s cubic-bezier(.34,1.6,.64,1);"><path d="M20 6L9 17l-5-5"/></svg>`;
  panel.innerHTML = `\n    <div class="region-select-panel-head">\n      <span class="region-select-panel-head-label">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.7-7-11.2A7 7 0 0 1 19 9.8C19 15.3 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/></svg>\n        Pilih Wilayah\n      </span>\n      <button type="button" class="region-select-panel-close" id="region-filter-close" aria-label="Tutup">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>\n      </button>\n    </div>\n    <div class="region-option-list" id="region-option-list">\n      ${options.map((o, i) => {
    const isSel = o.value === CURRENT_REGION;
    return `<div class="region-option${isSel ? " selected" : ""}" data-value="${o.value}" style="transition-delay:${Math.min(i, 9) * 18}ms">\n          <span class="region-option-label">${o.text}</span>${checkSvg(isSel)}\n        </div>`;
  }).join("")}\n    </div>\n  `;
  const optionList = document.getElementById("region-option-list");
  const current = options.find(o => o.value === CURRENT_REGION) || options[0];
  label.textContent = current.text;
  function isMobile() {
    return window.matchMedia("(max-width: 640px)").matches;
  }
  function getBackdrop() {
    let bd = document.getElementById("region-select-backdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.id = "region-select-backdrop";
      bd.className = "region-select-backdrop";
      document.body.appendChild(bd);
      bd.addEventListener("click", closePanel);
    }
    return bd;
  }
  function positionPanel() {
    if (isMobile()) {
      panel.classList.add("sheet");
      panel.style.top = "";
      panel.style.left = "";
      return;
    }
    panel.classList.remove("sheet");
    const r = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - panel.offsetWidth - 16;
    panel.style.top = r.bottom + 8 + "px";
    panel.style.left = Math.max(16, Math.min(r.left, maxLeft)) + "px";
  }
  function closePanel() {
    wrap.classList.remove("open");
    panel.classList.remove("open");
    getBackdrop().classList.remove("open");
    document.body.style.overflow = "";
    window.removeEventListener("scroll", positionPanel, true);
    window.removeEventListener("resize", positionPanel);
  }
  function openPanel() {
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    wrap.classList.add("open");
    positionPanel();
    panel.classList.add("open");
    if (isMobile()) {
      getBackdrop().classList.add("open");
      document.body.style.overflow = "hidden";
    }
    window.addEventListener("scroll", positionPanel, true);
    window.addEventListener("resize", positionPanel);
  }
  if (!wrap.dataset.bound) {
    wrap.dataset.bound = "1";
    trigger.addEventListener("click", e => {
      e.stopPropagation();
      wrap.classList.contains("open") ? closePanel() : openPanel();
    });
    document.addEventListener("click", e => {
      if (!wrap.contains(e.target) && !panel.contains(e.target)) closePanel();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closePanel();
    });
  }
  panel.querySelector("#region-filter-close")?.addEventListener("click", closePanel);
  optionList.querySelectorAll(".region-option").forEach(opt => {
    opt.addEventListener("click", () => {
      const val = opt.dataset.value;
      CURRENT_REGION = val;
      optionList.querySelectorAll(".region-option").forEach(o => {
        const isSel = o.dataset.value === val;
        o.classList.toggle("selected", isSel);
        const chk = o.querySelector(".check");
        chk.style.opacity = isSel ? "1" : "0";
        chk.style.transform = isSel ? "scale(1)" : "scale(.5)";
      });
      label.textContent = opt.querySelector("span").textContent;
      closePanel();
      renderMap(CURRENT_DATA);
      renderTopHazard(CURRENT_DATA);
    });
  });
}

const GRID_HALF = .05;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [ n >> 16 & 255, n >> 8 & 255, n & 255 ];
}

function lerpColor(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const RAIN_STOPS = [ "#12303A", "#1F5C73", "#4FB8D0", "#B8E8F0" ];

function rainColor(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (RAIN_STOPS.length - 1);
  const i = Math.min(RAIN_STOPS.length - 2, Math.floor(seg));
  return lerpColor(RAIN_STOPS[i], RAIN_STOPS[i + 1], seg - i);
}

function alignFullscreenBtnAboveZoom() {
  const mapCard = document.querySelector(".map-card");
  const fsBtn = document.getElementById("map-fullscreen-btn");
  if (!mapCard || !fsBtn) return;
  const isMobileFullscreen = window.innerWidth <= 700 && mapCard.classList.contains("map-fullscreen");
  if (!isMobileFullscreen) {
    fsBtn.style.removeProperty("top");
    fsBtn.style.removeProperty("left");
    fsBtn.style.removeProperty("right");
    fsBtn.style.removeProperty("bottom");
    return;
  }
  const zoomEl = mapCard.querySelector(".leaflet-control-zoom");
  if (!zoomEl) return;
  const cardRect = mapCard.getBoundingClientRect();
  const zoomRect = zoomEl.getBoundingClientRect();
  const GAP = 8;
  fsBtn.style.top = "auto";
  fsBtn.style.left = "auto";
  fsBtn.style.right = Math.round(cardRect.right - zoomRect.right) + "px";
  fsBtn.style.bottom = Math.round(cardRect.bottom - zoomRect.top + GAP) + "px";
}

function renderMap(data) {
  const ews = data.ews || {};
  const allPoints = ews.map_points || [];
  const points = CURRENT_REGION === "all" ? allPoints : allPoints.filter(p => p.region === CURRENT_REGION);
  const center = points.length ? [ points.reduce((a, p) => a + p.lat, 0) / points.length, points.reduce((a, p) => a + p.lon, 0) / points.length ] : [ -1.5, 118 ];
  if (LEAFLET_MAP) {
    LEAFLET_MAP.remove();
    LEAFLET_MAP = null;
  }
  LEAFLET_MAP = L.map("map", {
    scrollWheelZoom: false,
    zoomControl: false,
    preferCanvas: true
  }).setView(center, CURRENT_REGION === "all" ? 5 : 6);
  L.control.zoom({
    position: "bottomright"
  }).addTo(LEAFLET_MAP);
  requestAnimationFrame(alignFullscreenBtnAboveZoom);
  addBasemap(LEAFLET_MAP, currentThemeName());
  const cellBounds = p => [ [ p.lat - GRID_HALF, p.lon - GRID_HALF ], [ p.lat + GRID_HALF, p.lon + GRID_HALF ] ];
  const maxPrecip = Math.max(1, ...points.map(p => p.precip_mm || 0));
  const riskLayer = L.layerGroup();
  const riskPoints = points.filter(p => p.status && p.status !== "Aman");
  riskPoints.forEach(p => {
    const color = statusColor(p.status);
    const isSiaga1 = p.status && p.status.includes("SIAGA 1");
    const rect = L.rectangle(cellBounds(p), {
      color: isSiaga1 ? SIAGA1 : color,
      weight: isSiaga1 ? 1.4 : .6,
      fillColor: color,
      fillOpacity: .68,
      className: isSiaga1 ? "siaga1-cell" : ""
    });
    rect.bindTooltip(`<b>${Math.round(p.risk_score * 100)}% risiko</b> · ${p.region || "-"}<br>` + `Curah hujan: ${p.precip_mm ?? "-"} mm · ${p.status}`, {
      className: "karhutla-tip",
      sticky: true,
      direction: "top"
    });
    rect.bindPopup(`<div style="font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--text);">\n      <b>${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}</b> · ${p.region || "-"}<br>\n      Risiko: <b>${(p.risk_score * 100).toFixed(0)}%</b><br>\n      Curah hujan: ${p.precip_mm ?? "-"} mm<br>\n      Status: ${p.status}</div>`);
    rect.addTo(riskLayer);
  });
  riskLayer.addTo(LEAFLET_MAP);
  const rainLayer = L.layerGroup();
  points.forEach(p => {
    const t = (p.precip_mm || 0) / maxPrecip;
    const c = rainColor(t);
    const rect = L.rectangle(cellBounds(p), {
      color: c,
      weight: .4,
      fillColor: c,
      fillOpacity: .8
    });
    rect.bindTooltip(`<b>${(p.precip_mm || 0).toFixed(1)} mm</b> · ${p.region || "-"}<br>` + `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`, {
      className: "karhutla-tip",
      sticky: true,
      direction: "top"
    });
    rect.addTo(rainLayer);
  });
  const hotspotLayer = L.layerGroup();
  const recentPts = CURRENT_REGION === "all" ? data.realtime?.recent || [] : (data.realtime?.recent || []).filter(h => h.region === CURRENT_REGION);
  recentPts.forEach(h => {
    const r = 3 + Math.min(7, (h.frp || 1) / 6);
    const marker = L.circleMarker([ h.lat, h.lon ], {
      radius: r,
      color: EMBER_L,
      weight: 1,
      fillColor: EMBER,
      fillOpacity: .75
    });
    marker.bindTooltip(`<b>FRP ${h.frp}</b> · ${h.region || "-"}<br>` + `${h.date} · ${h.daynight || "-"} · Kepercayaan: ${h.confidence || "-"}`, {
      className: "karhutla-tip",
      sticky: true,
      direction: "top"
    });
    marker.addTo(hotspotLayer);
  });
  LAYER_GROUPS = {
    risk: riskLayer,
    rain: rainLayer,
    hotspot: hotspotLayer
  };
  const activeBtn = document.querySelector("#layer-toggle button.active")?.dataset.layer || "risk";
  LAYER_GROUPS[activeBtn].addTo(LEAFLET_MAP);
  if (activeBtn !== "risk") LEAFLET_MAP.removeLayer(riskLayer);
  document.querySelectorAll("#layer-toggle button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#layer-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(LAYER_GROUPS).forEach(g => LEAFLET_MAP.removeLayer(g));
      LAYER_GROUPS[btn.dataset.layer].addTo(LEAFLET_MAP);
      document.querySelectorAll(".legend-variant").forEach(v => v.classList.remove("active"));
      document.querySelector(`.legend-variant[data-legend="${btn.dataset.layer}"]`)?.classList.add("active");
    };
  });
  const legendSheet = document.getElementById("map-legend");
  const legendHandle = document.getElementById("map-legend-handle");
  if (legendSheet && legendHandle) {
    const toggleSheet = () => legendSheet.classList.toggle("expanded");
    legendHandle.onclick = toggleSheet;
    legendSheet.onclick = e => {
      if (e.target === legendHandle) return;
      if (!legendSheet.classList.contains("expanded")) toggleSheet();
    };
  }
  const mapCard = document.querySelector(".map-card");
  const fsBtn = document.getElementById("map-fullscreen-btn");
  const fsIcon = document.getElementById("map-fullscreen-icon");
  const ICON_EXPAND = '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>';
  const ICON_COLLAPSE = '<path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4"/>';
  if (mapCard && fsBtn && LEAFLET_MAP) {
    fsBtn.onclick = () => {
      const willExpand = !mapCard.classList.contains("map-fullscreen");
      const swap = () => {
        if (willExpand) {
          if (!mapCard._fsPlaceholder) {
            const ph = document.createComment("map-card-slot");
            mapCard.parentNode.insertBefore(ph, mapCard);
            mapCard._fsPlaceholder = ph;
          }
          document.body.appendChild(mapCard);
        } else if (mapCard._fsPlaceholder) {
          mapCard._fsPlaceholder.parentNode.insertBefore(mapCard, mapCard._fsPlaceholder);
          mapCard._fsPlaceholder.remove();
          mapCard._fsPlaceholder = null;
        }
        mapCard.classList.toggle("map-fullscreen", willExpand);
        document.body.classList.toggle("map-fullscreen-active", willExpand);
        fsIcon.innerHTML = willExpand ? ICON_COLLAPSE : ICON_EXPAND;
        fsBtn.setAttribute("aria-label", willExpand ? "Perkecil peta" : "Perbesar peta");
        if (willExpand) legendSheet?.classList.remove("expanded");
        mapCard.classList.add("map-fs-anim");
        requestAnimationFrame(() => {
          LEAFLET_MAP.invalidateSize();
          alignFullscreenBtnAboveZoom();
        });
        setTimeout(() => {
          LEAFLET_MAP.invalidateSize();
          alignFullscreenBtnAboveZoom();
          mapCard.classList.remove("map-fs-anim");
        }, 280);
      };
      if (willExpand) {
        swap();
      } else {
        mapCard.classList.add("map-fs-anim-out");
        setTimeout(() => {
          mapCard.classList.remove("map-fs-anim-out");
          swap();
        }, 160);
      }
    };
    if (!document.body.dataset.mapFsEscBound) {
      document.body.dataset.mapFsEscBound = "1";
      document.addEventListener("keydown", e => {
        if (e.key === "Escape") document.querySelector(".map-card.map-fullscreen") && fsBtn.click();
      });
    }
  }
  const mapEl = document.getElementById("map");
  if (mapEl && LEAFLET_MAP) {
    mapEl.ontransitionend = e => {
      if (e.propertyName === "height") LEAFLET_MAP.invalidateSize();
    };
    if (!window.__mapResizeBound) {
      window.__mapResizeBound = true;
      window.addEventListener("resize", () => {
        LEAFLET_MAP && LEAFLET_MAP.invalidateSize();
        alignFullscreenBtnAboveZoom();
      });
    }
  }
}

function renderProjection(data) {
  const proj = data.ews?.projection || [];
  new Chart(document.getElementById("chart-projection-risk"), {
    type: "line",
    data: {
      labels: proj.map(p => p.date),
      datasets: [ {
        label: "Rata² Risiko",
        data: proj.map(p => p.mean_risk),
        borderColor: EMBER,
        backgroundColor: "rgba(255,122,51,0.12)",
        fill: true,
        tension: .35,
        pointRadius: 3,
        pointBackgroundColor: EMBER
      } ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          min: 0,
          grid: {
            color: "#1E2723"
          },
          title: {
            display: true,
            text: "Probabilitas"
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });

  new Chart(document.getElementById("chart-projection-siaga1"), {
    type: "line",
    data: {
      labels: proj.map(p => p.date),
      datasets: [ {
        label: "Grid SIAGA 1",
        data: proj.map(p => p.siaga1_count),
        borderColor: SIAGA1,
        backgroundColor: "rgba(228,57,46,0.1)",
        borderDash: [ 4, 3 ],
        fill: true,
        tension: .35,
        pointRadius: 3,
        pointBackgroundColor: SIAGA1
      } ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          min: 0,
          grid: {
            color: "#1E2723"
          },
          title: {
            display: true,
            text: "Jumlah Grid"
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/* kelompok grid rawan yang berdekatan */
function clusterHazardRows(rows, radiusDeg = 0.2) {
  const reps = [];
  for (const r of rows) {
    const near = reps.find(rep => Math.hypot(rep.point.lat - r.lat, rep.point.lon - r.lon) <= radiusDeg);
    if (near) {
      near.count += 1;
    } else {
      reps.push({ point: r, count: 1 });
    }
  }
  return reps;
}

function renderTopHazard(data) {
  const allRows = data.ews?.top_hazard || [];
  const rows = CURRENT_REGION === "all" ? allRows : allRows.filter(r => r.region === CURRENT_REGION);
  const clustered = clusterHazardRows(rows);
  const tbody = document.querySelector("#tbl-top-hazard tbody");
  tbody.innerHTML = clustered.map(({ point: r, count }) => {
    const c = statusColor(r.status);
    const simMd = count > 1
      ? `<span title="Ditemukan ${count} sel berisiko tinggi dalam radius ~55km dari titik ini">+${count - 1} sel lain</span>`
      : `<span style="color:var(--text-faint);">tunggal</span>`;
    return `<tr>\n      <td>${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}</td>\n      <td>${r.region || "-"}</td>\n      <td>${simMd}</td>\n      <td>${(r.precip_roll7 ?? 0).toFixed(1)} mm</td>\n      <td style="color:${c}; font-weight:600;">${Math.round(r.risk_score * 100)}%</td>\n      <td><span class="status-chip" style="background:${c}20; color:${c};">${r.status}</span></td>\n    </tr>`;
  }).join("") || '<tr><td colspan="6" class="loading-note">Tidak ada grid rawan di wilayah ini</td></tr>';
}

function renderNational(data) {
  const nat = data.national || {};
  const trend = nat.daily_trend || [];
  new Chart(document.getElementById("chart-national-trend"), {
    type: "line",
    data: {
      labels: trend.map(t => t.date),
      datasets: [ {
        data: trend.map(t => t.count),
        borderColor: EMBER_L,
        backgroundColor: "rgba(255,180,84,0.1)",
        fill: true,
        tension: .3,
        pointRadius: 0,
        borderWidth: 2
      } ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 8
          }
        },
        y: {
          grid: {
            color: "#1E2723"
          }
        }
      }
    }
  });

  const reg = (nat.regional || []).slice().sort((a, b) => b.count - a.count);
  const totalReg = reg.reduce((s, r) => s + r.count, 0) || 1;
  const pct = n => Math.round(n / totalReg * 100);
  const [ r1, ...restAll ] = reg;
  const rankingEl = document.getElementById("regional-ranking");
  if (rankingEl && r1) {
    rankingEl.innerHTML = `
      <p class="nas-hint">Dari ${fmtNum(totalReg)} titik panas nasional, sebagian besar terjadi di sini</p>
      <div class="rr-top">
        <svg class="rr-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>
        <span class="rr-top-name">${r1.region}</span>
        <span class="rr-top-pct">${pct(r1.count)}%</span>
      </div>
      <div class="rr-track"><div class="rr-fill" style="width:${pct(r1.count)}%;"></div></div>
      <div class="rr-list">
        ${restAll.map(r => `<div class="rr-list-row">
          <span class="rr-list-name">${r.region}</span>
          <span class="rr-list-track"><span class="rr-list-fill" style="width:${Math.max(3, pct(r.count) / pct(r1.count) * 100)}%;"></span></span>
          <span class="rr-list-pct">${pct(r.count)}%</span>
        </div>`).join("")}
      </div>
      <p class="nas-hint" style="margin:16px 0 0;">Dihitung dari titik panas 30 hari terakhir — proporsi wilayah bisa bergeser seiring musim kemarau.</p>`;
  }

  const conf = nat.confidence || {};
  const totalConf = Object.values(conf).reduce((a, b) => a + b, 0) || 1;
  const confPct = { nominal: Math.round((conf.nominal || 0) / totalConf * 100), low: Math.round((conf.low || 0) / totalConf * 100), high: Math.round((conf.high || 0) / totalConf * 100) };
  const reliablePct = confPct.nominal + confPct.high;
  const trustEl = document.getElementById("trust-meter");
  if (trustEl) {
    trustEl.innerHTML = `
      <p class="nas-hint">Seberapa yakin sistem titik panas ini kebakaran beneran</p>
      <div class="tm-headline"><span class="tm-num">${reliablePct}%</span><span class="nas-hint" style="margin:0;">titik panas layak dipercaya</span></div>
      <div class="tm-track">
        <div style="flex:${reliablePct || 1};background:${SAFE};"></div>
        <div style="flex:${confPct.low || 1};background:${WARN};"></div>
      </div>
      <div class="tm-legend">
        <span><span class="tm-dot" style="background:${SAFE};"></span>Layak dipercaya ${reliablePct}%</span>
        <span><span class="tm-dot" style="background:${WARN};"></span>Perlu dicek ulang ${confPct.low}%</span>
      </div>
      <p class="nas-hint" style="margin:16px 0 0;">Gabungan kategori <b>standar</b> (${confPct.nominal}%) + <b>sangat yakin</b> (${confPct.high}%) dari sensor VIIRS — "standar" itu kategori paling umum, bukan tanda kurang meyakinkan.</p>`;
  }

  const dn = nat.daynight || {};
  const totalDN = Object.values(dn).reduce((a, b) => a + b, 0) || 1;
  const dayPct = Math.round((dn.day || 0) / totalDN * 100);
  const nightPct = 100 - dayPct;
  const dnEl = document.getElementById("daynight-split");
  if (dnEl) {
    dnEl.innerHTML = `
      <p class="nas-hint">Kapan titik panas paling sering terdeteksi</p>
      <div class="dn-split">
        <div class="dn-day" style="width:${dayPct}%;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg><span>Siang ${dayPct}%</span></div>
        <div class="dn-night" style="width:${nightPct}%;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/></svg><span>${nightPct}%</span></div>
      </div>
      <p class="nas-hint" style="margin:16px 0 0;">Sensor satelit bekerja paling optimal saat ada cahaya matahari, jadi wajar deteksi siang lebih banyak dari malam.</p>
      <p class="nas-hint" style="margin:10px 0 0;">Deteksi malam umumnya lebih jarang salah, karena kontras panasnya lebih jelas dibanding siang hari.</p>`;
  }

  const sat = nat.satellite || {};
  const totalSat = Object.values(sat).reduce((a, b) => a + b, 0) || 1;
  const satMeta = {
    N20: { name: "Satelit NOAA-20", desc: "Lewat 2 kali sehari, resolusi lebih tajam" },
    N: { name: "Satelit Suomi NPP", desc: "Satelit kedua, buat saling cek silang" }
  };
  const satIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5 10 13l-2.5 2.5-3.5-3.5 2.5-2.5z"/><path d="M13 3l3.5 3.5-2 2L11 5l2-2z"/><path d="M9.5 6.5 17.5 14.5"/><path d="M3.5 20.5l3-3"/></svg>`;
  const satEl = document.getElementById("satellite-cards");
  if (satEl) {
    const cards = Object.entries(sat).map(([ key, val ]) => {
      const meta = satMeta[key] || { name: key, desc: "" };
      return `<div class="sat-card">
        ${satIcon}
        <p class="sat-name">${meta.name}</p>
        <p class="sat-desc">${meta.desc}</p>
        <p class="sat-pct">${Math.round(val / totalSat * 100)}%</p>
      </div>`;
    }).join("");
    satEl.innerHTML = `
      <p class="nas-hint">Sumber titik panas berasal dari 2 satelit berbeda</p>
      <div class="satellite-cards-grid">${cards}</div>
      <p class="nas-hint" style="margin:16px 0 0;">Dua satelit dipakai bersamaan supaya titik panas bisa saling dicek ulang, jadi potensi salah deteksi makin kecil.</p>`;
  }

  const summaryEl = document.getElementById("nas-summary");
  if (summaryEl && r1) {
    const dnLabel = dayPct >= nightPct ? "siang hari" : "malam hari";
    summaryEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      <p>Dalam 30 hari terakhir, <strong>${r1.region}</strong> jadi wilayah paling banyak titik panas (${pct(r1.count)}% dari nasional). Kebanyakan terdeteksi <strong>${dnLabel}</strong>, dan <strong>${reliablePct}% datanya layak dipercaya</strong> jadi bisa cukup diandalkan.</p>`;
  }
}

function renderEDA(data) {
  const box = data.eda?.precip_roll7_box || {};
  const cats = [ "no_fire", "fire" ];
  const labels = [ "Tidak Terbakar", "Terbakar" ];
  new Chart(document.getElementById("chart-precip-box"), {
    data: {
      labels: labels,
      datasets: [
        {
          type: "bar",
          label: "Rentang bawah (0–Q1)",
          data: cats.map(c => box[c]?.q1 || 0),
          backgroundColor: [ `${RAIN}22`, `${SIAGA1}22` ],
          borderColor: [ `${RAIN}55`, `${SIAGA1}55` ],
          borderWidth: 1,
          borderSkipped: false,
          stack: "s",
          maxBarThickness: 64
        },
        {
          type: "bar",
          label: "Rentang tipikal (Q1–Q3)",
          data: cats.map(c => (box[c]?.q3 || 0) - (box[c]?.q1 || 0)),
          backgroundColor: [ `${RAIN}66`, `${SIAGA1}66` ],
          borderColor: [ RAIN, SIAGA1 ],
          borderWidth: 1.5,
          borderRadius: 6,
          stack: "s",
          maxBarThickness: 64
        },
        {
          type: "line",
          label: "Median",
          data: cats.map(c => box[c]?.median || 0),
          showLine: false,
          pointStyle: "line",
          rotation: 90,
          pointRadius: 15,
          pointBorderWidth: 3,
          pointBorderColor: "#F4F1EC",
          pointBackgroundColor: "#F4F1EC"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            padding: 10,
            font: {
              size: 10.5
            },
            filter: item => item.text !== "Rentang bawah (0–Q1)"
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.type === "line") return `Median: ${ctx.raw.toFixed(1)} mm`;
              if (ctx.datasetIndex === 0) return `Q1 (bawah): ${ctx.raw.toFixed(1)} mm`;
              const c = cats[ctx.dataIndex];
              return `Rentang tipikal: ${box[c]?.q1.toFixed(1)}–${box[c]?.q3.toFixed(1)} mm`;
            }
          }
        }
      },
      scales: {
        y: {
          stacked: true,
          grid: {
            color: "#1E2723"
          },
          title: {
            display: true,
            text: "mm / 7 hari"
          }
        },
        x: {
          stacked: true,
          grid: {
            display: false
          }
        }
      }
    }
  });

  const corr = data.eda?.correlation;
  const listEl = document.getElementById("corr-fire-list");
  if (corr && listEl) {
    const labelMap = {
      precip_mm: "Hujan hari ini",
      precip_lag1: "Hujan 1 hari lalu",
      precip_lag3: "Hujan 3 hari lalu",
      precip_lag7: "Hujan 7 hari lalu",
      precip_roll7: "Rata² hujan 7 hari",
      precip_roll14: "Rata² hujan 14 hari"
    };
    const fireRow = corr.matrix[corr.columns.indexOf("fire_occurred")] || [];
    const featCols = corr.columns.filter(c => c !== "fire_occurred");
    const rows = featCols.map(c => ({
      label: labelMap[c] || c,
      value: fireRow[corr.columns.indexOf(c)] ?? 0
    }));
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.value)), 0.01);
    listEl.innerHTML = rows.map(r => {
      const pct = Math.max(4, Math.abs(r.value) / maxAbs * 100).toFixed(0);
      const color = r.value >= 0 ? EMBER : RAIN;
      const dir = r.value >= 0 ? "berbanding lurus" : "berbanding terbalik";
      return `<div class="corr-row" title="${r.label}: korelasi ${r.value.toFixed(2)} (${dir} dengan kejadian kebakaran)">
        <span class="corr-row-label">${r.label}</span>
        <span class="corr-row-track"><span class="corr-row-fill" style="width:${pct}%; background:${color};"></span></span>
        <span class="corr-row-value" style="color:${color};">${r.value.toFixed(2)}</span>
      </div>`;
    }).join("");
  }
}

function renderModel(data) {
  const cm = data.model?.confusion_matrix || [ [ 0, 0 ], [ 0, 0 ] ];
  const total = cm.flat().reduce((a, b) => a + b, 0) || 1;
  const labels = [ [ "Prediksi: Aman", "Aktual: Aman" ], [ "Prediksi: Terbakar", "Aktual: Aman" ], [ "Prediksi: Aman", "Aktual: Terbakar" ], [ "Prediksi: Terbakar", "Aktual: Terbakar" ] ];
  const vals = [ cm[0][0], cm[0][1], cm[1][0], cm[1][1] ];
  const colors = [ SAFE, WARN, WARN, SIAGA1 ];
  let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">';
  vals.forEach((v, i) => {
    const pct = (v / total * 100).toFixed(1);
    html += `<div style="background:${colors[i]}14; border:1px solid ${colors[i]}33; border-radius:9px; padding:14px;">\n      <div style="font-family:var(--font-display); font-size:22px; font-weight:700; color:${colors[i]};">${fmtNum(v)}</div>\n      <div style="font-size:10.5px; color:var(--text-faint); font-family:var(--font-mono); margin-top:4px; line-height:1.5;">${labels[i][0]}<br>${labels[i][1]} · ${pct}%</div>\n    </div>`;
  });
  html += "</div>";
  document.getElementById("confmatrix").innerHTML = html;
  const roc = data.model?.roc_curve || {
    fpr: [ 0, 1 ],
    tpr: [ 0, 1 ]
  };
  new Chart(document.getElementById("chart-roc"), {
    type: "line",
    data: {
      labels: roc.fpr.map(f => f.toFixed(2)),
      datasets: [ {
        label: `ROC (AUC ${(data.model?.auc_roc || 0).toFixed(3)})`,
        data: roc.tpr,
        borderColor: EMBER,
        backgroundColor: "rgba(255,122,51,0.1)",
        fill: true,
        pointRadius: 0,
        tension: .2,
        borderWidth: 2
      }, {
        label: "Acak",
        data: roc.fpr,
        borderColor: "#3A4A42",
        borderDash: [ 3, 3 ],
        pointRadius: 0,
        borderWidth: 1.5
      } ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            font: {
              size: 10
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "FPR",
            font: {
              size: 10
            }
          },
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 6
          }
        },
        y: {
          title: {
            display: true,
            text: "TPR",
            font: {
              size: 10
            }
          },
          grid: {
            color: "#1E2723"
          },
          ticks: {
            maxTicksLimit: 6
          }
        }
      }
    }
  });
  const rep = data.model?.classification_report || {};
  const rows = Object.entries(rep).filter(([k]) => typeof rep[k] === "object");
  let repHtml = '<div class="clsf-table">';
  repHtml += '<div class="clsf-row clsf-head"><span></span><span>Presisi</span><span>Recall</span><span>F1</span></div>';
  rows.forEach(([k, v]) => {
    repHtml += `<div class="clsf-row"><span class="clsf-name">${k}</span><span>${(v.precision * 100).toFixed(1)}%</span><span>${(v.recall * 100).toFixed(1)}%</span><span>${(v["f1-score"] * 100).toFixed(1)}%</span></div>`;
  });
  repHtml += "</div>";
  if (rep.accuracy !== undefined) {
    repHtml += `<div class="metric-row" style="margin-top:6px;"><span class="mname">Akurasi keseluruhan</span><span class="mval" style="color:var(--ember);">${(rep.accuracy * 100).toFixed(1)}%</span></div>`;
  }
  if (data.model?.pr_auc !== undefined) {
    const prAuc = data.model.pr_auc;
    const baseline = data.model.pr_auc_baseline ?? 0;
    repHtml += `<div class="metric-row"><span class="mname">PR-AUC (vs baseline ${(baseline * 100).toFixed(2)}%)</span><span class="mval" style="color:var(--ember);">${prAuc.toFixed(3)}</span></div>`;
  }
  if (data.model?.decision_threshold !== undefined) {
    repHtml += `<div class="metric-row"><span class="mname">Ambang keputusan (F2, prioritas recall)</span><span class="mval" style="color:var(--ember);">${data.model.decision_threshold.toFixed(3)}</span></div>`;
  }
  if (data.model?.class_balance_note) {
    repHtml += `<div class="clsf-note-panel">
      <div class="clsf-note-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      </div>
      <p class="clsf-note-text">${data.model.class_balance_note}</p>
    </div>`;
  }
  document.getElementById("classification-report").innerHTML = repHtml;
  const imp = (data.model?.feature_importance || []).slice().sort((a, b) => a.importance - b.importance);
  new Chart(document.getElementById("chart-importance"), {
    type: "bar",
    data: {
      labels: imp.map(i => i.feature),
      datasets: [ {
        data: imp.map(i => i.importance),
        backgroundColor: EMBER,
        borderRadius: 5
      } ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            color: "#1E2723"
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: "'IBM Plex Mono',monospace",
              size: 11
            }
          }
        }
      }
    }
  });
}

function renderRealtime(data) {
  const rows = (data.realtime?.recent || []).slice().sort((a, b) => b.frp - a.frp).slice(0, 25);
  const tbody = document.querySelector("#tbl-recent tbody");
  tbody.innerHTML = rows.map(r => {
    const confColor = r.confidence === "high" ? SIAGA1 : r.confidence === "low" ? "var(--text-faint)" : WARN;
    return `<tr>\n      <td>${r.date}</td>\n      <td>${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}</td>\n      <td>${r.region || "-"}</td>\n      <td style="color:var(--ember); font-weight:600;">${r.frp}</td>\n      <td><span class="status-chip" style="background:${confColor}20; color:${confColor};">${r.confidence}</span></td>\n      <td>${r.daynight}</td>\n    </tr>`;
  }).join("") || '<tr><td colspan="6" class="loading-note">Tidak ada data</td></tr>';
  const drows = (data.realtime?.drought_top || []).filter(r => r.region !== "Lainnya");
  const dtbody = document.querySelector("#tbl-drought tbody");
  dtbody.innerHTML = drows.map(r => `<tr>\n    <td>${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}</td>\n    <td style="color:${RAIN};">${r.precip_roll14.toFixed(1)}</td>\n    <td>${r.region || "-"}</td>\n  </tr>`).join("") || '<tr><td colspan="3" class="loading-note">Tidak ada data</td></tr>';
}

function checkAndNotify(data) {
  const siaga1 = data.ews?.status_summary?.["SIAGA 1 (Sangat Bahaya)"] || 0;
  const banner = document.getElementById("alert-banner");
  const bannerText = document.getElementById("alert-banner-text");
  const footerBtn = document.getElementById("footer-notif-btn");
  const footerLabel = document.getElementById("footer-notif-label");
  if (!("Notification" in window)) return;
  function fireNotification() {
    if (siaga1 <= 0) return;
    new Notification("Karhutla EWS — Peringatan SIAGA 1", {
      body: `${siaga1} grid berstatus SIAGA 1 (risiko sangat tinggi) hari ini, ${data.ews?.target_date || ""}.`,
      icon: undefined,
      tag: "karhutla-siaga1-" + (data.ews?.target_date || "")
    });
  }
  function syncFooterBtnState() {
    const granted = Notification.permission === "granted";
    footerBtn.classList.toggle("is-active", granted);
    footerBtn.title = granted ? "Notifikasi browser aktif" : "Aktifkan notifikasi browser";
  }
  syncFooterBtnState();
  if (siaga1 > 0) {
    if (Notification.permission === "granted") {
      fireNotification();
    } else if (Notification.permission !== "denied") {
      bannerText.innerHTML = `<b>${siaga1} grid SIAGA 1</b> terdeteksi hari ini secara nasional. Aktifkan notifikasi browser (tombol "Notifikasi" di footer) supaya kamu langsung tahu saat data harian diperbarui.`;
      banner.classList.add("show");
    }
  }
  footerBtn.onclick = () => {
    if (Notification.permission === "granted") {
      syncFooterBtnState();
      return;
    }
    Notification.requestPermission().then(perm => {
      syncFooterBtnState();
      if (perm === "granted") {
        banner.classList.remove("show");
        fireNotification();
      }
    });
  };
}

(function() {
  const revealEls = document.querySelectorAll(".reveal-on-scroll, .reveal-item");
  if (!revealEls.length) return;
  if (!("IntersectionObserver" in window)) {
    revealEls.forEach(el => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, {
    threshold: .15,
    rootMargin: "0px 0px -8% 0px"
  });
  revealEls.forEach(el => io.observe(el));
})();

(function() {
  const links = document.querySelectorAll(".bn-link");
  if (!links.length) return;
  const sections = [...links]
    .map(link => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  if (!sections.length) return;

  const setActive = id => {
    links.forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
    });
  };

  const BN_OFFSET = 100;

  links.forEach(link => {
    link.addEventListener("click", e => {
      const href = link.getAttribute("href");

      setActive(href.slice(1));
      const target = document.querySelector(href);
      if (!target) return; 
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - BN_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  if (!("IntersectionObserver" in window)) return;

  const visibleSections = new Map();
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      visibleSections.set(entry.target.id, entry.intersectionRatio);
    });

    let topId = null;
    let topRatio = 0;
    visibleSections.forEach((ratio, id) => {
      if (ratio > topRatio) {
        topRatio = ratio;
        topId = id;
      }
    });
    if (topId && topRatio > 0) setActive(topId);
  }, {
    threshold: [0, .1, .25, .5, .75, 1],
    rootMargin: "-15% 0px -55% 0px"
  });
  sections.forEach(sec => io.observe(sec));
})();

// pencarian koordinat di peta 
let SEARCH_MARKER = null;

// Dataset 514 kabupaten/kota Indonesia (nama + koordinat pusat) buat fitur
// cari-kota di search box peta. Sumber: BPS/Kemendagri via yusufsyaifudin/wilayah-indonesia
// (2 koordinat yang salah di sumber aslinya -- Kota Binjai & Kab. Empat Lawang -- sudah dikoreksi manual).
const CITIES_ID = [["Kab. Aceh Barat",4.45,96.1667],["Kab. Aceh Barat Daya",3.8333,96.8833],["Kab. Aceh Besar",5.3833,95.5167],["Kab. Aceh Jaya",4.86,95.64],["Kab. Aceh Selatan",3.1667,97.4167],["Kab. Aceh Singkil",2.4167,97.9167],["Kab. Aceh Tamiang",4.25,97.9667],["Kab. Aceh Tengah",4.51,96.855],["Kab. Aceh Tenggara",3.3667,97.7],["Kab. Aceh Timur",4.6333,97.6333],["Kab. Aceh Utara",4.97,97.14],["Kab. Agam",-0.25,100.1667],["Kab. Alor",-8.3,124.5667],["Kab. Asahan",2.7833,99.55],["Kab. Asmat",-5.3795,138.4634],["Kab. Badung",-8.5167,115.2],["Kab. Balangan",-2.3231,115.6292],["Kab. Bandung",-7.1,107.6],["Kab. Bandung Barat",-6.8333,107.4833],["Kab. Banggai",-1.2835,122.8892],["Kab. Banggai Kepulauan",-1.6424,123.5488],["Kab. Banggai Laut",-1.6184,123.4939],["Kab. Bangka",-1.9167,105.9333],["Kab. Bangka Barat",-1.9584,105.5374],["Kab. Bangka Selatan",-2.668,106.0126],["Kab. Bangka Tengah",-2.3399,106.1142],["Kab. Bangkalan",-7.05,112.9333],["Kab. Bangli",-8.2833,115.35],["Kab. Banjar",-3.3167,115.0833],["Kab. Banjarnegara",-7.3511,109.5875],["Kab. Bantaeng",-5.4833,119.9833],["Kab. Bantul",-7.9,110.3667],["Kab. Banyu Asin",-2.8833,104.3831],["Kab. Banyumas",-7.45,109.1667],["Kab. Banyuwangi",-8.3333,114.2],["Kab. Barito Kuala",-3.0833,114.6167],["Kab. Barito Selatan",-1.8667,114.7333],["Kab. Barito Timur",-1.9333,115.1],["Kab. Barito Utara",-0.9833,115.1],["Kab. Barru",-4.4333,119.6833],["Kab. Batang",-7.0333,109.8833],["Kab. Batang Hari",-1.75,103.1167],["Kab. Batu Bara",3.1617,99.5265],["Kab. Bekasi",-6.2467,107.1083],["Kab. Belitung",-2.8667,107.7],["Kab. Belitung Timur",-2.9627,108.1522],["Kab. Belu",-9.4126,124.9507],["Kab. Bener Meriah",4.7302,96.8616],["Kab. Bengkalis",0.9838,102.5096],["Kab. Bengkayang",1.0691,109.6639],["Kab. Bengkulu Selatan",-4.35,103.0333],["Kab. Bengkulu Tengah",-3.2068,102.1262],["Kab. Bengkulu Utara",-3.3333,102.05],["Kab. Berau",2,117.3],["Kab. Biak Numfor",-1.0333,136],["Kab. Bima",-8.6,118.6167],["Kab. Bintan",0.95,104.6194],["Kab. Bireuen",5.0833,96.5833],["Kab. Blitar",-8.1333,112.25],["Kab. Blora",-7.0667,111.3833],["Kab. Boalemo",0.6269,122.3568],["Kab. Bogor",-6.5833,106.7167],["Kab. Bojonegoro",-7.25,111.8],["Kab. Bolaang Mongondow",0.75,124.0833],["Kab. Bolaang Mongondow Selatan",0.4091,123.7596],["Kab. Bolaang Mongondow Timur",0.7207,124.5026],["Kab. Bolaang Mongondow Utara",0.7853,123.4177],["Kab. Bombana",-4.6257,121.8164],["Kab. Bondowoso",-7.9404,113.9834],["Kab. Bone",-4.7,120.1333],["Kab. Bone Bolango",0.503,123.275],["Kab. Boven Digoel",-5.7052,140.3635],["Kab. Boyolali",-7.5,110.7],["Kab. Brebes",-7.05,108.9],["Kab. Buleleng",-8.25,114.9667],["Kab. Bulukumba",-5.4167,120.2333],["Kab. Bulungan",3,117.1667],["Kab. Bungo",-1.5022,101.96],["Kab. Buol",0.75,120.75],["Kab. Buru",-3.3277,126.6841],["Kab. Buru Selatan",-3.5219,126.5927],["Kab. Buton",-5.3167,122.5833],["Kab. Buton Selatan",-5.5667,122.7],["Kab. Buton Tengah",-5.3167,122.3333],["Kab. Buton Utara",-5.0146,122.9301],["Kab. Ciamis",-7.2833,108.4167],["Kab. Cianjur",-6.7725,107.0831],["Kab. Cilacap",-7.5742,108.9886],["Kab. Cirebon",-6.8,108.5667],["Kab. Dairi",2.8667,98.2333],["Kab. Deiyai",-3.9474,135.9503],["Kab. Deli Serdang",3.4167,98.6667],["Kab. Demak",-6.8993,110.6122],["Kab. Dharmasraya",-1.05,101.367],["Kab. Dogiyai",-4.0319,135.4394],["Kab. Dompu",-8.5094,118.4816],["Kab. Donggala",-0.5833,119.85],["Kab. Empat Lawang",-3.9958,103.0146],["Kab. Ende",-8.8406,121.6639],["Kab. Enrekang",-3.5,119.8667],["Kab. Fak-Fak",-2.9264,132.2961],["Kab. Flores Timur",-8.2422,122.9682],["Kab. Garut",-7.3833,107.7667],["Kab. Gayo Lues",3.95,97.39],["Kab. Gianyar",-8.4667,115.2833],["Kab. Gorontalo",0.5728,122.2337],["Kab. Gorontalo Utara",0.77,122.3167],["Kab. Gowa",-5.3167,119.75],["Kab. Gresik",-7.1933,112.553],["Kab. Grobogan",-7.1167,110.9167],["Kab. Gunung Kidul",-7.9833,110.6167],["Kab. Gunung Mas",-0.95,113.5],["Kab. Halmahera Barat",1.4171,127.5526],["Kab. Halmahera Selatan",-0.3955,127.9083],["Kab. Halmahera Tengah",0.4806,128.25],["Kab. Halmahera Timur",1.3352,128.4863],["Kab. Halmahera Utara",1.7319,128.0078],["Kab. Hulu Sungai Selatan",-2.75,115.2],["Kab. Hulu Sungai Tengah",-2.6167,115.4167],["Kab. Hulu Sungai Utara",-2.45,115.1333],["Kab. Humbang Hasundutan",2.2655,98.5038],["Kab. Indragiri Hilir",-0.3333,103.1667],["Kab. Indragiri Hulu",-0.55,102.3167],["Kab. Indramayu",-6.45,108.1667],["Kab. Intan Jaya",-3.4102,136.7084],["Kab. Jayapura",-3,139.95],["Kab. Jayawijaya",-4.0833,139.0833],["Kab. Jember",-8.25,113.65],["Kab. Jembrana",-8.3,114.6667],["Kab. Jeneponto",-5.6333,119.7333],["Kab. Jepara",-6.5833,110.7667],["Kab. Jombang",-7.55,112.25],["Kab. Kaimana",-3.6609,133.7745],["Kab. Kampar",0.2344,101.2131],["Kab. Kapuas",-2.0167,114.3833],["Kab. Kapuas Hulu",0.8167,112.7667],["Kab. Karang Asem",-8.3891,115.5393],["Kab. Karanganyar",-7.6281,111.0625],["Kab. Karawang",-6.2667,107.4167],["Kab. Karimun",0.8076,103.4191],["Kab. Karo",3.1167,98.3],["Kab. Katingan",-2.0667,113.4],["Kab. Kaur",-4.7818,103.3611],["Kab. Kayong Utara",-1.4371,110.7978],["Kab. Kebumen",-7.6392,109.6606],["Kab. Kediri",-7.8333,112.1667],["Kab. Keerom",-3.3,140.6167],["Kab. Kendal",-7.0256,110.1685],["Kab. Kepahiang",-3.6019,102.5642],["Kab. Kepulauan Anambas",3,106],["Kab. Kepulauan Aru",-6.1706,134.4699],["Kab. Kepulauan Mentawai",1.9892,99.5189],["Kab. Kepulauan Meranti",0.9749,102.6954],["Kab. Kepulauan Sangihe",3.5,125.55],["Kab. Kepulauan Selayar",-6.8167,120.8],["Kab. Kepulauan Seribu",-5.5985,106.5527],["Kab. Kepulauan Sula",-1.8646,125.6905],["Kab. Kepulauan Talaud",4.3118,126.7809],["Kab. Kepulauan Yapen",-1.7877,136.2772],["Kab. Kerinci",-2.0333,101.5333],["Kab. Ketapang",-1.5833,110.5],["Kab. Klaten",-7.6833,110.6167],["Kab. Klungkung",-8.55,115.4],["Kab. Kolaka",-4.0833,121.6667],["Kab. Kolaka Timur",-4.0181,121.8617],["Kab. Kolaka Utara",-3.1045,121.1243],["Kab. Konawe",-3.9172,122.0882],["Kab. Konawe Kepulauan",-4.1166,123.1018],["Kab. Konawe Selatan",-4.1919,122.4485],["Kab. Konawe Utara",-3.4155,121.9908],["Kab. Kota Baru",-3,116],["Kab. Kotawaringin Barat",-2.4,111.7333],["Kab. Kotawaringin Timur",-2.0833,112.75],["Kab. Kuantan Singingi",-0.4753,101.4586],["Kab. Kubu Raya",0.0164,109.3373],["Kab. Kudus",-6.8,110.8667],["Kab. Kulon Progo",-7.645,110.0269],["Kab. Kuningan",-7,108.55],["Kab. Kupang",-9.9167,123.8333],["Kab. Kutai Barat",-0.5942,115.5157],["Kab. Kutai Kartanegara",-0.4402,116.9814],["Kab. Kutai Timur",1.0377,117.8311],["Kab. Labuhan Batu",2.2667,100.1],["Kab. Labuhan Batu Selatan",1.983,100.0976],["Kab. Labuhan Batu Utara",2.3335,99.6378],["Kab. Lahat",-3.7864,103.5428],["Kab. Lamandau",-1.8383,111.2869],["Kab. Lamongan",-7.1333,112.3167],["Kab. Lampung Barat",-5.149,104.1931],["Kab. Lampung Selatan",-5.4531,104.9877],["Kab. Lampung Tengah",-4.8667,105.2667],["Kab. Lampung Timur",-5.1027,105.68],["Kab. Lampung Utara",-4.8167,104.8],["Kab. Landak",0.4237,109.7592],["Kab. Langkat",3.7167,98.2167],["Kab. Lanny Jaya",-3.9124,138.2877],["Kab. Lebak",-6.65,106.2167],["Kab. Lebong",-3.2428,102.3349],["Kab. Lembata",-8.414,123.5523],["Kab. Lima Puluh Kota",-0.0168,100.5872],["Kab. Lingga",0.2,104.6167],["Kab. Lombok Barat",-8.6958,116.1167],["Kab. Lombok Tengah",-8.7,116.3],["Kab. Lombok Timur",-8.5333,116.5333],["Kab. Lombok Utara",-8.3521,116.4015],["Kab. Lumajang",-8.1167,113.15],["Kab. Luwu",-2.5577,121.3242],["Kab. Luwu Timur",-2.5096,120.3978],["Kab. Luwu Utara",-2.6,120.25],["Kab. Madiun",-7.6167,111.65],["Kab. Magelang",-7.4275,110.1619],["Kab. Magetan",-7.6447,111.3592],["Kab. Mahakam Hulu",0.3782,115.3805],["Kab. Majalengka",-6.8167,108.2833],["Kab. Majene",-3.15,118.8667],["Kab. Malaka",-9.5632,124.8948],["Kab. Malang",-8.1667,112.6667],["Kab. Malinau",2.45,115.6833],["Kab. Maluku Barat Daya",-7.8296,126.1739],["Kab. Maluku Tengah",-3.2917,128.9675],["Kab. Maluku Tenggara",-5.75,132.7333],["Kab. Maluku Tenggara Barat",-7.6119,131.38],["Kab. Mamasa",-2.9649,119.3063],["Kab. Mamberamo Raya",-2.2356,137.7823],["Kab. Mamberamo Tengah",-2.4606,138.4524],["Kab. Mamuju",-2.5,119.4167],["Kab. Mamuju Tengah",-2.8212,119.2662],["Kab. Mamuju Utara",-1.5164,119.4214],["Kab. Mandailing Natal",0.7838,99.2549],["Kab. Manggarai",-8.5667,120.4167],["Kab. Manggarai Barat",-8.6448,119.8828],["Kab. Manggarai Timur",-8.5553,120.5976],["Kab. Manokwari",-0.9,133.75],["Kab. Manokwari Selatan",-1.0798,133.9673],["Kab. Mappi",-6.4997,139.3444],["Kab. Maros",-5.05,119.7167],["Kab. Maybrat",-1.2155,132.3509],["Kab. Melawi",-0.3362,111.698],["Kab. Mempawah",0.25,109.1667],["Kab. Merangin",-2.0693,102.133],["Kab. Merauke",-7.6667,139.6667],["Kab. Mesuji",-4.0439,105.4013],["Kab. Mimika",-4.5436,136.5656],["Kab. Minahasa",1.2537,124.83],["Kab. Minahasa Selatan",1.2129,124.5971],["Kab. Minahasa Tenggara",1.0563,124.7925],["Kab. Minahasa Utara",1.4025,124.96],["Kab. Mojokerto",-7.55,112.5],["Kab. Morowali",-1.8934,121.2547],["Kab. Morowali Utara",-1.7207,121.2465],["Kab. Muara Enim",-4.2327,103.6141],["Kab. Muaro Jambi",-1.5521,103.8216],["Kab. Mukomuko",-3.0744,101.5477],["Kab. Muna",-4.9667,122.6667],["Kab. Muna Barat",-4.8333,122.4833],["Kab. Murung Raya",-0.0167,114.2667],["Kab. Musi Banyu Asin",-2.4167,103.75],["Kab. Musi Rawas",-3.0833,103.2],["Kab. Musi Rawas Utara",-2.4853,103.2935],["Kab. Nabire",-3.5402,135.5551],["Kab. Nagan Raya",4.1667,96.5167],["Kab. Nagekeo",-8.8721,121.2096],["Kab. Natuna",4.7142,107.9764],["Kab. Nduga",-4.4509,138.1009],["Kab. Ngada",-8.6667,121],["Kab. Nganjuk",-7.6,111.9333],["Kab. Ngawi",-7.4744,111.3344],["Kab. Nias",1.0333,97.7667],["Kab. Nias Barat",1.0597,97.5861],["Kab. Nias Selatan",0.77,97.75],["Kab. Nias Utara",1.3304,97.3196],["Kab. Nunukan",4.1333,116.7],["Kab. Ogan Ilir",-3.4319,104.6273],["Kab. Ogan Komering Ilir",-3.3667,105.3667],["Kab. Ogan Komering Ulu",-4.1333,104.0333],["Kab. Ogan Komering Ulu Selatan",-4.6573,104.0066],["Kab. Ogan Komering Ulu Timur",-3.8568,104.7521],["Kab. Pacitan",-8.1333,111.1667],["Kab. Padang Lawas",1.4468,99.9921],["Kab. Padang Lawas Utara",1.4601,99.6735],["Kab. Padang Pariaman",-0.6,100.2833],["Kab. Pakpak Bharat",2.5667,98.2833],["Kab. Pamekasan",-7.0667,113.5],["Kab. Pandeglang",-6.6333,105.75],["Kab. Pangandaran",-7.6673,108.6404],["Kab. Pangkajene Dan Kepulauan",-4.7827,119.5506],["Kab. Paniai",-3.9,136.6],["Kab. Parigi Moutong",0.3368,120.1784],["Kab. Pasaman",0.425,99.9461],["Kab. Pasaman Barat",0.2815,99.5196],["Kab. Paser",-1.4352,116.2353],["Kab. Pasuruan",-7.7333,112.8333],["Kab. Pati",-6.7667,111.1],["Kab. Pegunungan Arfak",-0.9352,133.8959],["Kab. Pegunungan Bintang",-4.5217,140.2954],["Kab. Pekalongan",-7.0319,109.624],["Kab. Pelalawan",0.2082,102.1861],["Kab. Pemalang",-7.0333,109.4],["Kab. Penajam Paser Utara",-1.25,116.8333],["Kab. Penukal Abab Lematang Ilir",-3.2134,104.0872],["Kab. Pesawaran",-5.4298,105.179],["Kab. Pesisir Barat",-5.1932,103.9398],["Kab. Pesisir Selatan",-1.5833,100.85],["Kab. Pidie",5.08,96.11],["Kab. Pidie Jaya",5.15,96.2167],["Kab. Pinrang",-3.6167,119.6],["Kab. Pohuwato",0.7098,121.5958],["Kab. Polewali Mandar",-3.3,119.1667],["Kab. Ponorogo",-7.9333,111.5],["Kab. Poso",-1.65,120.5],["Kab. Pringsewu",-5.4221,104.9345],["Kab. Probolinggo",-7.8667,113.3167],["Kab. Pulang Pisau",-3.1186,113.8623],["Kab. Pulau Morotai",2.1992,128.4055],["Kab. Pulau Taliabu",-1.8458,124.7899],["Kab. Puncak",-4.142,137.097],["Kab. Puncak Jaya",-3.6724,137.439],["Kab. Purbalingga",-7.2842,109.3503],["Kab. Purwakarta",-6.5833,107.45],["Kab. Purworejo",-7.7,109.9667],["Kab. Raja Ampat",-0.5,130],["Kab. Rejang Lebong",-3.4333,102.7167],["Kab. Rembang",-6.7833,111.4667],["Kab. Rokan Hilir",2.166,100.8251],["Kab. Rokan Hulu",0.8833,100.4833],["Kab. Rote Ndao",-10.7362,123.1205],["Kab. Sabu Raijua",-10.5629,121.7889],["Kab. Sambas",1.4167,109.3333],["Kab. Samosir",2.6402,98.7152],["Kab. Sampang",-7.05,113.25],["Kab. Sanggau",0.2547,110.45],["Kab. Sarmi",-2.4167,139.0833],["Kab. Sarolangun",-2.3,102.65],["Kab. Sekadau",0.0348,110.9507],["Kab. Seluma",-3.9664,102.4743],["Kab. Semarang",-7.2067,110.4414],["Kab. Seram Bagian Barat",-3.1027,128.43],["Kab. Seram Bagian Timur",-3.3985,130.3917],["Kab. Serang",-6.15,106],["Kab. Serdang Bedagai",3.3667,99.0333],["Kab. Seruyan",-2.3333,112.25],["Kab. Siak",0.9745,102.0135],["Kab. Siau Tagulandang Biaro",2.1173,125.3751],["Kab. Sidenreng Rappang",-3.85,119.9667],["Kab. Sidoarjo",-7.45,112.7],["Kab. Sigi",-1.385,119.9669],["Kab. Sijunjung",-1.1827,101.6056],["Kab. Sikka",-8.6667,122.3667],["Kab. Simalungun",2.9,99],["Kab. Simeulue",2.6167,96.0833],["Kab. Sinjai",-5.2167,120.15],["Kab. Sintang",-0.0833,112.0833],["Kab. Situbondo",-7.7167,114.05],["Kab. Sleman",-7.6817,110.3233],["Kab. Solok",-0.9667,100.8167],["Kab. Solok Selatan",-1.2333,101.417],["Kab. Soppeng",-4.3842,119.89],["Kab. Sorong",-1.1667,131.5],["Kab. Sorong Selatan",-1.505,132.2864],["Kab. Sragen",-7.4128,110.935],["Kab. Subang",-6.5083,107.7025],["Kab. Sukabumi",-7.0667,106.7],["Kab. Sukamara",-2.6267,111.2368],["Kab. Sukoharjo",-7.6833,110.8333],["Kab. Sumba Barat",-9.5667,119.45],["Kab. Sumba Barat Daya",-9.5622,119.0891],["Kab. Sumba Tengah",-9.6294,119.6191],["Kab. Sumba Timur",-9.8833,120.25],["Kab. Sumbawa",-8.7439,117.3324],["Kab. Sumbawa Barat",-8.7516,116.9213],["Kab. Sumedang",-6.8167,107.9833],["Kab. Sumenep",-7.1167,114.3333],["Kab. Supiori",-0.7388,135.6111],["Kab. Tabalong",-1.8833,115.5],["Kab. Tabanan",-8.4333,115.0667],["Kab. Takalar",-5.4167,119.5167],["Kab. Tambrauw",-0.6051,132.4896],["Kab. Tana Tidung",3.55,117.25],["Kab. Tana Toraja",-3.0024,119.7965],["Kab. Tanah Bumbu",-3.4541,115.7037],["Kab. Tanah Datar",-0.4555,100.5771],["Kab. Tanah Laut",-3.8833,114.8667],["Kab. Tangerang",-6.2,106.4667],["Kab. Tanggamus",-5.3851,104.6235],["Kab. Tanjung Jabung Barat",-1.1544,103.244],["Kab. Tanjung Jabung Timur",-1.132,103.6175],["Kab. Tapanuli Selatan",1.5167,99.25],["Kab. Tapanuli Tengah",1.9,98.6667],["Kab. Tapanuli Utara",2.0028,99.0707],["Kab. Tapin",-2.9167,115.0333],["Kab. Tasikmalaya",-7.5,108.1333],["Kab. Tebo",-1.4558,102.3747],["Kab. Tegal",-7.0333,109.1667],["Kab. Teluk Bintuni",-1.8804,133.3311],["Kab. Teluk Wondama",-2.7,134.5],["Kab. Temanggung",-7.25,110.1167],["Kab. Timor Tengah Selatan",-9.8333,124.4],["Kab. Timor Tengah Utara",-9.3314,124.519],["Kab. Toba Samosir",2.3979,99.2168],["Kab. Tojo Una-Una",-1.2036,121.482],["Kab. Toli-Toli",1.3086,120.8864],["Kab. Tolikara",-3.4266,137.417],["Kab. Toraja Utara",-2.9274,119.7922],["Kab. Trenggalek",-8.1667,111.6167],["Kab. Tuban",-6.9667,111.9],["Kab. Tulang Bawang Barat",-4.4398,105.0444],["Kab. Tulangbawang",-4.206,105.58],["Kab. Tulungagung",-8.1167,111.9167],["Kab. Wajo",-4,120.1667],["Kab. Wakatobi",-5.3193,123.5948],["Kab. Waropen",-2.286,137.0184],["Kab. Way Kanan",-4.447,104.5275],["Kab. Wonogiri",-7.9167,111],["Kab. Wonosobo",-7.3614,109.9267],["Kab. Yahukimo",-4.604,139.584],["Kab. Yalimo",-3.8604,138.4731],["Kota Ambon",-3.7,128.1833],["Kota Balikpapan",-1.1667,116.8833],["Kota Banda Aceh",5.5417,95.3333],["Kota Bandar Lampung",-5.4167,105.25],["Kota Bandung",-6.9175,107.6244],["Kota Banjar",-7.37,108.5321],["Kota Banjar Baru",-3.4167,114.8333],["Kota Banjarmasin",-3.3244,114.591],["Kota Batam",1.0521,104.0285],["Kota Batu",-7.8327,112.5375],["Kota Baubau",-5.477,122.6166],["Kota Bekasi",-6.2833,106.9833],["Kota Bengkulu",-3.8167,102.3167],["Kota Bima",-8.4673,118.7526],["Kota Binjai",3.6001,98.4854],["Kota Bitung",1.4833,125.15],["Kota Blitar",-8.1,112.1667],["Kota Bogor",-6.5917,106.8],["Kota Bontang",0.1253,117.496],["Kota Bukittinggi",-0.275,100.375],["Kota Cilegon",-6.0167,106.0167],["Kota Cimahi",-6.8917,107.55],["Kota Cirebon",-6.75,108.55],["Kota Denpasar",-8.6667,115.2166],["Kota Depok",-6.4,106.8167],["Kota Dumai",1.6159,101.4917],["Kota Gorontalo",0.5333,123.1],["Kota Gunungsitoli",1.3273,97.5502],["Kota Jakarta Barat",-6.1676,106.7673],["Kota Jakarta Pusat",-6.1777,106.8403],["Kota Jakarta Selatan",-6.266,106.8135],["Kota Jakarta Timur",-6.2521,106.884],["Kota Jakarta Utara",-6.1339,106.8823],["Kota Jambi",-1.6167,103.65],["Kota Jayapura",-2.6465,140.7778],["Kota Kediri",-7.8333,112.0167],["Kota Kendari",-3.9833,122.5],["Kota Kotamobagu",0.6892,124.3268],["Kota Kupang",-10.2167,123.6],["Kota Langsa",4.47,97.93],["Kota Lhokseumawe",5.1333,97.0667],["Kota Lubuk Linggau",-3.2931,102.855],["Kota Madiun",-7.6333,111.5333],["Kota Magelang",-7.5,110.225],["Kota Makassar",-5.15,119.45],["Kota Malang",-7.975,112.6333],["Kota Manado",1.5167,124.8833],["Kota Mataram",-8.5833,116.1167],["Kota Medan",3.65,98.6667],["Kota Metro",-5.1186,105.2995],["Kota Mojokerto",-7.4667,112.4333],["Kota Padang",-0.9833,100.45],["Kota Padang Panjang",-0.45,100.4333],["Kota Padang Sidempuan",1.3738,99.2684],["Kota Pagar Alam",-4.1306,103.2682],["Kota Palangka Raya",-1.7698,113.7313],["Kota Palembang",-3,104.7167],["Kota Palopo",-2.9784,120.1108],["Kota Palu",-0.8697,119.9],["Kota Pangkal Pinang",-2.1333,106.1333],["Kota Pare-Pare",-4.0333,119.65],["Kota Pariaman",-0.6268,100.1205],["Kota Pasuruan",-7.65,112.9],["Kota Payakumbuh",-0.2333,100.6333],["Kota Pekalongan",-6.9,109.6833],["Kota Pekanbaru",0.5333,101.4667],["Kota Pematang Siantar",2.9667,99.05],["Kota Pontianak",-0.0833,109.3667],["Kota Prabumulih",-3.462,104.2229],["Kota Probolinggo",-7.7833,113.2167],["Kota Sabang",5.8216,95.3109],["Kota Salatiga",-7.3328,110.4833],["Kota Samarinda",-0.4333,117.1833],["Kota Sawah Lunto",-0.6,100.75],["Kota Semarang",-7.0333,110.3833],["Kota Serang",-6.1256,106.15],["Kota Sibolga",1.7333,98.8],["Kota Singkawang",0.9073,109.001],["Kota Solok",-0.7667,100.6167],["Kota Sorong",-0.8651,131.2515],["Kota Subulussalam",2.75,97.9333],["Kota Sukabumi",-6.95,106.9333],["Kota Sungai Penuh",-2.109,101.3217],["Kota Surabaya",-7.2667,112.7167],["Kota Surakarta",-7.55,110.8167],["Kota Tangerang",-6.1794,106.6299],["Kota Tangerang Selatan",-6.2937,106.7124],["Kota Tanjung Balai",2.9583,99.7917],["Kota Tanjung Pinang",0.9168,104.4433],["Kota Tarakan",3.3667,117.6],["Kota Tasikmalaya",-7.35,108.2167],["Kota Tebing Tinggi",3.325,99.1417],["Kota Tegal",-6.8686,109.1129],["Kota Ternate",0.8962,127.3102],["Kota Tidore Kepulauan",0.6096,127.5698],["Kota Tomohon",1.3131,124.834],["Kota Tual",-5.643,132.7493],["Kota Yogyakarta",-7.8,110.375]];

function normalizeSearchText(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function searchCities(query, limit) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const [name, lat, lon] of CITIES_ID) {
    const n = normalizeSearchText(name);
    if (n.startsWith(q) || n.replace(/^kab\. |^kota /, "").startsWith(q)) {
      starts.push({ name, lat, lon });
    } else if (n.includes(q)) {
      contains.push({ name, lat, lon });
    }
  }
  return [...starts, ...contains].slice(0, limit || 8);
}

function parseCoordInput(raw) {
  const cleaned = raw.trim().replace(/[;|]/g, ",");
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function findNearestGridPoint(lat, lon) {
  const points = CURRENT_DATA?.ews?.map_points || [];
  let best = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.lat - lat, p.lon - lon);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return bestDist <= 0.12 ? best : null;
}

function jumpToPoint(lat, lon, knownPoint, label) {
  if (!LEAFLET_MAP) return; // peta belum siap, jangan crash

  if (SEARCH_MARKER) {
    LEAFLET_MAP.removeLayer(SEARCH_MARKER);
    SEARCH_MARKER = null;
  }

  const titleLine = label
    ? `<b>${label}</b><br><span style="opacity:.7;">${lat.toFixed(3)}, ${lon.toFixed(3)}</span>`
    : `<b>${lat.toFixed(3)}, ${lon.toFixed(3)}</b>`;
  const nearest = knownPoint || findNearestGridPoint(lat, lon);
  const popupHtml = nearest
    ? `<div style="font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--text);">
        ${titleLine}<br>
        Sel grid terdekat: ${nearest.lat.toFixed(2)}, ${nearest.lon.toFixed(2)} · ${nearest.region || "-"}<br>
        Risiko: <b>${(nearest.risk_score * 100).toFixed(0)}%</b> · ${nearest.status}<br>
        Curah hujan: ${nearest.precip_mm ?? "-"} mm</div>`
    : `<div style="font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--text);">
        ${titleLine}<br>
        Tidak ada data grid di dekat titik ini pada tampilan saat ini.</div>`;

  SEARCH_MARKER = L.circleMarker([lat, lon], {
    radius: 9,
    color: "#FFB454",
    weight: 2,
    fillColor: "#FF7A33",
    fillOpacity: .55,
    className: "coord-search-marker"
  }).addTo(LEAFLET_MAP).bindPopup(popupHtml).openPopup();

  LEAFLET_MAP.flyTo([lat, lon], Math.max(LEAFLET_MAP.getZoom(), 9), { duration: .8 });
}

function runCoordSearch() {
  const form = document.getElementById("coord-search");
  const input = document.getElementById("coord-search-input");
  if (!form || !input) return;
  form.classList.remove("invalid");

  const coord = parseCoordInput(input.value);
  if (coord) {
    closeSuggest();
    jumpToPoint(coord.lat, coord.lon);
    return;
  }

  // bukan format koordinat -- coba cocokkan ke nama kota/kabupaten
  const matches = searchCities(input.value, 1);
  const q = normalizeSearchText(input.value);
  const exact = matches.find(m => normalizeSearchText(m.name).replace(/^kab\. |^kota /, "") === q || normalizeSearchText(m.name) === q);
  const best = exact || (matches.length === 1 ? matches[0] : null);
  if (best) {
    input.value = best.name;
    closeSuggest();
    jumpToPoint(best.lat, best.lon, null, best.name);
    return;
  }

  void form.offsetWidth;
  form.classList.add("invalid");
}

function getTopSiagaPoints(n) {
  const points = CURRENT_DATA?.ews?.map_points || [];
  return [...points]
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, n);
}

const COORD_SUGGEST_COUNT_MOBILE = 20;
const COORD_SUGGEST_COUNT_DESKTOP = 60;

function getCoordSuggestCount() {
  return window.innerWidth > 700 ? COORD_SUGGEST_COUNT_DESKTOP : COORD_SUGGEST_COUNT_MOBILE;
}

function renderCoordSuggestions() {
  const box = document.getElementById("coord-suggest");
  if (!box) return;
  const topN = getTopSiagaPoints(getCoordSuggestCount());
  if (!topN.length) {
    box.innerHTML = "";
    return;
  }
  const items = topN.map((p, i) => `
    <button type="button" class="coord-suggest-item" data-lat="${p.lat}" data-lon="${p.lon}">
      <span class="rank">${i + 1}</span>
      <span class="info">
        <span class="coord">${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}</span>
        <span class="region">${p.region || "-"}</span>
      </span>
      <span class="risk">${Math.round((p.risk_score || 0) * 100)}%</span>
    </button>
  `).join("");
  box.innerHTML = `<div class="coord-suggest-label">${topN.length} titik paling SIAGA saat ini</div>${items}`;
  box.querySelectorAll(".coord-suggest-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      const input = document.getElementById("coord-search-input");
      if (input) input.value = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      closeSuggest();
      const point = topN.find(p => p.lat === lat && p.lon === lon);
      jumpToPoint(lat, lon, point);
    });
  });
}

function renderCitySuggestions(matches, query) {
  const box = document.getElementById("coord-suggest");
  if (!box) return;
  if (!matches.length) {
    box.innerHTML = `<div class="coord-suggest-label">Tidak ada kota/kabupaten cocok dengan "${query}"</div>`;
    return;
  }
  const items = matches.map(m => `
    <button type="button" class="coord-suggest-item" data-lat="${m.lat}" data-lon="${m.lon}" data-name="${m.name}">
      <span class="info">
        <span class="coord" style="font-family:inherit;">${m.name}</span>
        <span class="region">${m.lat.toFixed(2)}, ${m.lon.toFixed(2)}</span>
      </span>
    </button>
  `).join("");
  box.innerHTML = `<div class="coord-suggest-label">Kota/kabupaten cocok</div>${items}`;
  box.querySelectorAll(".coord-suggest-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      const name = btn.dataset.name;
      const input = document.getElementById("coord-search-input");
      if (input) input.value = name;
      closeSuggest();
      jumpToPoint(lat, lon, null, name);
    });
  });
}

function adjustSuggestMaxHeight() {
  const box = document.getElementById("coord-suggest");
  if (!box || !box.classList.contains("open")) return;

  if (window.innerWidth <= 700) {
    box.style.maxHeight = "";
    return;
  }
  const legend = document.getElementById("map-legend");
  const boxTop = box.getBoundingClientRect().top;
  const GAP_BOTTOM = 16; // jarak aman ke legend / tepi layar
  const limit = legend
    ? legend.getBoundingClientRect().top
    : window.innerHeight;
  const maxH = Math.max(120, Math.round(limit - boxTop - GAP_BOTTOM));
  box.style.maxHeight = maxH + "px";
}

function openSuggest() {
  const box = document.getElementById("coord-suggest");
  if (!box) return;
  renderCoordSuggestions();
  box.classList.add("open");
  requestAnimationFrame(adjustSuggestMaxHeight);
}

function closeSuggest() {
  const box = document.getElementById("coord-suggest");
  box?.classList.remove("open");
  if (box) box.style.maxHeight = "";
}

if (!window.__suggestResizeBound) {
  window.__suggestResizeBound = true;
  window.addEventListener("resize", adjustSuggestMaxHeight);
}

(function initCoordSearch() {
  const wrap = document.getElementById("coord-search-overlay");
  const form = document.getElementById("coord-search");
  const input = document.getElementById("coord-search-input");
  if (!wrap || !form || !input) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCoordSearch();
  });
  input.addEventListener("input", () => {
    form.classList.remove("invalid");
    const val = input.value.trim();
    const box = document.getElementById("coord-suggest");
    if (!val) {
      openSuggest(); // kosong -> balik ke daftar titik paling SIAGA (perilaku lama)
      return;
    }
    if (parseCoordInput(val)) {
      closeSuggest(); // lagi ngetik koordinat valid, nggak perlu saran kota
      return;
    }
    const matches = searchCities(val, getCoordSuggestCount());
    renderCitySuggestions(matches, val);
    box?.classList.add("open");
    requestAnimationFrame(adjustSuggestMaxHeight);
  });
  input.addEventListener("focus", () => {
    if (!input.value.trim()) openSuggest();
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeSuggest();
  });
})();

// nav link header (desktop)
const navAnchors = document.querySelectorAll(".nav-links a");

const hrefToSection = new Map;

navAnchors.forEach(a => {
  const href = a.getAttribute("href");
  if (!hrefToSection.has(href)) hrefToSection.set(href, document.querySelector(href));
});

const hrefs = [ ...hrefToSection.keys() ];

const HEADER_OFFSET = 100; 

navAnchors.forEach(a => {
  a.addEventListener("click", (e) => {
    const href = a.getAttribute("href");
    const target = hrefToSection.get(href);
    if (!target) return; 
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  });
});

window.addEventListener("scroll", () => {
  let activeHref = hrefs[0];
  hrefs.forEach(href => {
    const s = hrefToSection.get(href);
    if (s && s.getBoundingClientRect().top < 120) activeHref = href;
  });
  navAnchors.forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === activeHref);
  });
}, {
  passive: true
});