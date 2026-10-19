let accX=0;
let accY=0;
let accZ=0;
let gyroX=0;
let gyroY=0;
let gyroZ=0;
let appTemp=0;
let accMag=0;
let tilt=0;
let fallAlarm=0;
let SOS=0;
let obstacle=0;

const { io } = require("socket.io-client");

const socket = io("http://26.2.30.93:5000");

socket.on("sensor_update", function (data) {
  console.log(
    `AX: ${data.accX} | ` +
    `AY: ${data.accY} | ` +
    `AZ: ${data.accZ} | ` +
    `GX: ${data.gyroX} | ` +
    `GY: ${data.gyroY} | ` +
    `GZ: ${data.gyroZ} | ` +
    `TEMP: ${data.appTemp}| ` +
    `ACCMAG: ${data.accMag} | ` +
    `TILT: ${data.tilt} | ` +
    `FALLALARM: ${data.fallAlarm} | ` +
    `SOS: ${data.SOSAlarm} | ` +
    `OBSTACLE: ${data.obstacle} `
  );
  accX=data.accX;
  accY=data.accY;
  accZ=data.accZ;
  gyroX=data.gyroX;
  gyroY=data.gyroY;
  gyroZ=data.gyroZ;
  appTemp=data.appTemp;
  accMag=data.accMag;
  tilt=data.tilt;
  fallAlarm=data.fallAlarm;
  SOS=data.SOSAlarm;
  obstacle=data.obstacle;
  //updateDashboard();
});

socket.on("connect", function () {
  console.log("Connected");
});

socket.on("disconnect", function () {
  console.log("Disconnected");
});
