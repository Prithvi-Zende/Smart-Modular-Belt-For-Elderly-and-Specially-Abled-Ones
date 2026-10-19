const { Server } = require("socket.io");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

// Dashboard HTTP + browser WebSocket server on port 3000
const ALLOWED_FILES = new Set(["index.html", "script.js", "style.css"]);

const dashServer = http.createServer((req, res) => {
  const reqFile = req.url === "/" ? "index.html" : path.basename(req.url);
  if (!ALLOWED_FILES.has(reqFile)) { res.writeHead(404); res.end("Not found"); return; }
  const filePath = path.join(__dirname, reqFile);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
});

const io = new Server(dashServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Browser connected:", socket.id);
  socket.on("disconnect", () => console.log("Browser disconnected:", socket.id));
});

dashServer.listen(3000, () => console.log("Dashboard at http://localhost:3000"));

// Receiver socket.io server on port 5000 (receiver.js connects here)
const recvServer = http.createServer();
const recvIo = new Server(recvServer, { cors: { origin: "*" } });

recvIo.on("connection", (socket) => {
  console.log("Receiver connected:", socket.id);

  socket.on("sensor_update", (data) => {
    // Attach timestamp if receiver didn't include one
    const payload = { ...data, timestamp: data.timestamp || new Date().toISOString() };
    console.log("sensor_update received, forwarding to browser");
    io.emit("sensor_update", payload);
  });

  socket.on("disconnect", () => console.log("Receiver disconnected:", socket.id));
});

recvServer.listen(5000, () => console.log("Receiver endpoint at http://localhost:5000"));

module.exports = { io };
