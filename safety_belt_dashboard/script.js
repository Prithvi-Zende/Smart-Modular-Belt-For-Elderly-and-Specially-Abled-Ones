const $ = id => document.getElementById(id);

const state = {
  socket: null,
  reconnectTimer: null,
  reconnectDelay: 1000,
  manualClose: false,
  demo: false,
  demoTimer: null,
  lastMessage: 0,
  messages: 0,
  prevObstacle: null,
  prevFall: null,
  prevSOS: null,
  obstacles: [],
  sos: [],
  profile: { name: "User", email: "", contact: "" }
};

// ── Utilities ────────────────────────────────────────────────
function now() { return new Date().toLocaleTimeString(); }

function formatTime(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? now() : d.toLocaleString();
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

function badge(id, text, type = "waiting") {
  $(id).textContent = text;
  $(id).className = "badge " + type;
}

function connection(connected, text) {
  $("connectionBadge").textContent = "● " + text;
  $("connectionBadge").className = "badge " + (connected ? "online" : "offline");
}

function toast(msg, duration = 3000) {
  let el = $("toastMsg");
  if (!el) {
    el = document.createElement("div");
    el.id = "toastMsg";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.4);";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, duration);
}

function toastConfirm(msg, onConfirm) {
  let overlay = $("toastOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "toastOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `<div style="background:#1e1e2e;color:#fff;padding:24px 28px;border-radius:12px;max-width:340px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.5)">
      <p id="toastConfirmMsg" style="margin:0 0 16px"></p>
      <button id="toastOk" style="margin-right:8px;padding:8px 20px;background:#6c63ff;color:#fff;border:none;border-radius:6px;cursor:pointer">OK</button>
      <button id="toastCancel" style="padding:8px 20px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer">Cancel</button>
    </div>`;
    document.body.appendChild(overlay);
  }
  $("toastConfirmMsg").textContent = msg;
  overlay.style.display = "flex";
  const close = () => { overlay.style.display = "none"; };
  $("toastOk").onclick = () => { close(); onConfirm(); };
  $("toastCancel").onclick = close;
}

// ── Clock ────────────────────────────────────────────────────
function clock() { $("clock").textContent = new Date().toLocaleString(); }
setInterval(clock, 1000);
clock();

// ── Navigation ───────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  $(page).classList.add("active");
  document.querySelectorAll(".nav").forEach(el =>
    el.classList.toggle("active", el.dataset.page === page)
  );
  const titles = {
    dashboard: "Safety Dashboard", obstacles: "Obstacle History",
    sos: "SOS / Fall History", profile: "Edit Profile", settings: "Settings"
  };
  $("pageTitle").textContent = titles[page] || "Dashboard";
  renderEvents();
}

document.querySelectorAll(".nav").forEach(btn =>
  btn.addEventListener("click", () => navigate(btn.dataset.page))
);
document.querySelectorAll("[data-go]").forEach(btn =>
  btn.addEventListener("click", () => navigate(btn.dataset.go))
);

// ── Profile ──────────────────────────────────────────────────
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("safestep-profile") || "{}");
    state.profile = { ...state.profile, ...saved };
  } catch {}
  $("profileName").value = state.profile.name;
  $("profileEmail").value = state.profile.email;
  $("profileContact").value = state.profile.contact;
  updateProfile();
}

function updateProfile() {
  $("userName").textContent = state.profile.name || "User";
  $("avatar").textContent = (state.profile.name || "U").trim().charAt(0).toUpperCase();
}

$("profileForm").addEventListener("submit", event => {
  event.preventDefault();
  state.profile = {
    name: $("profileName").value.trim() || "User",
    email: $("profileEmail").value.trim(),
    contact: $("profileContact").value.trim()
  };
  localStorage.setItem("safestep-profile", JSON.stringify(state.profile));
  updateProfile();
  toast("Profile saved.");
});

loadProfile();

// ── Event histories ──────────────────────────────────────────
function addObstacle(detected, timestamp) {
  state.obstacles.unshift({ time: formatTime(timestamp), detected: Boolean(detected) });
  state.obstacles = state.obstacles.slice(0, 300);
}

function addSos(event, status, timestamp) {
  state.sos.unshift({ time: formatTime(timestamp), event, status });
  state.sos = state.sos.slice(0, 300);
}

function obstacleTable(items) {
  if (!items.length) return '<tr><td colspan="3" class="empty">No events recorded.</td></tr>';
  return items.map(e => `
    <tr>
      <td>${safe(e.time)}</td>
      <td><i class="event-dot ${e.detected ? "detected" : "clear"}"></i>${e.detected ? "Object detected" : "Path clear"}</td>
      <td><span class="badge ${e.detected ? "offline" : "online"}">${e.detected ? "OBSTACLE" : "CLEAR"}</span></td>
    </tr>`).join("");
}

function sosTable(items) {
  if (!items.length) return '<tr><td colspan="3" class="empty">No events recorded.</td></tr>';
  return items.map(e => `
    <tr>
      <td>${safe(e.time)}</td>
      <td><i class="event-dot touch"></i>${safe(e.event)}</td>
      <td><span class="badge ${e.status === "ACKNOWLEDGED" ? "online" : "waiting"}">${safe(e.status)}</span></td>
    </tr>`).join("");
}

function renderEvents() {
  $("obstacleRows").innerHTML    = obstacleTable(state.obstacles.slice(0, 5));
  $("allObstacleRows").innerHTML = obstacleTable(state.obstacles);
  $("sosRows").innerHTML         = sosTable(state.sos.slice(0, 5));
  $("allSosRows").innerHTML      = sosTable(state.sos);
  $("obstacleCount").textContent = state.obstacles.filter(e => e.detected).length;
  $("sosCount").textContent      = state.sos.length;
}

// ── Sensor data handler ──────────────────────────────────────
// Consumes the exact fields emitted by receiver.js:
// accX, accY, accZ, gyroX, gyroY, gyroZ, appTemp, accMag, tilt, fallAlarm, SOSAlarm, obstacle
function processSensorData(data) {
  if (!data || typeof data !== "object") return;

  const ts = data.timestamp || new Date().toISOString();

  state.lastMessage = Date.now();
  state.messages++;

  $("lastUpdate").textContent = formatTime(ts);
  $("connectionMessage").textContent = `Received ${state.messages} sensor messages.`;

  // Numeric values
  const ax   = Number(data.accX);
  const ay   = Number(data.accY);
  const az   = Number(data.accZ);
  const gx   = Number(data.gyroX);
  const gy   = Number(data.gyroY);
  const gz   = Number(data.gyroZ);
  const temp = Number(data.appTemp);
  const mag  = Number(data.accMag);
  const tilt = Number(data.tilt);

  // Boolean flags
  const obstacleOn = data.obstacle  === 1 || data.obstacle  === true;
  const fallOn     = data.fallAlarm === 1 || data.fallAlarm === true;
  const sosOn      = data.SOSAlarm  === 1 || data.SOSAlarm  === true;

  // Update motion display
  $("accX").textContent  = Number.isFinite(ax)   ? ax.toFixed(2)   : "--";
  $("accY").textContent  = Number.isFinite(ay)   ? ay.toFixed(2)   : "--";
  $("accZ").textContent  = Number.isFinite(az)   ? az.toFixed(2)   : "--";
  $("gyroX").textContent = Number.isFinite(gx)   ? gx.toFixed(2)   : "--";
  $("gyroY").textContent = Number.isFinite(gy)   ? gy.toFixed(2)   : "--";
  $("gyroZ").textContent = Number.isFinite(gz)   ? gz.toFixed(2)   : "--";
  $("tilt").textContent  = Number.isFinite(tilt) ? tilt.toFixed(1) + "°" : "--°";
  $("accMag").textContent = Number.isFinite(mag) ? mag.toFixed(2)  : "--";
  $("appTemp").textContent = Number.isFinite(temp) ? temp.toFixed(1) + "°C" : "--°C";

  // Stat cards
  $("tiltStat").textContent   = Number.isFinite(tilt) ? tilt.toFixed(1) + "°" : "--°";
  $("accMagStat").textContent = Number.isFinite(mag)  ? mag.toFixed(2)  : "--";

  // 3D device model — use accX/Y/Z for orientation
  if (Number.isFinite(ax) && Number.isFinite(ay)) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    $("device").style.transform =
      `rotateX(${clamp(ay * 5, -80, 80)}deg) rotateY(${clamp(az * 5, -80, 80)}deg) rotateZ(${clamp(ax * 5, -80, 80)}deg)`;
  }

  // MPU badge
  badge("mpuStatus", "ACTIVE", "online");
  badge("mpuBadge",  "ACTIVE", "online");

  // IR obstacle
  $("irDescription").textContent = obstacleOn ? "Object detected" : "Path clear";
  badge("irBadge", obstacleOn ? "OBJECT" : "CLEAR", obstacleOn ? "offline" : "online");

  // Fall alarm
  $("fallDescription").textContent = fallOn ? "Fall detected!" : "No fall";
  badge("fallBadge", fallOn ? "FALL" : "OK", fallOn ? "offline" : "online");

  // SOS button
  $("sosDescription").textContent = sosOn ? "SOS pressed!" : "No SOS";
  badge("sosBadge", sosOn ? "SOS" : "IDLE", sosOn ? "offline" : "online");

  // Log obstacle transitions
  if (state.prevObstacle !== null && state.prevObstacle !== obstacleOn) {
    addObstacle(obstacleOn, ts);
  }
  state.prevObstacle = obstacleOn;

  // Log fall events (rising edge)
  if (state.prevFall === false && fallOn) {
    addSos("Fall detected", "ALERT", ts);
  }
  state.prevFall = fallOn;

  // Log SOS events (rising edge)
  if (state.prevSOS === false && sosOn) {
    addSos("SOS button pressed", "REQUESTED", ts);
  }
  state.prevSOS = sosOn;

  connection(true, "Receiving data");
  renderEvents();
}

// ── WebSocket / socket.io connection ─────────────────────────
function stopReconnect() {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
}

function disconnect() {
  state.manualClose = true;
  stopReconnect();
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  connection(false, "Disconnected");
}

function connect() {
  stopReconnect();
  state.manualClose = false;
  state.demo = false;
  clearInterval(state.demoTimer);
  $("demoBtn").textContent = "Start Demo";
  $("modeLabel").textContent = "LIVE HARDWARE";

  if (state.socket) { state.socket.disconnect(); state.socket = null; }

  const url = $("wsUrl").value.trim();
  let serverUrl;
  try {
    const p = new URL(url);
    if (!["http:", "https:", "ws:", "wss:"].includes(p.protocol)) throw new Error();
    serverUrl = p.protocol === "ws:"  ? "http://"  + p.host :
                p.protocol === "wss:" ? "https://" + p.host : url;
  } catch {
    connection(false, "Invalid URL");
    $("connectionMessage").textContent = "Enter a valid URL, e.g. http://192.168.1.10:3000";
    return;
  }

  connection(false, "Connecting");
  $("connectionMessage").textContent = "Connecting to server...";

  const socket = io(serverUrl, { transports: ["websocket"] });
  state.socket = socket;

  socket.on("connect", () => {
    state.reconnectDelay = 1000;
    connection(true, "Socket open · waiting for data");
    $("connectionMessage").textContent = "Connected. Waiting for sensor readings.";
  });

  // Receive sensor_update forwarded by server.js from receiver.js
  socket.on("sensor_update", data => {
    try { processSensorData(data); }
    catch (e) { console.error("sensor_update error:", e); }
  });

  socket.on("connect_error", () => {
    $("connectionMessage").textContent = "Connection error. Check server address and firewall.";
  });

  socket.on("disconnect", () => {
    connection(false, "Disconnected");
    if (!state.manualClose && !state.demo) {
      $("connectionMessage").textContent = "Connection lost. Reconnecting...";
      const delay = state.reconnectDelay;
      state.reconnectDelay = Math.min(delay * 2, 15000);
      state.reconnectTimer = setTimeout(connect, delay);
    }
  });
}

$("connectBtn").addEventListener("click", connect);
$("disconnectBtn").addEventListener("click", disconnect);
$("saveSettings").addEventListener("click", () => {
  $("wsUrl").value = $("settingsUrl").value.trim();
  connect();
});

// ── Demo mode ────────────────────────────────────────────────
function startDemo() {
  disconnect();
  state.demo = true;
  state.prevObstacle = null;
  state.prevFall = false;
  state.prevSOS = false;
  $("modeLabel").textContent = "DEMO DATA";
  $("demoBtn").textContent = "Stop Demo";
  $("connectionMessage").textContent = "DEMO MODE: simulated values, not from hardware.";

  let n = 0;
  state.demoTimer = setInterval(() => {
    n++;
    processSensorData({
      timestamp: new Date().toISOString(),
      accX:      +(Math.sin(n / 4) * 1.2).toFixed(3),
      accY:      +(Math.cos(n / 5) * 0.9).toFixed(3),
      accZ:      +(9.8 + Math.sin(n / 8) * 0.3).toFixed(3),
      gyroX:     +(Math.sin(n / 3) * 15).toFixed(2),
      gyroY:     +(Math.cos(n / 4) * 12).toFixed(2),
      gyroZ:     +(Math.sin(n / 6) * 8).toFixed(2),
      appTemp:   +(28 + Math.sin(n / 20) * 2).toFixed(1),
      accMag:    +(9.8 + Math.sin(n / 7) * 0.5).toFixed(3),
      tilt:      +(Math.abs(Math.sin(n / 4)) * 25).toFixed(1),
      fallAlarm: n % 15 === 0 ? 1 : 0,
      SOSAlarm:  n % 22 === 0 ? 1 : 0,
      obstacle:  n % 7  === 0 ? 1 : 0
    });
    connection(true, "DEMO DATA");
    $("connectionMessage").textContent = "DEMO MODE: generated readings; hardware not connected.";
  }, 1000);
}

$("demoBtn").addEventListener("click", () => {
  if (state.demo) {
    clearInterval(state.demoTimer);
    state.demo = false;
    $("demoBtn").textContent = "Start Demo";
    $("modeLabel").textContent = "LIVE HARDWARE";
    connection(false, "Demo stopped");
    $("connectionMessage").textContent = "Demo stopped. Connect to the server for real readings.";
  } else {
    startDemo();
  }
});

// ── Manual SOS request ───────────────────────────────────────
$("requestSos").addEventListener("click", () => {
  toastConfirm("Record an assistance request? No call or SMS will be sent.", () => {
    addSos("Manual assistance request", "PENDING");
    if (state.socket && state.socket.connected) {
      state.socket.emit("assistance_request", {
        type: "assistance_request",
        timestamp: new Date().toISOString(),
        source: "dashboard"
      });
    }
    renderEvents();
    toast("Request recorded locally. External delivery is not configured.");
  });
});

// ── Clear histories ──────────────────────────────────────────
$("clearObstacles").addEventListener("click", () => {
  toastConfirm("Clear obstacle history?", () => { state.obstacles = []; renderEvents(); });
});
$("clearSos").addEventListener("click", () => {
  toastConfirm("Clear SOS / fall history?", () => { state.sos = []; renderEvents(); });
});

// ── Stale data watchdog ──────────────────────────────────────
setInterval(() => {
  if (state.lastMessage && Date.now() - state.lastMessage > 5000) {
    connection(false, "Stale sensor data");
    badge("mpuStatus", "STALE", "waiting");
    badge("mpuBadge",  "STALE", "waiting");
    $("connectionMessage").textContent = "No sensor updates received for over five seconds.";
  }
}, 1000);

window.addEventListener("beforeunload", () => {
  state.manualClose = true;
  clearInterval(state.demoTimer);
  stopReconnect();
  if (state.socket) state.socket.disconnect();
});

renderEvents();
