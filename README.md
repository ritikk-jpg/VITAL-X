# VITAL-X // Tactical Edge Node

> **Offline-First Tactical Situational Awareness, Smart Squad Triage, FLIR Sensor Fusion & Zero-RF Optical Communication PWA**

---

## What is VITAL-X?

When a squad or rescue team steps into an active contested zone, a collapsed tunnel, or a disaster area, the first thing that dies is the network. Or worse — turning on a standard radio, Wi-Fi, or cellular transmitter immediately lights up your team's coordinates on an enemy Electronic Warfare (EW) scanner.

**VITAL-X** is our answer to that problem. It is a zero-dependency, 100% offline-first tactical edge application that turns any rugged smartphone or field tablet into an air-gapped situational awareness and medical triage terminal. Once loaded once, VITAL-X runs completely in **Airplane Mode** with zero internet, zero external CDNs, and zero radio emissions required.

---

## Our Vision

Honestly, the idea behind VITAL-X started from a simple question we kept asking ourselves while planning this project:

*What happens when the cloud is gone, the map tiles won't load, the radios are jammed, and a medic needs to know right now who in the 8-man squad is bleeding out — or whether a soldier's vitals flatlined just because their gear got ripped off in a blast?*

Most "smart defense" dashboards assume you have a clean 5G connection or a satellite uplink sitting in a lab. Out in the real world, you don't. And we also didn't want a solution that requires $50,000 of proprietary military hardware that takes years to deploy.

Our vision with VITAL-X is to give frontline operators and field medics a **survivable edge node** running on hardware they can carry today:
1. **Never goes blank when the internet drops** — replacing dead cloud map tiles with an instant offline vector grid and local IndexedDB storage (`TacticalEdgeDB`).
2. **Communicates in total radio silence (EMCON)** — using camera-to-screen optical QR bursts (`BEACON`) to pass coordinates, ambush alerts, and triage states between devices without leaking a single milliwatt of RF signal.
3. **Stops false-positive casualty panics** — combining biometric telemetry with IMU impact logic (**Smart-Drop Anti-Fratricide**) so a sensor dropped in the dirt is never mistaken for a dead soldier.
4. **Protects the squad if a device is compromised** — featuring a 2.5-second hardware-style **Zeroize (`DESTRUCT`)** interlock that wipes every local database store in milliseconds.

---

## How It Works (Step-by-Step Field Tutorial)

VITAL-X is designed around a **one-handed, high-contrast HUD** built for bright sunlight and night-vision (NVG) readability. There are no nested menus — everything lives on three main operational screens plus the persistent top bar.

### 1. Air-Gap Status Bar & Top System Header
At the very top of the screen, you'll always see:
- **`● VITAL-X [AIR-GAP SECURE]`**: Turns **Terminal Green** when you are completely offline (Airplane Mode) and **Safety Amber** when RF/network interfaces are active on the device.
- **`SW: vital-x-v1 CACHED`**: Confirms that the Service Worker ([`sw.js`](./sw.js)) has locked all core files into local cache.
- **`BEACON` Button**: Opens the Optical QR Transceiver from anywhere in the app.
- **`DESTRUCT` Button**: Hold for **2.5 seconds** (or tap once to open the slide-to-zeroize safety bar) to cryptographically purge all local data in `TacticalEdgeDB` if the node is about to be captured.

---

### 2. Screen 1: `MAPS` — Offline Tactical Vector Grid
Because standard map tiles (like OpenStreetMap or Google Maps) fail the moment you enter Airplane Mode, VITAL-X uses a native **Offline Vector Canvas** backed by IndexedDB:
- **Concentric Range Rings**: Shows `100M`, `200M`, and `300M` distance rings around your active GPS position (`▲ ALPHA-01`) along with your exact distance and azimuth bearing to the extraction point (`■ SHELTER / LZ`).
- **Tap-to-Drop Waypoints**: Tap anywhere directly on the map canvas to drop custom tactical waypoint pins (`◆ WP-01`, `◆ WP-02`, etc.).
- **4-Button Action Pad**:
  - **`SOS`**: Triggers an immediate priority escalation alert and pre-loads an `AMBUSH / UNDER FIRE` optical packet.
  - **`COMMS`**: Opens the Optical QR Transceiver sheet.
  - **`NO-GO`**: Drops a **100-meter red exclusion ring** onto the map (saved persistently in `TacticalEdgeDB`) and automatically recalculates a yellow bypass route around the hazard.
  - **`SYNC`**: Locks your current hardware GNSS/GPS coordinates into the local `telemetry_cache` store.

---

### 3. Screen 2: `TRIAGE` — Squad Biometrics & Smart-Drop Protection
Gives the squad leader and combat medic a live view of all **8 squad operators** synced with IndexedDB (`squad_triage`):
- **Live ECG & Vitals Monitor**: Select any operator card in the 2x4 roster grid to inspect their live Lead-II ECG waveform, Heart Rate (`BPM`), and blood oxygen (`% SpO2`), automatically sorted by TCCC priority (`RED` Immediate, `YELLOW` Delayed, `GREEN` Minimal, `BLACK` Expectant).
- **`[ TAG ]`**: Cycles the selected operator's triage status and saves it immediately to `TacticalEdgeDB`.
- **`[ GEAR DROP ]` (Smart-Drop Anti-Fratricide Demo)**: Simulates a `28.0 m/s²` IMU shock where a soldier's biometric patch or vest comes unseated during combat. Instead of falsely marking the soldier `BLACK` (deceased), VITAL-X suppresses the black-tag and triggers a **15-second Smart-Drop verification countdown** (`GEAR DROPPED IN DIRT // SOLDIER STILL ALIVE`).

---

### 4. Screen 3: `FLIR` — Thermal & LiDAR Sensor Fusion
Provides an optical/thermal target acquisition viewport:
- **`THERMAL SENSOR`**: Toggles between **Ironbow Thermal IR** signature rendering and standard optical feed, automatically locking onto biological heat signatures (`~37.1°C`).
- **`LIDAR / ToF`**: Overlays a depth proximity mesh across the sector for zero-light clearance.
- **`CONTACT / FOUND`**: Stamps the detected thermal signature's coordinates directly onto your tactical map and stages a `THERMAL CONTACT CONFIRMED` message.
- **`ASSIST / BACKUP`**: Flags your current position for squad reinforcement.

---

### 5. Zero-RF Optical Transceiver (`BEACON` / `COMMS`)
When radio silence is mandatory, two operators can exchange tactical data simply by pointing one phone's camera at the other phone's screen:
- **01: Broadcast Composer (`TX`)**:
  - Pick one of the 6 quick-select tactical preset chips (e.g., `🚨 AMBUSH / UNDER FIRE`, `🛑 ROUTE BLOCKED / RETREAT`, `🩸 MEDEVAC URGENT`) or type custom field notes.
  - Inspect the live compact JSON packet (`v`, `seq`, `ts`, `src`, `geo`, `cat`, `msg`, `med`) with a real-time **200-byte payload budget monitor**.
  - Renders a high-contrast **ISO/IEC 18004 QR Matrix (Error Correction Level M - 15% recovery, 4-module quiet zone)** and logs the frame to `TacticalEdgeDB`.
- **02: Optical Scanner (`RX`)**:
  - Uses the device camera (and local [`vendor/jsQR.min.js`](./vendor/jsQR.min.js) decoder) to scan incoming optical frames, or tap **`SIMULATE RX PACKET`** to test packet ingestion, duplicate sequence rejection (`seq`), and automatic squad triage updates.

---

## 🛠️ Hardware Specifications & Sensor Architecture

One of our biggest design priorities was making sure VITAL-X doesn't stay locked inside a lab. It is built to run on **Commercial-Off-The-Shelf (COTS)** Android devices, rugged field tablets, and tactical edge compute boards without needing proprietary defense hardware.

### 1. Edge Compute & Field Display

| Subsystem | Baseline Field Specification | Recommended / Ruggedized |
| :--- | :--- | :--- |
| **Processor (SoC)** | Octa-core ARM64 (e.g., MediaTek Dimensity 7025-Ultra / Snapdragon 6 Gen 1 or equivalent) | Qualcomm Snapdragon 8-series / Rockchip RK3588 |
| **Memory (RAM)** | 6 GB LPDDR4X | 8 GB – 12 GB LPDDR5 |
| **Local Storage** | 128 GB UFS 2.2 (Offline vector tiles, IndexedDB logs) | 256 GB UFS 3.1+ (MIL-STD-810H shock-resistant) |
| **Display Panel** | 6.67" AMOLED, 120Hz, 1080×2400, 2100 nits peak brightness | High-nits sunlight-readable glove-touch panel |
| **Ingress & Protection** | IP54 splash resistance with rugged bumper casing | IP68 / IP69K full submersion, MIL-STD-810H compliant |
| **Power & Autonomy** | 5110 mAh internal Li-Po (18W–45W fast charge) | Hot-swappable battery pack or solar trickle input |

---

### 2. Tactical Sensor Suite

* **Optical Air-Link Transceiver:**
  * **Sensor:** 50 MP (f/1.8, 1/1.96", PDAF) primary RGB camera + high-contrast dynamic display.
  * **Role:** Line-of-sight visual transceiver. Encodes and reads high-density JSON micro-packets (`< 200 bytes`) at `0.3m – 1.5m` range under complete radio silence (EMCON).

* **Tactical Satellite Navigation (GNSS):**
  * **Constellations:** Multi-band GNSS supporting GPS (L1), GLONASS (G1), Galileo (E1), and NavIC.
  * **Performance:** Hardware fix retention in total Airplane Mode with native vector heading computation.

* **Proximity & Ranging (LiDAR / ToF):**
  * **Sensor Options:** Direct Time-of-Flight (dToF) sensor (e.g., STMicroelectronics VL53L1X micro-LiDAR via USB-C or built-in smartphone depth array / WebXR Depth API).
  * **Ranging Envelope:** `0.05 m` to `4.0 m` operational distance (`±20 mm` accuracy) for door clearance, trench depth, and rubble navigation in zero-light conditions.

* **Thermal Imaging (FLIR / LWIR):**
  * **Core Integration:** USB-C UVC-compliant thermal camera core (e.g., FLIR Lepton 3.5 or Seek Thermal Compact, `8 µm – 14 µm` Long-Wave Infrared).
  * **Software Fallback:** Native RGB camera pipeline running high-contrast Ironbow / White-Hot luminance gradient mapping for sensor-emulated field deployment when an external UVC core isn't plugged in.

---

### 3. Communications & Emission Profile

* **RF Transmission:** **`0.00 mW` (Absolute Zero RF Emission)**
* **Electronic Warfare (EW) Profile:** 100% immune to RF direction-finding, SIGINT triangulation, and broadband electromagnetic jamming.
* **Bus Architecture:** Internal hardware bus bridging USB-C UVC/HID peripherals and hardware camera-to-screen optical pipelines.

---

## 🚀 Deployment & Running Offline (Any Device)

### Option A: Deploy on GitHub Pages (Works Offline on Every Phone & Laptop)
1. Upload the files in this folder (`index.html`, `style.css`, `app.js`, `db.js`, `sw.js`, `manifest.json`, `README.md`, and the `vendor/` folder) to a new GitHub repository.
2. Go to **Settings -> Pages** on GitHub, set **Source** to **Deploy from a branch (`main` / `/root`)**, and click **Save**.
3. Open your live `https://<your-username>.github.io/<repo-name>/` URL **once** on any phone or tablet.
4. Wait 1 second for the top bar to show **`SW: vital-x-v1 CACHED`** (and optionally tap **"Add to Home Screen / Install VITAL-X"**).
5. Turn on **Airplane Mode** — VITAL-X will load and run 100% offline!

### Option B: Run Locally on Windows (`localhost:8080`)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1
```
Then open **http://localhost:8080** in Chrome or Edge.
