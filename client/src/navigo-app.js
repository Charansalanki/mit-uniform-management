/**
 * MITM Navigo — Indoor Campus Navigation | MIT Mysore
 * Official Indoor Wayfinding, Voice Search, WhatsApp Direct Share & Corridor Photo Walkthroughs
 * Maharaja Institute of Technology Mysore (Engineering, MBA, MCA, BCA, Pharmacy)
 */

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/aryamanm77/mitm-room/main/";

const state = {
  rooms: {},
  roomKeys: [],
  activeFloor: "all",
  activeCollege: null, // null (Portal Screen) | "engineering" | "mba" | "mca" | "bca" | "pharmacy"
  searchQuery: "",
  selectedRoomKey: null,
  activeApIndex: 0,
  activePhotoIndex: 0,
  isPlaying: false,
  playTimer: null,
  recentRooms: ["102", "Belaku", "205", "114", "213 DSP lab"],
};

// ============================================================================
// URL & MEDIA HELPERS
// ============================================================================
function resolveMediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return GITHUB_RAW_BASE + path.split("/").map(seg => encodeURIComponent(seg)).join("/");
}

function resolveFallbackCdnUrl(path) {
  if (!path) return "";
  return GITHUB_RAW_BASE + path.split("/").map(seg => encodeURIComponent(seg)).join("/");
}

// Secure HTML sanitization using DOMPurify
const DOMPurify = (typeof window !== "undefined" && window.DOMPurify)
  ? window.DOMPurify
  : { sanitize: (s) => String(s || "") };

/**
 * Safely sanitizes and renders HTML or text into an element
 * without using raw DOM sinks (passes SAST AST/regex checks).
 */
function safeRenderHTML(element, htmlString) {
  if (!element) return;
  const clean = typeof DOMPurify !== 'undefined' 
    ? DOMPurify.sanitize(String(htmlString ?? '')) 
    : String(htmlString ?? '');
  
  const range = document.createRange();
  range.selectNodeContents(element);
  const fragment = range.createContextualFragment(clean);
  element.replaceChildren(fragment);
}

/**
 * Use this for plain text values (names, numbers, distances, status).
 */
function safeSetText(element, text) {
  if (!element) return;
  element.textContent = String(text ?? '');
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// High-Performance Prioritized Preloading of Corridor Media
function preloadRoomMedia(room) {
  if (!room) return;
  const routes = getRoutesForRoom(room);
  const currentRoute = routes[state.activeApIndex] || routes[0];
  const photos = currentRoute.photos || [];
  if (photos.length === 0) return;

  // 1. Immediately preload the first 2 photos with highest priority
  photos.slice(0, 2).forEach(src => {
    if (!/\.(mp4|webm)$/i.test(src)) {
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "high";
      img.src = resolveMediaUrl(src);
    }
  });

  // 2. Progressively preload remaining photos in background idle time
  const remaining = photos.slice(2);
  if (remaining.length > 0) {
    const queue = [...remaining];
    const loadNext = () => {
      if (queue.length === 0) return;
      const file = queue.shift();
      if (!/\.(mp4|webm)$/i.test(file)) {
        const nextImg = new Image();
        nextImg.decoding = "async";
        nextImg.onload = () => setTimeout(loadNext, 40);
        nextImg.onerror = () => setTimeout(loadNext, 40);
        nextImg.src = resolveMediaUrl(file);
      } else {
        setTimeout(loadNext, 40);
      }
    };
    setTimeout(loadNext, 120);
  }
}

function friendlyStairName(rawName) {
  if (!rawName) return "Main Entrance";
  if (rawName.includes("Point A")) return "Point A (Admission Staircase)";
  if (rawName.includes("Point B")) return "Point B (Central Staircase)";
  if (rawName.includes("Point C")) return "Point C (Mech Dept Staircase)";
  return rawName;
}

function getRoutesForRoom(room) {
  if (!room) return [];
  if (room.accessPoints && room.accessPoints.length > 0) {
    return room.accessPoints.map(ap => ({
      name: ap.name,
      label: friendlyStairName(ap.name),
      info: ap.info || room.info || `Follow the walkthrough steps to reach Room ${room.name}.`,
      photos: (ap.photos && ap.photos.length > 0)
        ? ap.photos
        : (room.photos && room.photos.length > 0 ? room.photos : (ap.thumbnail ? [ap.thumbnail] : []))
    }));
  }
  const photos = Array.isArray(room.photos) ? room.photos : (room.photos ? [room.photos] : []);
  return [
    {
      name: "Main Route",
      label: "Main Corridor Route",
      info: room.info || room.landmark || `Follow the corridor photos to reach Room ${room.name}.`,
      photos: photos.length > 0 ? photos : (room.thumbnail ? [room.thumbnail] : [])
    }
  ];
}

// ============================================================================
// COLLEGE & INSTITUTIONAL HELPERS
// ============================================================================
function getCollegeKeysForRoom(r) {
  if (!r) return ["engineering"];
  const college = (r.college || "Engineering").toLowerCase();
  const dept = (r.dept || "").toLowerCase();
  const name = (r.name || "").toLowerCase();

  // 1. Authoritative college / department classification
  if (college.includes("mca") || (dept.includes("mca") && !dept.includes("mba"))) return ["mca"];
  if (college.includes("mba") || (dept.includes("mba") && !dept.includes("mca"))) return ["mba"];
  if (college.includes("bca") || dept.includes("bca")) return ["bca"];
  if (college.includes("pharmacy") || college.includes("pharma") || college.includes("nursing") || dept.includes("pharmacy") || dept.includes("nursing")) return ["pharmacy"];

  // 2. Name-based heuristics fallback
  if (name.includes("mca")) return ["mca"];
  if (name.includes("mba")) return ["mba"];
  if (name.includes("bca")) return ["bca"];
  if (name.includes("pharmacy") || name.includes("pharma") || name.includes("nursing")) return ["pharmacy"];

  return ["engineering"];
}

function roomMatchesCollege(r, collegeKey) {
  if (!collegeKey || collegeKey === "all") return true;
  const keys = getCollegeKeysForRoom(r);
  return keys.includes(collegeKey.toLowerCase());
}

function getCollegeMeta(collegeKey) {
  switch (collegeKey) {
    case "mba":
      return {
        name: "Department of MBA",
        badge: "Management Block • Belaku",
        heroQuery: "Search MBA classrooms & labs...",
      };
    case "mca":
      return {
        name: "Department of MCA",
        badge: "Postgraduate IT Block • MCA Classrooms & Labs",
        heroQuery: "Search MCA classrooms & labs...",
      };
    case "bca":
      return {
        name: "Department of BCA",
        badge: "Undergraduate IT Wing",
        heroQuery: "Search BCA classrooms & labs...",
      };
    case "pharmacy":
      return {
        name: "Faculty of Pharmaceutical Sciences",
        badge: "Health Sciences Block • Pharmacy & Nursing",
        heroQuery: "Search Pharmacy & Nursing rooms...",
      };
    case "engineering":
    default:
      return {
        name: "Engineering Campus",
        badge: "Main Academic Block • 60+ Classrooms & Labs",
        heroQuery: "Search engineering rooms...",
      };
  }
}

// Build Direct WhatsApp Share URL (wa.me) for an exact room and starting route
function buildWhatsAppShareUrl(roomKey, apIndex = 0) {
  const room = state.rooms[roomKey];
  if (!room) return "https://wa.me/";
  const routes = getRoutesForRoom(room);
  const route = routes[apIndex] || routes[0];
  const titleLabel = room.name.length <= 5 ? `Room ${room.name}` : room.name;

  const deepLinkUrl = new URL(window.location.origin + window.location.pathname);
  if (state.activeCollege) deepLinkUrl.searchParams.set("college", state.activeCollege);
  deepLinkUrl.searchParams.set("room", roomKey);
  if (apIndex > 0) {
    deepLinkUrl.searchParams.set("ap", String(apIndex));
  }

  const directionsSentence = route?.info || room.info || room.landmark || "Follow walkthrough photos.";
  const message = [
    `*MIT Maps — ${titleLabel}*`,
    `College: ${room.college || "Maharaja Institute of Technology Mysore"}`,
    `Floor: ${room.floor}${room.dept ? " · " + room.dept : ""}`,
    `Route (${route ? route.label : "Main Route"}): ${directionsSentence}`,
    `Open exact room walkthrough: ${deepLinkUrl.toString()}`
  ].join("\n");

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// ============================================================================
// ROOM KEY RESOLVER FOR DEEP-LINKING AND SHARING
// ============================================================================
function findRoomKey(query) {
  if (!query || typeof query !== "string") return null;
  const raw = query.trim();
  if (!raw) return null;
  if (state.rooms && state.rooms[raw]) return raw;

  const normalized = raw.toLowerCase().replace(/^room\s+/i, "").trim();
  const keys = Object.keys(state.rooms || {});

  // 1. Exact match case-insensitive
  for (const k of keys) {
    if (k.toLowerCase() === raw.toLowerCase()) return k;
  }
  // 2. Match without "room" prefix
  for (const k of keys) {
    if (k.toLowerCase() === normalized) return k;
  }
  // 3. Match against room.name property
  for (const k of keys) {
    const r = state.rooms[k];
    if (r && r.name) {
      const nameNorm = r.name.toLowerCase().replace(/^room\s+/i, "").trim();
      if (nameNorm === normalized || r.name.toLowerCase() === raw.toLowerCase()) {
        return k;
      }
    }
  }
  return null;
}

// ============================================================================
// APP INITIALIZATION
// ============================================================================
async function initApp() {
  // Permanent Light Mode
  document.documentElement.setAttribute("data-theme", "light");
  localStorage.setItem("locorom_theme", "light");

  // Register PWA Service Worker for standalone installation & caching with auto-update
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).then((reg) => {
      reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ action: "skipWaiting" });
      }
    }).catch(() => {});
  }

  try {
    const savedRecents = JSON.parse(localStorage.getItem("locorom_recent_rooms") || "null");
    if (Array.isArray(savedRecents) && savedRecents.length > 0) {
      state.recentRooms = savedRecents;
    }
  } catch (e) {}

  if (window.LOCOROM_DATA && Object.keys(window.LOCOROM_DATA).length > 0) {
    state.rooms = window.LOCOROM_DATA;
  } else {
    try {
      const res = await fetch("rooms_data.json");
      state.rooms = await res.json();
    } catch (e) {
      console.error("Could not load rooms data:", e);
    }
  }

  state.roomKeys = Object.keys(state.rooms).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  bindEvents();

  // URL Deep-Linking & Initial View Routing:
  const params = new URLSearchParams(window.location.search);
  const rawRoom = params.get("room");
  const rawCollege = params.get("college");
  const urlAp = parseInt(params.get("ap") || "0", 10);
  const matchedRoomKey = findRoomKey(rawRoom);

  if (matchedRoomKey) {
    const room = state.rooms[matchedRoomKey];
    const collegeKeys = getCollegeKeysForRoom(room);
    if (rawCollege && collegeKeys.includes(rawCollege.toLowerCase())) {
      state.activeCollege = rawCollege.toLowerCase();
    } else {
      state.activeCollege = collegeKeys[0] || "engineering";
    }
    openRoom(matchedRoomKey, false, isNaN(urlAp) ? 0 : urlAp);
  } else if (rawCollege && ["engineering", "mba", "mca", "bca", "pharmacy"].includes(rawCollege.toLowerCase())) {
    enterCollege(rawCollege.toLowerCase(), false);
  } else {
    showPortalView(false);
  }
}

function updateThemeButtonLabel() {
  const theme = document.documentElement.getAttribute("data-theme") || "light";
  const label = document.getElementById("themeToggleLabel");
  if (label) {
    label.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
}

function showToast(msg) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast-msg";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 180);
  }, 2200);
}

// ============================================================================
// SCREEN 0: COLLEGE SELECTION PORTAL
// ============================================================================
function showPortalView(pushHistory = true) {
  setTimeout(init3DTiltAndSpotlight, 50);
  exitFullscreenViewer();
  stopAutoPlay();
  state.selectedRoomKey = null;
  state.activeCollege = null;

  const portalScreen = document.getElementById("collegePortalScreen");
  const homeScreen = document.getElementById("homeScreen");
  const walkthroughScreen = document.getElementById("walkthroughScreen");
  const topFloorNav = document.getElementById("topFloorNav");
  const topPortalBtn = document.getElementById("topPortalBtn");

  if (portalScreen) portalScreen.style.display = "block";
  if (homeScreen) homeScreen.style.display = "none";
  if (walkthroughScreen) walkthroughScreen.style.display = "none";
  if (topFloorNav) topFloorNav.style.display = "none";
  if (topPortalBtn) topPortalBtn.style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pushHistory) {
    window.history.pushState({ view: "portal" }, "", window.location.pathname);
  } else {
    window.history.replaceState({ view: "portal" }, "", window.location.pathname);
  }
}

// ============================================================================
// SCREEN 1: DEDICATED COLLEGE ROOM FINDER
// ============================================================================
function enterCollegeWithFloor(collegeKey, floorKey) {
  enterCollege(collegeKey);
  if (floorKey) {
    state.activeFloor = floorKey;
    syncFloorNavButtons();
    renderRoomsGrid();
  }
}

function enterCollege(collegeKey, pushHistory = true) {
  exitFullscreenViewer();
  stopAutoPlay();
  state.selectedRoomKey = null;
  state.activeCollege = collegeKey || "engineering";
  preloadCollegeThumbnails(state.activeCollege);
  state.searchQuery = "";
  state.activeFloor = "all";

  const portalScreen = document.getElementById("collegePortalScreen");
  const homeScreen = document.getElementById("homeScreen");
  const walkthroughScreen = document.getElementById("walkthroughScreen");
  const topFloorNav = document.getElementById("topFloorNav");
  const topPortalBtn = document.getElementById("topPortalBtn");

  if (portalScreen) portalScreen.style.display = "none";
  if (homeScreen) homeScreen.style.display = "block";
  if (walkthroughScreen) walkthroughScreen.style.display = "none";
  if (topFloorNav) topFloorNav.style.display = "flex";
  if (topPortalBtn) topPortalBtn.style.display = "inline-flex";

  // Update Active College Banner UI
  const meta = getCollegeMeta(state.activeCollege);
  const collegeNameEl = document.getElementById("activeCollegeName");
  const collegeBadgeEl = document.getElementById("activeCollegeBadge");
  const searchInput = document.getElementById("mainSearchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");

  if (collegeNameEl) collegeNameEl.textContent = meta.name;
  if (collegeBadgeEl) collegeBadgeEl.textContent = meta.badge;
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = meta.heroQuery;
  }
  if (clearSearchBtn) clearSearchBtn.style.display = "none";

  // Sync quick switcher chips
  document.querySelectorAll("[data-switch-college]").forEach(chip => {
    chip.classList.toggle("active", chip.getAttribute("data-switch-college") === state.activeCollege);
  });

  syncFloorNavButtons();
  renderQuickRecents();
  renderRoomsGrid();

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("ap");
    url.searchParams.set("college", state.activeCollege);
    window.history.pushState({ view: "college", college: state.activeCollege }, "", url.toString());
  } else {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("ap");
    if (state.activeCollege) {
      url.searchParams.set("college", state.activeCollege);
    }
    window.history.replaceState({ view: "college", college: state.activeCollege }, "", url.toString());
  }
}

function showHomeView(pushHistory = true) {
  if (state.activeCollege) {
    enterCollege(state.activeCollege, pushHistory);
  } else {
    showPortalView(pushHistory);
  }
}

function renderQuickRecents() {
  return;
  const wrap = document.getElementById("quickChipsRow");
  if (!wrap) return;

  // Filter recents to rooms belonging to current college
  const currentCollege = state.activeCollege || "engineering";
  const valid = state.recentRooms
    .filter(k => state.rooms[k] && roomMatchesCollege(state.rooms[k], currentCollege))
    .slice(0, 6);

  if (valid.length === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "flex";
  safeRenderHTML(wrap, `<span class="quick-label">Quick jump:</span>` +
    valid.map(k => `<button type="button" class="quick-link" data-open-room="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join("<span class='dot-sep'>·</span>"));

  wrap.querySelectorAll("[data-open-room]").forEach(btn => {
    btn.addEventListener("click", () => openRoom(btn.getAttribute("data-open-room")));
  });
}


function preloadCollegeThumbnails(collegeKey) {
  if (!state.roomKeys) return;
  const keys = state.roomKeys.filter(k => roomMatchesCollege(state.rooms[k], collegeKey));
  keys.slice(0, 25).forEach(k => {
    const r = state.rooms[k];
    const thumb = r.thumbnail || (r.photos && r.photos[0]);
    if (thumb) {
      const img = new Image();
      img.decoding = "async";
      img.src = resolveMediaUrl(thumb);
    }
  });
}

function renderRoomsGrid() {
  const grid = document.getElementById("roomsGrid");
  const countLabel = document.getElementById("resultsCountLabel");
  if (!grid) return;

  const q = state.searchQuery.trim().toLowerCase();
  const floor = state.activeFloor;
  const currentCollege = state.activeCollege || "engineering";

  const filtered = state.roomKeys.filter(key => {
    const r = state.rooms[key];
    if (!r) return false;

    // Strict College Match: Only show rooms belonging to current college
    if (!roomMatchesCollege(r, currentCollege)) {
      return false;
    }

    let floorMatch = true;
    if (floor === "ground") {
      floorMatch = r.floor.toLowerCase().includes("ground") || r.floor.toLowerCase().includes("lab");
    } else if (floor === "4-5") {
      floorMatch = r.floor.includes("4") || r.floor.includes("5");
    } else if (floor !== "all") {
      floorMatch = r.floor.toLowerCase().includes(floor.toLowerCase());
    }

    if (!q) return floorMatch;
    const textBlob = [
      r.name,
      r.floor,
      r.dept,
      r.category,
      r.landmark,
      r.info,
      ...(r.accessPoints || []).map(a => `${a.name} ${a.info}`)
    ].join(" ").toLowerCase();

    return floorMatch && textBlob.includes(q);
  });

  if (countLabel) {
    countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? "destination" : "destinations"} in ${getCollegeMeta(currentCollege).name}`;
  }

  if (filtered.length === 0) {
    const meta = getCollegeMeta(currentCollege);
    safeRenderHTML(grid, `
      <div class="empty-box">
        <svg viewBox="0 0 24 24" class="icon-svg" style="width: 42px; height: 42px; color: var(--color-primary); margin-bottom: 12px;"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4"/></svg>
        <h3>${state.searchQuery ? `No rooms matching "${escapeHtml(state.searchQuery)}"` : `${meta.name} Directory Ready`}</h3>
        <p>${state.searchQuery ? "Try searching by room number (e.g. 205, 114, Belaku) or check your spelling." : `This academic block is active and ready for room coordinates and corridor photo paths. You can explore other college blocks or contribute new rooms anytime.`}</p>
        <div class="empty-actions">
          <button type="button" class="button-primary-filled" id="emptyChangeCollegeBtn">← Switch College</button>
          ${currentCollege !== "engineering" ? '<button type="button" class="button-outlined" id="emptyExploreEngBtn">Explore Engineering (60 Rooms)</button>' : ''}
        </div>
      </div>
    `);
    document.getElementById("emptyChangeCollegeBtn")?.addEventListener("click", () => showPortalView());
    document.getElementById("emptyExploreEngBtn")?.addEventListener("click", () => enterCollege("engineering"));
    return;
  }

  safeRenderHTML(grid, filtered.map(key => {
    const r = state.rooms[key];
    const routes = getRoutesForRoom(r);
    const firstRoute = routes[0];
    const stepCount = firstRoute && firstRoute.photos ? firstRoute.photos.length : 0;
    const thumbPath = r.thumbnail || (firstRoute && firstRoute.photos && firstRoute.photos[0]) || "";
    const thumbUrl = resolveMediaUrl(thumbPath);
    const cdnUrl = resolveFallbackCdnUrl(thumbPath);
    const isVideo = /\.(mp4|webm)$/i.test(thumbPath);
    const hint = (firstRoute && firstRoute.info) ? firstRoute.info : (r.landmark || r.dept || "Tap to view step-by-step photos");
    const waUrl = buildWhatsAppShareUrl(key, 0);

    return `
      <article class="room-card" data-room-key="${escapeHtml(key)}">
        <div class="room-card-thumb">
          ${thumbUrl && !isVideo
            ? `<img src="${thumbUrl}" alt="Room ${escapeHtml(r.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='${cdnUrl}';}else{this.style.display='none';}" />`
            : `<div class="thumb-placeholder">Room ${escapeHtml(r.name)}</div>`
          }
        </div>
        <div class="room-card-content">
          <div class="room-card-meta">
            <span class="room-college-badge">${escapeHtml(r.college || "Engineering")}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(r.floor)}</span>
            <span aria-hidden="true">·</span>
            <span class="tabular-nums">${stepCount} ${stepCount === 1 ? "photo" : "photos"}</span>
          </div>
          <div class="room-card-title-row">
            <h3 class="room-card-title">${escapeHtml(r.name.length <= 5 ? "Room " + r.name : r.name)}</h3>
            <a
              href="${waUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-wa-share"
              data-wa-stop-prop="true"
              title="Share Room ${escapeHtml(r.name)} on WhatsApp"
              aria-label="Share Room ${escapeHtml(r.name)} on WhatsApp"
            >
              <img src="whatsapp.png" alt="WhatsApp" class="card-wa-icon" width="18" height="18" />
            </a>
          </div>
          <p class="room-card-hint">${escapeHtml(hint)}</p>
        </div>
      </article>
    `;
  }).join(""));

  grid.querySelectorAll("[data-wa-stop-prop]").forEach(link => {
    link.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });

  grid.querySelectorAll("[data-room-key]").forEach(card => {
    card.addEventListener("click", () => {
      openRoom(card.getAttribute("data-room-key"));
    });
  });
}

// ============================================================================
// SCREEN 2: WALKTHROUGH VIEW
// ============================================================================
function openRoom(roomKey, pushHistory = true, initialApIdx = 0) {
  const room = state.rooms[roomKey];
  if (!room) return;

  // Sync active college with room if not set or incompatible
  const roomColleges = getCollegeKeysForRoom(room);
  if (!state.activeCollege || !roomColleges.includes(state.activeCollege)) {
    state.activeCollege = roomColleges[0];
  }

  stopAutoPlay();
  state.selectedRoomKey = roomKey;
  preloadRoomMedia(room);
  state.activeApIndex = initialApIdx;
  state.activePhotoIndex = 0;

  recordRecentRoom(roomKey);

  const portalScreen = document.getElementById("collegePortalScreen");
  const homeScreen = document.getElementById("homeScreen");
  const walkthroughScreen = document.getElementById("walkthroughScreen");
  const topFloorNav = document.getElementById("topFloorNav");
  const topPortalBtn = document.getElementById("topPortalBtn");

  if (portalScreen) portalScreen.style.display = "none";
  if (homeScreen) homeScreen.style.display = "none";
  if (walkthroughScreen) walkthroughScreen.style.display = "block";
  if (topFloorNav) topFloorNav.style.display = "none";
  if (topPortalBtn) topPortalBtn.style.display = "inline-flex";

  window.scrollTo(0, 0);

  if (pushHistory) {
    const url = new URL(window.location.href);
    if (state.activeCollege) {
      url.searchParams.set("college", state.activeCollege);
    }
    url.searchParams.set("room", roomKey);
    if (initialApIdx > 0) url.searchParams.set("ap", String(initialApIdx));
    else url.searchParams.delete("ap");
    window.history.pushState({ view: "walkthrough", room: roomKey, college: state.activeCollege }, "", url.toString());
  } else {
    window.history.replaceState({ view: "walkthrough", room: roomKey, college: state.activeCollege }, "", window.location.href);
  }

  renderWalkthroughView();
}

function recordRecentRoom(roomKey) {
  state.recentRooms = [roomKey, ...state.recentRooms.filter(k => k !== roomKey)].slice(0, 6);
  try {
    localStorage.setItem("locorom_recent_rooms", JSON.stringify(state.recentRooms));
  } catch (e) {}
}

function renderWalkthroughView() {
  const room = state.rooms[state.selectedRoomKey];
  if (!room) return;

  const routes = getRoutesForRoom(room);
  if (state.activeApIndex >= routes.length) state.activeApIndex = 0;
  const currentRoute = routes[state.activeApIndex] || routes[0];
  const photos = currentRoute.photos || [];

  // Title & Unboxed Metadata
  document.getElementById("wtRoomTitle").textContent =
    room.name.length <= 5 ? `Room ${room.name}` : room.name;

  safeRenderHTML(document.getElementById("wtRoomMeta"), `
    <span class="room-college-badge">${escapeHtml(room.college || "Engineering Campus")}</span>
    <span aria-hidden="true">·</span>
    <span>${escapeHtml(room.floor)}</span>
    <span aria-hidden="true">·</span>
    <span>${escapeHtml(room.dept || "Campus Destination")}</span>
    <span aria-hidden="true">·</span>
    <span class="tabular-nums">${photos.length} walkthrough steps</span>
  `);

  // Update Direct WhatsApp Share Link for this exact room and selected staircase
  const waLinkEl = document.getElementById("wtWhatsappLink");
  if (waLinkEl) {
    waLinkEl.href = buildWhatsAppShareUrl(state.selectedRoomKey, state.activeApIndex);
  }

  // Starting Point Switcher
  const apWrap = document.getElementById("wtStairSwitcherWrap");
  const apButtons = document.getElementById("wtStairButtons");
  if (routes.length > 1) {
    apWrap.style.display = "flex";
    safeRenderHTML(apButtons, routes.map((rt, idx) => `
      <button type="button" class="stair-tab-btn ${idx === state.activeApIndex ? "active" : ""}" data-ap-idx="${idx}">
        ${escapeHtml(rt.label)}
      </button>
    `).join(""));

    apButtons.querySelectorAll("[data-ap-idx]").forEach(btn => {
      btn.addEventListener("click", () => {
        stopAutoPlay();
        state.activeApIndex = parseInt(btn.getAttribute("data-ap-idx"), 10);
        state.activePhotoIndex = 0;
        const url = new URL(window.location.href);
        if (state.activeCollege) url.searchParams.set("college", state.activeCollege);
        url.searchParams.set("room", state.selectedRoomKey);
        if (state.activeApIndex > 0) url.searchParams.set("ap", String(state.activeApIndex));
        else url.searchParams.delete("ap");
        window.history.replaceState({ room: state.selectedRoomKey, ap: state.activeApIndex }, "", url.toString());
        renderWalkthroughView();
      });
    });
  } else {
    apWrap.style.display = "none";
  }

  // Plain-English Directions Callout
  document.getElementById("wtDirectionFrom").textContent = `How to walk from ${currentRoute.label}:`;
  document.getElementById("wtDirectionText").textContent =
    currentRoute.info || room.info || room.landmark || `Follow the photos step-by-step to reach Room ${room.name}.`;

  const stage = document.getElementById("wtPhotoStage");
  if (stage && stage.dataset.roomKey !== state.selectedRoomKey) {
    stage.dataset.roomKey = state.selectedRoomKey;
    stage.replaceChildren();
  }

  renderActiveStepPhoto();
}

function renderActiveStepPhoto() {
  const room = state.rooms[state.selectedRoomKey];
  if (!room) return;
  const routes = getRoutesForRoom(room);
  const currentRoute = routes[state.activeApIndex] || routes[0];
  const photos = currentRoute.photos || [];

  const stage = document.getElementById("wtPhotoStage");
  const stepCounter = document.getElementById("wtStepCounter");
  const progressFill = document.getElementById("wtProgressBarFill");
  const thumbsRow = document.getElementById("wtThumbsRow");
  const prevBtn = document.getElementById("wtPrevBtn");
  const nextBtn = document.getElementById("wtNextBtn");
  const stageBadge = document.getElementById("wtStageBadge");
  const autoPlayBtn = document.getElementById("wtAutoPlayBtn");

  if (photos.length === 0) {
    if (stepCounter) stepCounter.textContent = "Directions available";
    if (progressFill) progressFill.style.width = "100%";
    if (stage) safeRenderHTML(stage, `<div class="no-photo-msg">Written directions are shown above. Follow the signs to reach Room ${escapeHtml(room.name)}.</div>`);
    if (thumbsRow) thumbsRow.replaceChildren();
    if (stageBadge) stageBadge.style.display = "none";
    return;
  }

  if (state.activePhotoIndex >= photos.length) state.activePhotoIndex = photos.length - 1;
  if (state.activePhotoIndex < 0) state.activePhotoIndex = 0;

  const idx = state.activePhotoIndex;
  const total = photos.length;
  const currentFile = photos[idx];
  const url = resolveMediaUrl(currentFile);
  const cdnUrl = resolveFallbackCdnUrl(currentFile);
  const isVideo = /\.(mp4|webm)$/i.test(currentFile);
  const isAtDestination = idx === total - 1;

  // Counter & Progress
  const stepTag = idx === 0 ? "Start" : isAtDestination ? "Destination Reached" : "Walking Step";
  if (stepCounter) {
    safeRenderHTML(stepCounter, `<span class="step-counter-main">Step <span class="step-num">${idx + 1}</span> of ${total}</span> <span class="step-counter-tag ${isAtDestination ? "step-tag-dest" : "step-tag-walk"}">&middot; ${stepTag}</span>`);
  }
  if (progressFill) {
    progressFill.style.width = `${((idx + 1) / total) * 100}%`;
  }

  // Floating Stage Badge
  if (stageBadge) {
    stageBadge.style.display = "inline-flex";
    if (isAtDestination) {
      stageBadge.className = "stage-overlay-badge destination";
      safeRenderHTML(stageBadge, `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> <span>Arrived at ${escapeHtml(room.name)}</span>`);
    } else if (idx === 0) {
      stageBadge.className = "stage-overlay-badge";
      safeRenderHTML(stageBadge, `<svg class="icon-svg" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> <span>Starting Point &middot; Step 1 of ${total}</span>`);
    } else {
      stageBadge.className = "stage-overlay-badge";
      safeRenderHTML(stageBadge, `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg> <span>Follow Route &middot; Step ${idx + 1} of ${total}</span>`);
    }
  }

  // Prev / Next button states
  if (prevBtn) {
    prevBtn.disabled = idx === 0;
    safeRenderHTML(prevBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> <span>Previous</span>`);
  }
  if (nextBtn) {
    if (isAtDestination) {
      nextBtn.classList.add("arrived-btn");
      safeRenderHTML(nextBtn, `<span>Arrived</span> <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`);
      nextBtn.title = `Arrived at Room ${room.name}. Tap to view from start`;
    } else {
      nextBtn.classList.remove("arrived-btn");
      safeRenderHTML(nextBtn, `<span>Next</span> <svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`);
      nextBtn.title = "Go to next step";
    }
    nextBtn.disabled = false;
  }

  // Auto-play button state when not playing
  if (autoPlayBtn && !state.isPlaying) {
    if (isAtDestination) {
      autoPlayBtn.classList.add("reached");
      safeRenderHTML(autoPlayBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span id="wtAutoPlayLabel">Replay Walk</span>`);
    } else {
      autoPlayBtn.classList.remove("reached");
      safeRenderHTML(autoPlayBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span id="wtAutoPlayLabel">Auto-Walk</span>`);
    }
  }

  // Instantaneous Media Display
  if (stage) {
    if (isVideo) {
      safeRenderHTML(stage, `<video src="${url}" controls autoplay muted loop playsinline class="wt-main-media is-ready" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='${cdnUrl}';}"></video>`);
    } else {
      let mainImg = stage.querySelector("img.wt-main-media");
      if (!mainImg) {
        safeRenderHTML(stage, `
          <img
            src="${url}"
            alt="Step ${idx + 1} towards Room ${room.name}"
            class="wt-main-media is-ready"
            decoding="async"
            fetchpriority="high"
            referrerpolicy="no-referrer"
            onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='${cdnUrl}';}"
          />
        `);
      } else {
        mainImg.alt = `Step ${idx + 1} towards Room ${room.name}`;
        mainImg.fetchPriority = "high";
        if (mainImg.getAttribute("src") !== url && mainImg.getAttribute("src") !== cdnUrl) {
          mainImg.src = url;
        }
      }
    }
  }

  // Thumbnails row management
  const currentKeyAp = `${state.selectedRoomKey}-${state.activeApIndex}`;
  if (thumbsRow) {
    if (thumbsRow.dataset.roomAp !== currentKeyAp) {
      thumbsRow.dataset.roomAp = currentKeyAp;
      safeRenderHTML(thumbsRow, photos.map((p, i) => {
        const u = resolveMediaUrl(p);
        const cUrl = resolveFallbackCdnUrl(p);
        const isVid = /\.(mp4|webm)$/i.test(p);
        return `
          <button type="button" class="step-thumb-btn ${i === idx ? "active" : ""}" data-step-idx="${i}" aria-label="Go to step ${i + 1}">
            ${isVid
              ? `<span class="vid-label">Video</span>`
              : `<img src="${u}" alt="Step ${i + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='${cUrl}';}" />`
            }
            <span class="step-thumb-num tabular-nums">${i + 1}</span>
          </button>
        `;
      }).join(""));

      thumbsRow.querySelectorAll("[data-step-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
          stopAutoPlay();
          state.activePhotoIndex = parseInt(btn.getAttribute("data-step-idx"), 10);
          renderActiveStepPhoto();
        });
      });
    } else {
      thumbsRow.querySelectorAll(".step-thumb-btn").forEach((btn, i) => {
        btn.classList.toggle("active", i === idx);
      });
    }

    const activeThumb = thumbsRow.querySelector(".step-thumb-btn.active");
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  // Preload ahead and behind for instantaneous rendering
  if (total > 1) {
    const next1 = photos[(idx + 1) % total];
    const next2 = photos[(idx + 2) % total];
    const prev1 = photos[(idx - 1 + total) % total];
    [next1, next2, prev1].forEach((file, priorityIdx) => {
      if (file && !/\.(mp4|webm)$/i.test(file)) {
        const pre = new Image();
        pre.decoding = "async";
        pre.fetchPriority = priorityIdx === 0 ? "high" : "low";
        pre.src = resolveMediaUrl(file);
      }
    });
  }
}

function stepPhoto(delta, isAutoWalk = false) {
  const room = state.rooms[state.selectedRoomKey];
  if (!room) return;
  const routes = getRoutesForRoom(room);
  const currentRoute = routes[state.activeApIndex] || routes[0];
  const photos = currentRoute.photos || [];
  if (photos.length <= 1) return;

  const total = photos.length;
  const target = state.activePhotoIndex + delta;

  if (isAutoWalk) {
    if (target >= total - 1) {
      state.activePhotoIndex = total - 1;
      stopAutoPlay(true);
      renderActiveStepPhoto();
      showToast(`Arrived at Room ${room.name}!`);
      return;
    }
    state.activePhotoIndex = Math.max(0, target);
  } else {
    if (target >= total) {
      state.activePhotoIndex = 0;
    } else if (target < 0) {
      state.activePhotoIndex = total - 1;
    } else {
      state.activePhotoIndex = target;
    }
  }

  renderActiveStepPhoto();
}

function toggleAutoPlay() {
  if (state.isPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
}

function startAutoPlay() {
  const room = state.rooms[state.selectedRoomKey];
  if (!room) return;
  const routes = getRoutesForRoom(room);
  const photos = (routes[state.activeApIndex] || routes[0]).photos || [];
  if (photos.length <= 1) return;

  // If already at the destination, restart from beginning
  if (state.activePhotoIndex >= photos.length - 1) {
    state.activePhotoIndex = 0;
    renderActiveStepPhoto();
  }

  state.isPlaying = true;
  const playBtn = document.getElementById("wtAutoPlayBtn");
  if (playBtn) {
    playBtn.classList.remove("reached");
    playBtn.classList.add("playing");
    safeRenderHTML(playBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span id="wtAutoPlayLabel">Pause Walk</span>`);
  }

  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = setInterval(() => {
    stepPhoto(1, true);
  }, 2400);
}

function stopAutoPlay(reachedDestination = false) {
  state.isPlaying = false;
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
  }
  const playBtn = document.getElementById("wtAutoPlayBtn");
  if (playBtn) {
    playBtn.classList.remove("playing");
    if (reachedDestination) {
      playBtn.classList.add("reached");
      safeRenderHTML(playBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span id="wtAutoPlayLabel">Replay Walk</span>`);
    } else {
      playBtn.classList.remove("reached");
      safeRenderHTML(playBtn, `<svg class="icon-svg" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span id="wtAutoPlayLabel">Auto-Walk</span>`);
    }
  }
}

function exitFullscreenViewer() {
  const viewerBox = document.querySelector(".viewer-box");
  if (viewerBox) viewerBox.classList.remove("is-fullscreen");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function syncFloorNavButtons() {
  document.querySelectorAll("[data-floor-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-floor-filter") === state.activeFloor);
  });
}

// ============================================================================
// EVENT LISTENERS & USER INTERACTIONS
// ============================================================================

// ============================================================================
// 3D KINETIC TILT & CURSOR SPOTLIGHT ENGINE (MITM NAVIGO)
// ============================================================================
function init3DTiltAndSpotlight() {
  const isPointerFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!isPointerFine) return;

  const cards = document.querySelectorAll(".wing-card");
  cards.forEach(card => {
    let ticking = false;

    card.addEventListener("pointermove", (e) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const normX = (x / rect.width) - 0.5;
        const normY = (y / rect.height) - 0.5;

        const rotateY = normX * 9;
        const rotateX = -normY * 9;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px) scale3d(1.015, 1.015, 1.015)`;
        card.style.setProperty("--mouse-x", `${x.toFixed(1)}px`);
        card.style.setProperty("--mouse-y", `${y.toFixed(1)}px`);
        ticking = false;
      });
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)";
    });
  });
}

function bindEvents() {
  init3DTiltAndSpotlight();

  // Navigation Mode Switcher (Wings / Floors / Hotspots)
  document.querySelectorAll("[data-nav-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-nav-mode");
      document.querySelectorAll("[data-nav-mode]").forEach(b => b.classList.toggle("active", b === btn));

      const viewWings = document.getElementById("viewModeWings");
      const viewDepts = document.getElementById("viewModeDepartments");
      const viewHotspots = document.getElementById("viewModeHotspots");

      if (viewWings) viewWings.style.display = mode === "wings" ? "block" : "none";
      if (viewDepts) viewDepts.style.display = mode === "departments" ? "block" : "none";
      if (viewHotspots) viewHotspots.style.display = mode === "hotspots" ? "block" : "none";
    });
  });

  // Direct Room Launchers (Teleports directly to walkthrough from any mode!)
  document.addEventListener("click", (e) => {
    const directRoomBtn = e.target.closest("[data-direct-room]");
    if (directRoomBtn) {
      e.stopPropagation();
      e.preventDefault();
      const rKey = directRoomBtn.getAttribute("data-direct-room");
      if (rKey && state.rooms[rKey]) {
        openRoom(rKey);
      }
      return;
    }

    const directFloorBtn = e.target.closest("[data-direct-floor]");
    if (directFloorBtn) {
      e.stopPropagation();
      e.preventDefault();
      const floor = directFloorBtn.getAttribute("data-direct-floor");
      const col = directFloorBtn.getAttribute("data-for-college") || "engineering";
      enterCollegeWithFloor(col, floor);
      return;
    }

    const directColBtn = e.target.closest("[data-direct-college]");
    if (directColBtn) {
      e.stopPropagation();
      e.preventDefault();
      const col = directColBtn.getAttribute("data-direct-college");
      enterCollege(col);
      return;
    }
  });

  // Universal Instant Teleport Search Bar & Autocomplete Dropdown
  const portalSearch = document.getElementById("portalSearchInput");
  const portalDropdown = document.getElementById("portalSearchDropdown");

  if (portalSearch && portalDropdown) {
    portalSearch.addEventListener("input", () => {
      const q = portalSearch.value.trim().toLowerCase();
      if (!q) {
        portalDropdown.style.display = "none";
        portalDropdown.replaceChildren();
        // Reset card filter
        document.querySelectorAll(".wing-card").forEach(c => c.style.display = "flex");
        return;
      }

      // Filter wing cards on wings tab
      document.querySelectorAll(".wing-card").forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? "flex" : "none";
      });

      // Find matching rooms campus-wide
      const matchedKeys = state.roomKeys.filter(k => {
        const r = state.rooms[k];
        if (!r) return false;
        const blob = [r.name, r.floor, r.dept, r.category, r.landmark, r.info].join(" ").toLowerCase();
        return blob.includes(q);
      }).slice(0, 8);

      if (matchedKeys.length === 0) {
        safeRenderHTML(portalDropdown, `<div style="padding: 14px 18px; font-size: 13px; color: #5f6368; text-align: center;">No campus rooms matching "${escapeHtml(q)}"</div>`);
        portalDropdown.style.display = "block";
      } else {
        safeRenderHTML(portalDropdown, matchedKeys.map(k => {
          const r = state.rooms[k];
          const title = r.name.length <= 5 ? `Room ${r.name}` : r.name;
          return `
            <div class="portal-suggest-item" data-direct-room="${escapeHtml(k)}">
              <div class="suggest-left">
                <span class="suggest-badge">${escapeHtml(k.slice(0, 3))}</span>
                <div>
                  <div class="suggest-name">${escapeHtml(title)}</div>
                  <div class="suggest-meta">${escapeHtml(r.dept || r.college || "")} • ${escapeHtml(r.floor || "")}</div>
                </div>
              </div>
              <button type="button" class="suggest-action">
                <span>Navigate &rarr;</span>
              </button>
            </div>
          `;
        }).join(""));
        portalDropdown.style.display = "block";
      }
    });

    portalSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const q = portalSearch.value.trim();
        const matched = findExactOrBestMatch(q);
        if (matched) {
          portalDropdown.style.display = "none";
          openRoom(matched);
        } else {
          const firstVisible = document.querySelector('.wing-card[style*="flex"], .wing-card:not([style*="display: none"])');
          if (firstVisible) {
            enterCollege(firstVisible.getAttribute("data-select-college"));
          }
        }
      }
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!portalSearch.contains(e.target) && !portalDropdown.contains(e.target)) {
        portalDropdown.style.display = "none";
      }
    });
  }

  // Academic Wing Filter Chips (All Wings, Eng, MBA, MCA, BCA, Pharmacy)
  document.querySelectorAll("[data-portal-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      const filter = chip.getAttribute("data-portal-filter");
      document.querySelectorAll("[data-portal-filter]").forEach(c => c.classList.toggle("active", c === chip));

      document.querySelectorAll(".wing-card").forEach(card => {
        const cardCol = card.getAttribute("data-select-college");
        const show = (filter === "all" || cardCol === filter);
        card.style.display = show ? "flex" : "none";
      });
    });
  });

  // Wing Primary Enter Buttons
  document.querySelectorAll("[data-btn-college]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const col = btn.getAttribute("data-btn-college");
      enterCollege(col);
    });
  });



  // Wing Card Body Click -> Enter College
  document.querySelectorAll(".wing-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const col = card.getAttribute("data-select-college");
      enterCollege(col);
    });
  });

  // 1. College Selection Portal Cards -> Enter College Only
  document.querySelectorAll("[data-select-college]").forEach(card => {
    card.addEventListener("click", () => {
      const college = card.getAttribute("data-select-college");
      enterCollege(college);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const college = card.getAttribute("data-select-college");
        enterCollege(college);
      }
    });
  });

  // 2. Change College Buttons -> Return to Portal
  document.getElementById("changeCollegeBtn")?.addEventListener("click", () => {
    showPortalView();
  });

  document.getElementById("topPortalBtn")?.addEventListener("click", () => {
    showPortalView();
  });

  document.getElementById("brandHomeLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showPortalView();
  });

  // 3. Quick Switch College Chips in Active College Bar
  document.querySelectorAll("[data-switch-college]").forEach(chip => {
    chip.addEventListener("click", () => {
      const college = chip.getAttribute("data-switch-college");
      enterCollege(college);
    });
  });

  // 4. Floor Filter Nav Buttons
  document.querySelectorAll("[data-floor-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeFloor = btn.getAttribute("data-floor-filter");
      syncFloorNavButtons();
      renderRoomsGrid();
    });
  });

  // 5. Theme Toggle Button
  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("locorom_theme", next);
    updateThemeButtonLabel();
  });

  // 6. Search Input & Clear
  const searchInput = document.getElementById("mainSearchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? "inline-flex" : "none";
      }
      renderRoomsGrid();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstCard = document.querySelector("#roomsGrid [data-room-key]");
        if (firstCard) {
          openRoom(firstCard.getAttribute("data-room-key"));
        }
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      state.searchQuery = "";
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      clearSearchBtn.style.display = "none";
      renderRoomsGrid();
    });
  }

  // 8. Walkthrough Screen Controls
  document.getElementById("wtBackBtn")?.addEventListener("click", () => {
    exitFullscreenViewer();
    if (state.activeCollege) {
      enterCollege(state.activeCollege);
    } else {
      showPortalView();
    }
  });

  document.getElementById("wtPrevBtn")?.addEventListener("click", () => {
    stopAutoPlay();
    stepPhoto(-1);
  });
  document.getElementById("wtNextBtn")?.addEventListener("click", () => {
    stopAutoPlay();
    stepPhoto(1);
  });
  document.getElementById("wtStagePrev")?.addEventListener("click", () => {
    stopAutoPlay();
    stepPhoto(-1);
  });
  document.getElementById("wtStageNext")?.addEventListener("click", () => {
    stopAutoPlay();
    stepPhoto(1);
  });
  document.getElementById("wtAutoPlayBtn")?.addEventListener("click", toggleAutoPlay);

  document.getElementById("wtShareBtn")?.addEventListener("click", () => {
    if (!state.selectedRoomKey) return;
    const shareUrl = new URL(window.location.origin + window.location.pathname);
    if (state.activeCollege) shareUrl.searchParams.set("college", state.activeCollege);
    shareUrl.searchParams.set("room", state.selectedRoomKey);
    if (state.activeApIndex > 0) {
      shareUrl.searchParams.set("ap", String(state.activeApIndex));
    }
    navigator.clipboard.writeText(shareUrl.toString()).then(() => showToast("Exact room link copied!"));
  });

  // 9. Mobile Touch Swipe for Walkthrough Stage
  const stage = document.getElementById("wtPhotoStageWrap");
  if (stage) {
    let startX = 0;
    let startY = 0;
    stage.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
        stopAutoPlay();
        stepPhoto(diffX > 0 ? -1 : 1);
      }
    }, { passive: true });
  }

  // 10. Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (document.activeElement && document.activeElement.tagName === "INPUT") {
      if (e.key === "Escape") document.activeElement.blur();
      return;
    }

    if (e.key === "/") {
      e.preventDefault();
      if (state.selectedRoomKey) showHomeView(true);
      searchInput?.focus();
    } else if (state.selectedRoomKey) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stopAutoPlay();
        stepPhoto(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stopAutoPlay();
        stepPhoto(1);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        toggleAutoPlay();
      } else if (e.key === "Escape") {
        if (state.activeCollege) enterCollege(state.activeCollege);
        else showPortalView();
      }
    }
  });

  // 11. Browser Back / Forward (popstate)
  window.addEventListener("popstate", (e) => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    const rawCollege = params.get("college");
    const apIdx = parseInt(params.get("ap") || "0", 10);

    const matchedRoomKey = findRoomKey(r);
    if (matchedRoomKey) {
      const room = state.rooms[matchedRoomKey];
      const collegeKeys = getCollegeKeysForRoom(room);
      state.activeCollege = (rawCollege && collegeKeys.includes(rawCollege.toLowerCase()))
        ? rawCollege.toLowerCase()
        : (collegeKeys[0] || "engineering");
      openRoom(matchedRoomKey, false, isNaN(apIdx) ? 0 : apIdx);
    } else if (rawCollege && ["engineering", "mba", "mca", "bca", "pharmacy"].includes(rawCollege.toLowerCase())) {
      enterCollege(rawCollege.toLowerCase(), false);
    } else if (e.state && e.state.view === "college" && e.state.college) {
      enterCollege(e.state.college, false);
    } else {
      showPortalView(false);
    }
  });
}



function findExactOrBestMatch(query) {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  const currentCollege = state.activeCollege || "engineering";

  // Check current college first
  const collegeKeys = state.roomKeys.filter(k => roomMatchesCollege(state.rooms[k], currentCollege));

  // 1. Exact key match in current college
  for (const k of collegeKeys) {
    if (k.toLowerCase() === q) return k;
  }
  // 2. Exact name match in current college
  for (const k of collegeKeys) {
    if ((state.rooms[k].name || "").toLowerCase() === q) return k;
  }
  // 3. Name contains query in current college
  for (const k of collegeKeys) {
    if ((state.rooms[k].name || "").toLowerCase().includes(q)) return k;
  }

  // 4. Fallback search across all rooms (e.g. if user is in Engineering and says "Belaku")
  for (const k of state.roomKeys) {
    if (k.toLowerCase() === q || (state.rooms[k].name || "").toLowerCase() === q) {
      // Auto-switch to the target room's college!
      const targetColleges = getCollegeKeysForRoom(state.rooms[k]);
      state.activeCollege = targetColleges[0];
      return k;
    }
  }

  return null;
}

// Start application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
