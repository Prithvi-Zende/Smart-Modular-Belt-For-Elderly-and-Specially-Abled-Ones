#include <Wire.h>
#include <math.h>

// ================ PIN CONFIGURATION ================
const int IR_PIN = 2;
const int TOUCH_PIN = 3;
const int BUZZER_PIN = 5;
const int MPU_ADDR = 0x68;
// Change these if your sensor outputs use opposite logic
const int IR_ACTIVE = LOW;
const int TOUCH_ACTIVE = HIGH;
// ================ FALL DETECTION SETTINGS ================
const float FREEFALL_G = 0.50;
const float IMPACT_G = 2.40;
const float FALL_TILT_DEG = 55.0;

const unsigned long FALL_WINDOW_MS = 2500;
const unsigned long TILT_CONFIRM_MS = 1000;
const unsigned long CSV_INTERVAL_MS = 250;

// ================ SENSOR DATA ================
float ax_g = 0, ay_g = 0, az_g = 0;
float gx_dps = 0, gy_dps = 0, gz_dps = 0;

float mpuTempC = 0;
float accMagnitude = 0;
float tilt = 0;

// ================ CALIBRATION DATA ================
float gyroXOffset = 0;
float gyroYOffset = 0;
float gyroZOffset = 0;

float baseAx = 0;
float baseAy = 0;
float baseAz = 1;

bool mpuOK = false;

// ================ ALARM STATES ================
bool fallPending = false;
bool fallAlarm = false;
bool sosAlarm = false;
bool obstacle = false;

unsigned long fallStartTime = 0;
unsigned long tiltStartTime = 0;
unsigned long lastCSVTime = 0;
unsigned long buzzerTimer = 0;

bool tiltTiming = false;
bool buzzerState = false;

// ================ READ MPU6050 ================
bool readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(MPU_ADDR, 14, true) != 14) {
    return false;
  }

  int16_t rawAx = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t rawAy = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t rawAz = (int16_t)((Wire.read() << 8) | Wire.read());

  int16_t rawTemp = (int16_t)((Wire.read() << 8) | Wire.read());

  int16_t rawGx = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t rawGy = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t rawGz = (int16_t)((Wire.read() << 8) | Wire.read());

  // Accelerometer scale: +/-2 g
  ax_g = rawAx / 16384.0;
  ay_g = rawAy / 16384.0;
  az_g = rawAz / 16384.0;

  // Internal MPU6050 chip temperature, in degrees Celsius
  mpuTempC = (rawTemp / 340.0) + 36.53;

  // Gyroscope scale: +/-250 degrees/second
  gx_dps = (rawGx / 131.0) - gyroXOffset;
  gy_dps = (rawGy / 131.0) - gyroYOffset;
  gz_dps = (rawGz / 131.0) - gyroZOffset;

  accMagnitude = sqrt(
    ax_g * ax_g +
    ay_g * ay_g +
    az_g * az_g
  );

  return true;
}

// ================ INITIALIZE MPU6050 ================
bool initializeMPU() {
  // Wake up MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);

  if (Wire.endTransmission() != 0) {
    return false;
  }

  delay(100);

  // Set accelerometer range to +/-2 g
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);
  Wire.write(0x00);

  if (Wire.endTransmission() != 0) {
    return false;
  }

  // Set gyroscope range to +/-250 degrees/second
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1B);
  Wire.write(0x00);

  if (Wire.endTransmission() != 0) {
    return false;
  }

  return true;
}

// ================ CALIBRATION ================
bool calibrateMPU() {
  const int samples = 200;

  float sumGx = 0;
  float sumGy = 0;
  float sumGz = 0;

  float sumAx = 0;
  float sumAy = 0;
  float sumAz = 0;

  int validSamples = 0;

  // Keep the belt still in its normal wearing orientation.
  for (int i = 0; i < samples; i++) {
    if (readMPU()) {
      // At startup, gyro offsets are zero.
      sumGx += gx_dps;
      sumGy += gy_dps;
      sumGz += gz_dps;

      sumAx += ax_g;
      sumAy += ay_g;
      sumAz += az_g;

      validSamples++;
    }

    delay(5);
  }

  if (validSamples == 0) {
    return false;
  }

  // Gyroscope zero-rate offsets
  gyroXOffset = sumGx / validSamples;
  gyroYOffset = sumGy / validSamples;
  gyroZOffset = sumGz / validSamples;

  // Baseline orientation for tilt calculation
  baseAx = sumAx / validSamples;
  baseAy = sumAy / validSamples;
  baseAz = sumAz / validSamples;

  float magnitude = sqrt(
    baseAx * baseAx +
    baseAy * baseAy +
    baseAz * baseAz
  );

  if (magnitude < 0.01) {
    return false;
  }

  baseAx /= magnitude;
  baseAy /= magnitude;
  baseAz /= magnitude;

  return true;
}

// ================ CALCULATE TILT ================
void calculateTilt() {
  float magnitude = sqrt(
    ax_g * ax_g +
    ay_g * ay_g +
    az_g * az_g
  );

  if (magnitude < 0.01) {
    tilt = 0;
    return;
  }

  float currentAx = ax_g / magnitude;
  float currentAy = ay_g / magnitude;
  float currentAz = az_g / magnitude;

  float dotProduct =
    baseAx * currentAx +
    baseAy * currentAy +
    baseAz * currentAz;

  dotProduct = constrain(dotProduct, -1.0, 1.0);

  tilt = acos(dotProduct) * 180.0 / PI;
}

// ================ FALL DETECTION ================
void detectFall() {
  static bool previousFreefall = false;
  static bool previousImpact = false;

  bool freefallDetected = accMagnitude < FREEFALL_G;
  bool impactDetected = accMagnitude > IMPACT_G;

  // Start detection window on a new freefall or impact event
  if ((freefallDetected && !previousFreefall) ||
      (impactDetected && !previousImpact)) {
    fallPending = true;
    fallStartTime = millis();
    tiltTiming = false;
  }

  previousFreefall = freefallDetected;
  previousImpact = impactDetected;

  if (!fallPending) {
    return;
  }

  if (millis() - fallStartTime > FALL_WINDOW_MS) {
    fallPending = false;
    tiltTiming = false;
    return;
  }

  if (tilt >= FALL_TILT_DEG) {
    if (!tiltTiming) {
      tiltTiming = true;
      tiltStartTime = millis();
    }

    if (millis() - tiltStartTime >= TILT_CONFIRM_MS) {
      fallAlarm = true;
      fallPending = false;
      tiltTiming = false;
    }
  } else {
    tiltTiming = false;
  }
}

// ================ STATE-RETAINING TOUCH SOS ================
void handleTouch() {
  // ON  -> SOS active
  // OFF -> SOS inactive
  sosAlarm = (digitalRead(TOUCH_PIN) == TOUCH_ACTIVE);
}

// ================ BUZZER CONTROL ================
void handleBuzzer() {
  unsigned long now = millis();

  // Fall or SOS: faster beeping
  if (fallAlarm || sosAlarm) {
    if (now - buzzerTimer >= 150) {
      buzzerTimer = now;
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }
  }
  // Obstacle: slower beeping
  else if (obstacle) {
    if (now - buzzerTimer >= 400) {
      buzzerTimer = now;
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }
  }
  else {
    buzzerState = false;
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// ================ CSV OUTPUT ================
void printCSV() {
  Serial.print(ax_g, 3);
  Serial.print(",");

  Serial.print(ay_g, 3);
  Serial.print(",");

  Serial.print(az_g, 3);
  Serial.print(",");

  Serial.print(gx_dps, 2);
  Serial.print(",");

  Serial.print(gy_dps, 2);
  Serial.print(",");

  Serial.print(gz_dps, 2);
  Serial.print(",");

  Serial.print(mpuTempC, 2);
  Serial.print(",");

  Serial.print(accMagnitude, 3);
  Serial.print(",");

  Serial.print(tilt, 2);
  Serial.print(",");

  Serial.print(fallAlarm ? 1 : 0);
  Serial.print(",");

  Serial.print(sosAlarm ? 1 : 0);
  Serial.print(",");

  // Final column ends the row
  Serial.println(obstacle ? 1 : 0);
}

// ================ SETUP ================
void setup() {
  pinMode(IR_PIN, INPUT);
  pinMode(TOUCH_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);

  Serial.begin(9600);
  Wire.begin();

  // Only the requested data columns are printed
  Serial.println(
    "accX,accY,accZ,gyroX,gyroY,gyroZ,appTemp,accMag,tilt,fallAlarm,SOS,obstacle"
  );

  if (!initializeMPU()) {
    mpuOK = false;
    return;
  }

  mpuOK = calibrateMPU();
}

// ================ MAIN LOOP ================
void loop() {
  if (!mpuOK) {
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }

  if (readMPU()) {
    calculateTilt();
    detectFall();
  }

  obstacle = (digitalRead(IR_PIN) == IR_ACTIVE);

  handleTouch();
  handleBuzzer();

  if (millis() - lastCSVTime >= CSV_INTERVAL_MS) {
    lastCSVTime = millis();
    printCSV();
  }
}
