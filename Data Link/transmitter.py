import socket
import threading
import time
from flask import Flask
from flask_socketio import SocketIO

try:
    import serial
except ImportError:
    serial = None

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

SERIAL_PORT = "COM5"   # Change to your Arduino's COM port
BAUD_RATE = 9600
SOCKETIO_PORT = 5000
float accX=0;
float accY=0;
float accZ=0;
float gyroX=0;
float gyroY=0;
float gyroZ=0;
float appTemp=0;
float accMag=0;
float tilt=0;
bool fallAlarm=0;
bool SOS=0;
bool obstacle=0;

@app.route("/")
def index():
    return "Transmitter service is running. Forwarding sensor data via SocketIO."


@socketio.on("connect")
def handle_connect():
    print("[SocketIO] Client connected")


@socketio.on("disconnect")
def handle_disconnect():
    print("[SocketIO] Client disconnected")


def read_serial(port=SERIAL_PORT, baud=BAUD_RATE):
    """Reads sensor readings from physical Arduino over USB."""
    if serial is None:
        print("[Serial] Error: pyserial is not installed. Run 'pip install pyserial'")
        return

    while True:
        try:
            print(f"[Serial] Connecting to Arduino on {port}...")
            with serial.Serial(port, baud, timeout=1) as ser:
                print(f"[Serial] Connected to Arduino on {port}")
                while True:
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not line:
                        continue

                    parts = line.split(",")
                    if len(parts) != 9:
                        continue

                    try:
                        packet = {
                            "ax": int(parts[0]),
                            "ay": int(parts[1]),
                            "az": float(parts[2]),
                            "gx": float(parts[3]),
                            "gy": float(parts[4]),
                            "gz": float(parts[5]),
                            "temp": float(parts[6]),
                            "obstacle": float(parts[7]),
                            "sswitch": float(parts[8]),
                        }
                    except ValueError:
                        continue

                    socketio.emit("sensor_update", packet)

        except (serial.SerialException, OSError) as error:
            print(f"[Serial] Error: {error}. Retrying in 2 seconds...")
            time.sleep(2)


if __name__ == "__main__":
    print(f"Transmitter running on port {SOCKETIO_PORT}")
    print("Use ipconfig to find this PC's IPv4 address")


    threading.Thread(target=read_serial, daemon=True).start()

    socketio.run(
        app,
        host="0.0.0.0",
        port=SOCKETIO_PORT,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
