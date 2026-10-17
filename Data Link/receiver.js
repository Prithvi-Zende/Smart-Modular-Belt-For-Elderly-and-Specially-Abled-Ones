let ax=0;
let ay=0;
let az=0;
let gx=0;
let gy=0;
let gz=0;
let temp=0;
let obstacle=0;
let sswitch=0;

const { io } = require("socket.io-client");

const socket = io("http://127.0.0.1:5000");

socket.on("sensor_update", function (data) {
  console.log(
    `AX: ${data.ax} cm | ` +
    `AY: ${data.ay} | ` +
    `AZ: ${data.az} | ` +
    `GX: ${data.gx} cm | ` +
    `GY: ${data.gy} | ` +
    `GZ: ${data.gz} | ` +
    `TEMP: ${data.temp}| ` +
    `OBSTACLE: ${data.obstacle} | ` +
    `SWITCH: ${data.sswitch}  `
  );
  ax=data.ax;
  ay=data.ay;
  az=data.az;
  gx=data.gx;
  gy=data.gy;
  gz=data.gz;
  temp=data.temp;
  obstacle=data.obstacle;
  sswitch=data.sswitch;
  //updateDashboard();
});

socket.on("connect", function () {
  console.log("Connected");
});

socket.on("disconnect", function () {
  console.log("Disconnected");
});
