/**
 * ============================================================================
 * VITAL-X | TACTICAL EDGE NODE — PRIMARY APPLICATION ENGINE (app.js)
 * 100% Zero-Dependency, Offline-First PWA Runtime
 * Guaranteed execution under Airplane Mode / Zero-Connectivity conditions.
 * ============================================================================
 */
'use strict';

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const MONO = 'ui-monospace,"SF Mono","JetBrains Mono","Courier New",monospace';
  const FONT = (px, w) => (w || 700) + ' ' + px + 'px ' + MONO;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);
  const pad2 = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =====================================================================
     1. GLOBAL APPLICATION STATE (Synchronized with TacticalEdgeDB)
     ===================================================================== */
  const appState = {
    activeTab: 'maps',
    selectedOpIndex: 0,
    sosActive: false,
    assistActive: false,
    isOnline: Boolean(navigator.onLine),
    tileServerFailed: true, // Default to offline vector engine in air-gapped tactical ops
    syncStatus: navigator.onLine ? 'ONLINE - EDGE SYNC READY' : 'OFFLINE - GPS LOCKED',
    seq: Number(localStorage.getItem('VITALX_SEQ_NUM') || localStorage.getItem('AEGIS_SEQ_NUM')) || 105,
    opticalDraft: {
      cat: 'AMBUSH',
      msg: 'ROUTE BLOCKED / RETREAT'
    },
    telemetry: {
      lat: 28.6139,
      lon: 77.2090,
      acc: 4,
      heading: 42,
      realGps: false,
      shelterLat: 28.6165,
      shelterLon: 77.2122
    },
    sensors: {
      thermalActive: true,
      lidarActive: false,
      liveCamActive: false,
      panAz: 0,
      panTarget: 0,
      detectedTemp: 37.1,
      bodyDetected: true
    },
    squad: [
      { operatorId: 'ALPHA-01', name: 'SGT MALIK', role: 'SQUAD LEAD', triageLevel: 'RED',    bpm: 134, spo2: 86 },
      { operatorId: 'ALPHA-02', name: 'CPL CHEN',  role: 'RECON / UAV', triageLevel: 'YELLOW', bpm: 108, spo2: 93 },
      { operatorId: 'ALPHA-03', name: 'LT VERMA',  role: 'COMMS SPEC',  triageLevel: 'GREEN',  bpm: 78,  spo2: 99 },
      { operatorId: 'ALPHA-04', name: 'SPC RAO',   role: 'MEDIC',       triageLevel: 'GREEN',  bpm: 82,  spo2: 98 },
      { operatorId: 'ALPHA-05', name: 'SGT KABIR', role: 'BREACHER',    triageLevel: 'RED',    bpm: 142, spo2: 84 },
      { operatorId: 'ALPHA-06', name: 'PFC DAS',   role: 'SAPPER',      triageLevel: 'YELLOW', bpm: 102, spo2: 94 },
      { operatorId: 'ALPHA-07', name: 'CPL NAIR',  role: 'POINTMAN',    triageLevel: 'GREEN',  bpm: 74,  spo2: 99 },
      { operatorId: 'ALPHA-08', name: 'SPC GILL',  role: 'REAR GUARD',  triageLevel: 'BLACK',  bpm: 0,   spo2: 0  }
    ],
    hazards: [],
    contacts: [],
    waypoints: [
      { id: 'WP-ALPHA', label: 'WP-01 // RALLY PT', rx: 0.28, ry: 0.48, lat: 28.6151, lon: 77.2078 }
    ],
    messages: []
  };
  window.appState = appState;

  const runtime = {
    modal: null,
    opticalTab: 'tx',
    sterile: false,
    raf: 0,
    startTime: Date.now(),
    dropMode: 'ok',
    dropDeadline: 0
  };

  function missionTime() {
    const s = Math.floor((Date.now() - runtime.startTime) / 1000);
    return '00:' + pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  /* =====================================================================
     2. NETWORK STATE & SERVICE WORKER TELEMETRY BAR WIRING
     ===================================================================== */
  function updateNetworkStatusUI() {
    const online = Boolean(navigator.onLine);
    appState.isOnline = online;

    const pill = $('#net-status-pill');
    const swTag = $('#sw-status-tag');
    const engineBtn = $('#hud-engine');

    if (pill) {
      if (!online) {
        // Airplane Mode / Zero-Connectivity: Terminal Green or Safety Amber Air-Gap indicator
        pill.textContent = '● VITAL-X [AIR-GAP SECURE // OFFLINE]';
        pill.className = 'net-status-pill';
      } else {
        pill.textContent = '● VITAL-X [AIR-GAP SECURE // RF STANDBY]';
        pill.className = 'net-status-pill amber';
      }
    }

    if (engineBtn) {
      engineBtn.textContent = !online
        ? 'VECTOR GRID: OFFLINE FALLBACK'
        : 'VECTOR GRID: TACTICAL EDGE v1';
    }

    if (swTag && !swTag.dataset.swReady) {
      swTag.textContent = !online ? 'AIRPLANE MODE: ACTIVE' : 'CACHE-FIRST: READY';
    }

    appState.syncStatus = online ? 'ONLINE - GPS LOCKED' : 'OFFLINE - GPS LOCKED';
    const syncSub = $('#sync-sub');
    if (syncSub) syncSub.textContent = appState.syncStatus;
  }

  function registerServiceWorkerAndNetworkHooks() {
    updateNetworkStatusUI();

    window.addEventListener('online', () => {
      updateNetworkStatusUI();
      updateMapHudUI();
    });

    window.addEventListener('offline', () => {
      appState.tileServerFailed = true;
      updateNetworkStatusUI();
      updateMapHudUI();
    });

    window.addEventListener('load', () => {
      updateNetworkStatusUI();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => {
            const swTag = $('#sw-status-tag');
            if (swTag) {
              swTag.dataset.swReady = 'true';
              swTag.textContent = 'SW: vital-x-v1 CACHED';
              swTag.style.color = '#4ADE80';
            }
            console.log('[VITAL-X] Service Worker registered (scope):', reg.scope);
          })
          .catch((err) => {
            const swTag = $('#sw-status-tag');
            if (swTag) {
              swTag.textContent = 'SW: LOCAL ENGINE';
              swTag.style.color = '#FACC15';
            }
            console.warn('[VITAL-X] Service Worker registration note:', err.message);
          });
      }
    });
  }

  /* =====================================================================
     3. OPERATIONAL PACKET BUILDER & OPTICAL COMMS SHEET
     ===================================================================== */
  function getActiveOperator() {
    return appState.squad[appState.selectedOpIndex] || appState.squad[0];
  }

  function buildOperationalPacketObject(tsOverride) {
    const op = getActiveOperator();
    const ts = tsOverride || Math.floor(Date.now() / 1000);
    return {
      v: 1,
      seq: appState.seq,
      ts: ts,
      src: op.operatorId,
      geo: [
        Number(appState.telemetry.lat.toFixed(4)),
        Number(appState.telemetry.lon.toFixed(4))
      ],
      cat: appState.opticalDraft.cat || 'CUSTOM',
      msg: appState.opticalDraft.msg || '',
      med: op.triageLevel || 'RED'
    };
  }

  function updateOpticalInspectorAndQR() {
    const pktObj = buildOperationalPacketObject();
    const compactJson = JSON.stringify(pktObj);
    const prettyJson = JSON.stringify(pktObj, null, 2);

    window.__VITALX_LOOPBACK_QR__ = compactJson;

    const byteLen = new TextEncoder().encode(compactJson).length;
    const charLen = compactJson.length;

    $('#active-cat-lbl').textContent = 'CAT: ' + pktObj.cat;
    $('#char-count-lbl').textContent = pktObj.msg.length + ' MSG CHARS (' + charLen + ' TOTAL)';

    const bytesEl = $('#meta-bytes');
    bytesEl.textContent = byteLen + ' B / 200 B';
    bytesEl.className = byteLen > 200 ? 'danger' : 'amber';

    $('#meta-seq').textContent = 'SEQ #' + pktObj.seq;
    $('#meta-geo').textContent = '[' + pktObj.geo[0].toFixed(4) + ', ' + pktObj.geo[1].toFixed(4) + ']';
    $('#meta-med').textContent = pktObj.med;

    const warnBanner = $('#payload-size-warning');
    warnBanner.hidden = byteLen <= 200;

    $('#payload-preview-json').textContent = prettyJson;

    renderQrCodeToCanvas(compactJson);
  }

  function renderQrCodeToCanvas(rawString) {
    const canvas = $('#qr-canvas');
    if (!canvas || !window.QREngine) return;

    const qr = window.QREngine.encode(rawString);
    const quietZone = 4; // Minimum 4-module quiet zone
    const totalModules = qr.N + quietZone * 2;

    const targetCssPx = 220;
    const modPx = Math.max(3, Math.floor(targetCssPx / totalModules));
    const sizeCss = totalModules * modPx;
    const dpr = DPR();

    canvas.style.width = sizeCss + 'px';
    canvas.style.height = sizeCss + 'px';
    canvas.width = Math.round(sizeCss * dpr);
    canvas.height = Math.round(sizeCss * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const scale = canvas.width / totalModules;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    for (let y = 0; y < qr.N; y++) {
      for (let x = 0; x < qr.N; x++) {
        if (qr.matrix[y][x]) {
          ctx.fillRect(
            Math.floor((x + quietZone) * scale),
            Math.floor((y + quietZone) * scale),
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }

    $('#qr-ver-lbl').textContent = 'VER ' + qr.version + '-M (' + qr.N + '×' + qr.N + ') // 4-MOD QUIET ZONE';
  }

  async function transmitAndSaveOpticalFrame() {
    appState.seq += 1;
    try {
      localStorage.setItem('VITALX_SEQ_NUM', String(appState.seq));
      localStorage.setItem('AEGIS_SEQ_NUM', String(appState.seq));
    } catch (e) {}

    const nowEpoch = Math.floor(Date.now() / 1000);
    const pktObj = buildOperationalPacketObject(nowEpoch);
    const compactJson = JSON.stringify(pktObj);

    updateOpticalInspectorAndQR();

    if (window.logPacket) {
      try {
        await window.logPacket({
          seq: pktObj.seq,
          v: pktObj.v,
          ts: pktObj.ts,
          src: pktObj.src,
          cat: pktObj.cat,
          msg: pktObj.msg,
          geo: pktObj.geo,
          rawPayload: compactJson
        }, 'TX');
      } catch (e) {}
    }

    $('#qr-tx-status').textContent = '[+] FRAME SEQ #' + pktObj.seq + ' LOGGED TO TacticalEdgeDB (' + pktObj.cat + ')';
    $('#qr-tx-status').style.color = '#4ADE80';
    $('#comms-sub').textContent = 'SEQ #' + pktObj.seq + ' // ' + pktObj.cat;

    await refreshRecentMessagesUI();
  }

  async function refreshRecentMessagesUI() {
    if (!window.getRecentMessages) return;
    try {
      const list = await window.getRecentMessages(20);
      appState.messages = list;
      $('#db-msg-count').textContent = list.length + ' LOGGED';
      const container = $('#db-msg-list');
      if (!container) return;
      container.textContent = '';

      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:10px;color:var(--text-dim);text-align:center;padding:8px';
        empty.textContent = 'NO MESSAGES IN TacticalEdgeDB YET — TAP TRANSMIT ABOVE';
        container.appendChild(empty);
        return;
      }

      list.forEach((m) => {
        const item = document.createElement('div');
        const catClass = String(m.category || '').toLowerCase();
        item.className = 'db-msg-item ' + (m.direction === 'RX' ? 'rx ' : '') + catClass;
        const dateStr = new Date((m.ts > 1e11 ? m.ts : m.ts * 1000)).toLocaleTimeString([], { hour12: false });
        const geoStr = Array.isArray(m.geo) ? m.geo[0].toFixed(4) + ',' + m.geo[1].toFixed(4) : '';
        item.innerHTML = `
          <div class="db-msg-top">
            <span>[${m.direction}] SEQ #${m.seq} · ${m.category}</span>
            <span>${dateStr} · ${geoStr}</span>
          </div>
          <div class="db-msg-body">${escapeHtml(m.text)}</div>
        `;
        container.appendChild(item);
      });
    } catch (e) {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* =====================================================================
     4. RX OPTICAL SCANNER (with Local jsQR Decoder) & PACKET INGESTION
     ===================================================================== */
  const rxState = {
    stream: null,
    video: $('#rx-video'),
    canvas: $('#rx-canvas'),
    scanTimer: 0,
    lastRawJson: ''
  };

  async function startRxCamera() {
    stopRxCamera();
    $('#rx-error-card').hidden = true;
    $('#rx-result-card').hidden = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      rxState.stream = stream;
      rxState.video.srcObject = stream;
      await rxState.video.play();
      $('#rx-status-tag').textContent = 'LOCK VIEWPORT TO QR MATRIX';

      rxState.scanTimer = setInterval(async () => {
        if (!rxState.stream || rxState.video.readyState < 2) return;
        if (window.jsQR && window.jsQR.asyncDecode) {
          const res = await window.jsQR.asyncDecode(rxState.video);
          if (res && res.data) {
            handleDecodedOpticalString(res.data);
            return;
          }
        }
        if (window.jsQR && rxState.canvas) {
          const cw = 210, ch = 210;
          rxState.canvas.width = cw;
          rxState.canvas.height = ch;
          const ctx = rxState.canvas.getContext('2d');
          ctx.drawImage(rxState.video, 0, 0, cw, ch);
          const imgData = ctx.getImageData(0, 0, cw, ch);
          const decoded = window.jsQR(imgData.data, cw, ch);
          if (decoded && decoded.data) {
            handleDecodedOpticalString(decoded.data);
          }
        }
      }, 280);
    } catch (e) {
      $('#rx-error-card').hidden = false;
      $('#rx-status-tag').textContent = 'OPTICAL SENSOR OFFLINE // SIM READY';
    }
  }

  function handleDecodedOpticalString(rawStr) {
    stopRxCamera();
    rxState.lastRawJson = rawStr;
    try {
      const parsed = JSON.parse(rawStr);
      $('#rx-res-payload').textContent = JSON.stringify(parsed, null, 2);
    } catch (e) {
      $('#rx-res-payload').textContent = rawStr;
    }
    $('#rx-result-card').hidden = false;
    $('#rx-error-card').hidden = true;
    $('#rx-status-tag').textContent = '[+] OPTICAL PACKET DECODED';
  }

  function stopRxCamera() {
    if (rxState.scanTimer) {
      clearInterval(rxState.scanTimer);
      rxState.scanTimer = 0;
    }
    if (rxState.stream) {
      rxState.stream.getTracks().forEach((t) => t.stop());
      rxState.stream = null;
    }
  }

  function simulateIncomingOpticalPacket() {
    const incoming = {
      v: 1,
      seq: appState.seq + 1,
      ts: Math.floor(Date.now() / 1000),
      src: 'ALPHA-02',
      geo: [28.6148, 77.2098],
      cat: 'MEDICAL',
      msg: 'MEDEVAC URGENT (RED)',
      med: 'RED'
    };
    handleDecodedOpticalString(JSON.stringify(incoming));
  }

  async function ingestScannedOpticalPacket() {
    if (!rxState.lastRawJson) return;
    try {
      const pkt = JSON.parse(rxState.lastRawJson);

      if (window.isPacketProcessed && await window.isPacketProcessed(pkt.seq)) {
        $('#rx-status-tag').textContent = '[!] DUPLICATE SEQ #' + pkt.seq + ' IGNORED';
        return;
      }

      appState.seq = Math.max(appState.seq, Number(pkt.seq) || appState.seq);
      try {
        localStorage.setItem('VITALX_SEQ_NUM', String(appState.seq));
        localStorage.setItem('AEGIS_SEQ_NUM', String(appState.seq));
      } catch (e) {}

      if (window.logPacket) {
        await window.logPacket({
          seq: pkt.seq,
          v: pkt.v || 1,
          ts: pkt.ts,
          src: pkt.src || 'OP-ALPHA-02',
          cat: pkt.cat || 'MEDICAL',
          msg: pkt.msg || 'RX PACKET',
          geo: pkt.geo || [28.6139, 77.2090],
          rawPayload: rxState.lastRawJson
        }, 'RX');
      }

      const opIdx = appState.squad.findIndex((o) =>
        o.operatorId === pkt.src || o.operatorId === 'OP-' + pkt.src || o.operatorId.replace('OP-', '') === pkt.src
      );
      if (opIdx >= 0 && pkt.med) {
        const op = appState.squad[opIdx];
        op.triageLevel = pkt.med;
        if (pkt.med === 'RED') { op.bpm = 138; op.spo2 = 87; }
        if (window.updateOperatorVitals) {
          await window.updateOperatorVitals(op.operatorId, {
            bpm: op.bpm,
            spo2: op.spo2,
            triageLevel: op.triageLevel
          });
        }
        appState.selectedOpIndex = opIdx;
      }

      await refreshRecentMessagesUI();
      renderSquadRoster();
      renderVitalsMonitor();
      switchOpticalSubtab('tx');
    } catch (e) {}
  }

  function switchOpticalSubtab(tab) {
    runtime.opticalTab = tab;
    $('#tab-tx').classList.toggle('active', tab === 'tx');
    $('#tab-rx').classList.toggle('active', tab === 'rx');
    $('#pane-tx').classList.toggle('active', tab === 'tx');
    $('#pane-rx').classList.toggle('active', tab === 'rx');
    if (tab === 'tx') {
      stopRxCamera();
      updateOpticalInspectorAndQR();
      refreshRecentMessagesUI();
    } else {
      startRxCamera();
    }
  }

  /* =====================================================================
     5. SCREEN 1: OFFLINE VECTOR MAP CANVAS FALLBACK & INDEXEDDB HAZARDS
        Renders tactical grid, coordinate rings, active GPS tracking,
        dropped NO-GO hazards, and waypoint pins under zero connectivity.
     ===================================================================== */
  const mapCanvas = $('#map-canvas');

  function calcDistBearing(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    const b = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return { dist: d, bearing: b };
  }

  function updateMapHudUI() {
    const strip = $('#map-status-strip');
    const bannerTxt = $('#route-banner-txt');
    const hazCountTxt = $('#hazard-count-txt');
    const clearBtn = $('#hud-clear-haz');
    const nogoBtn = $('#btn-nogo');
    const sosBtn = $('#btn-sos');

    const hCount = appState.hazards.length;
    hazCountTxt.textContent = hCount + (hCount === 1 ? ' HAZARD · ' : ' HAZARDS · ') + appState.waypoints.length + ' WP';
    clearBtn.hidden = hCount === 0;
    nogoBtn.classList.toggle('amber-on', hCount > 0);
    $('#nogo-sub').textContent = hCount > 0 ? hCount + ' IN DB // TAP +1' : '100M HAZARD RING';

    sosBtn.classList.toggle('active', appState.sosActive);
    $('#sos-sub').textContent = appState.sosActive ? 'BROADCASTING SOS!' : 'PRIORITY ESCALATE';

    strip.classList.remove('alert', 'warn');
    if (appState.sosActive) {
      strip.classList.add('alert');
      bannerTxt.textContent = '[!] SOS ESCALATION ACTIVE // GNSS LOCKED';
    } else if (hCount > 0) {
      strip.classList.add('warn');
      bannerTxt.textContent = '[!] NO-GO EXCLUSION RING // BYPASS HEADING ACTIVE';
    } else {
      bannerTxt.textContent = !navigator.onLine
        ? 'OFFLINE VECTOR GRID // CORRIDOR ALPHA CLEAR'
        : 'CORRIDOR ALPHA: VERIFIED CLEAR';
    }

    const t = appState.telemetry;
    $('#hud-gps').textContent = 'GNSS: ' + t.lat.toFixed(4) + 'N ' + t.lon.toFixed(4) + 'E (±' + Math.round(t.acc) + 'M)';
    const db = calcDistBearing(t.lat, t.lon, t.shelterLat, t.shelterLon);
    $('#hud-dist').textContent = 'SHELTER: ' + Math.round(db.dist) + 'M // AZ ' + String(Math.round(db.bearing)).padStart(3, '0') + '°';
    $('#sync-sub').textContent = appState.syncStatus;
  }

  async function dropNoGoHazard() {
    const idx = appState.hazards.length;
    const offsets = [
      { rx: 0.56, ry: 0.50 },
      { rx: 0.48, ry: 0.64 },
      { rx: 0.62, ry: 0.34 }
    ];
    const off = offsets[idx % offsets.length];
    const lat = +(appState.telemetry.lat + 0.0011 * (idx + 1)).toFixed(4);
    const lng = +(appState.telemetry.lon + 0.0010 * (idx + 1)).toFixed(4);

    const hazardPayload = {
      type: 'NO-GO',
      geo: [lat, lng],
      radius: 100,
      ts: Date.now(),
      active: true,
      rx: off.rx,
      ry: off.ry
    };

    if (window.saveHazard) {
      try {
        await window.saveHazard(hazardPayload);
        appState.hazards = await window.getActiveHazards();
      } catch (e) {
        appState.hazards.push(hazardPayload);
      }
    } else {
      appState.hazards.push(hazardPayload);
    }

    updateMapHudUI();
  }

  async function clearAllHazards() {
    if (window.clearHazard) {
      try {
        await window.clearHazard('ALL');
        appState.hazards = await window.getActiveHazards();
      } catch (e) {
        appState.hazards = [];
      }
    } else {
      appState.hazards = [];
    }
    updateMapHudUI();
  }

  function handleMapCanvasTap(e) {
    if (!mapCanvas) return;
    const rect = mapCanvas.getBoundingClientRect();
    const rx = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0.08, 0.92);
    const ry = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0.12, 0.88);
    const wpNum = appState.waypoints.length + 1;
    if (wpNum > 6) appState.waypoints.shift();
    const dLat = (0.82 - ry) * 0.0042;
    const dLon = (rx - 0.50) * 0.0042;
    appState.waypoints.push({
      id: 'WP-' + pad2(wpNum),
      label: 'WP-' + pad2(wpNum) + ' // PIN',
      rx,
      ry,
      lat: +(appState.telemetry.lat + dLat).toFixed(4),
      lon: +(appState.telemetry.lon + dLon).toFixed(4)
    });
    updateMapHudUI();
  }

  function triggerSos() {
    appState.sosActive = !appState.sosActive;
    if (appState.sosActive) {
      appState.opticalDraft.cat = 'AMBUSH';
      appState.opticalDraft.msg = 'AMBUSH / UNDER FIRE';
      $('#optical-custom-msg').value = appState.opticalDraft.msg;
    }
    updateMapHudUI();
  }

  function triggerSyncPos() {
    const btn = $('#btn-sync');
    $('#sync-sub').textContent = 'LOCKING GNSS...';
    const done = async () => {
      const ts = missionTime().slice(3);
      appState.syncStatus = navigator.onLine ? 'SYNCED ' + ts : 'OFFLINE - GPS LOCKED';
      btn.classList.toggle('cyan-on', navigator.onLine);
      btn.classList.toggle('green-on', !navigator.onLine);
      if (window.saveTelemetryFix) {
        try {
          await window.saveTelemetryFix({
            id: 'LAST_KNOWN_POS',
            geo: [appState.telemetry.lat, appState.telemetry.lon],
            accuracy: appState.telemetry.acc,
            heading: appState.telemetry.heading || 42,
            ts: Math.floor(Date.now() / 1000),
            syncedToCloud: Boolean(navigator.onLine)
          });
        } catch (e) {}
      }
      updateMapHudUI();
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          appState.telemetry.lat = pos.coords.latitude;
          appState.telemetry.lon = pos.coords.longitude;
          appState.telemetry.acc = pos.coords.accuracy || 4;
          appState.telemetry.realGps = true;
          done();
        },
        () => done(),
        { enableHighAccuracy: true, timeout: 2200 }
      );
    } else {
      setTimeout(done, 200);
    }
  }

  function drawMapCanvas(now) {
    const c = mapCanvas, d = DPR(), W = c.width / d, H = c.height / d;
    if (W < 10 || H < 10) return;
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);

    // Offline Vector Canvas Base (#09090B Tactical Matte Black)
    g.fillStyle = '#09090B';
    g.fillRect(0, 0, W, H);

    const ME = { x: W * 0.5, y: H * 0.82 };
    const SHELTER = { x: W * 0.64, y: H * 0.18 };
    const unit100m = Math.min(W, H) * 0.21;

    // 1. Tactical Coordinate Grid + Sub-grid
    const step = Math.max(26, Math.round(Math.min(W, H) / 9));
    g.lineWidth = 1;
    g.strokeStyle = '#18181B';
    g.beginPath();
    for (let x = ME.x % step; x < W; x += step) {
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = ME.y % step; y < H; y += step) {
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(W, Math.round(y) + 0.5);
    }
    g.stroke();

    // Topographic / Urban Sector Corridors
    g.strokeStyle = '#1F1F23';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, H * 0.72); g.lineTo(W, H * 0.72);
    g.moveTo(W * 0.44, 0); g.lineTo(W * 0.44, H);
    g.moveTo(0, H * 0.38); g.lineTo(W, H * 0.38);
    g.stroke();

    // 2. Concentric Coordinate Range Rings (100M, 200M, 300M) + Compass Crosshairs
    g.strokeStyle = '#27272A';
    g.lineWidth = 1;
    g.font = FONT(9, 800);
    g.fillStyle = '#71717A';
    for (let i = 1; i <= 3; i++) {
      const r = unit100m * i;
      g.beginPath();
      g.arc(ME.x, ME.y, r, 0, Math.PI * 2);
      g.stroke();
      const ry = ME.y - r - 3;
      if (ry > 28) {
        const ringLat = (appState.telemetry.lat + i * 0.0009).toFixed(4);
        g.fillText(i * 100 + 'M [' + ringLat + 'N]', ME.x + 4, ry);
      }
    }

    // Azimuth Bearing Crosshair through Active GPS Position
    g.strokeStyle = 'rgba(63, 63, 70, 0.45)';
    g.beginPath();
    g.moveTo(ME.x, 0); g.lineTo(ME.x, H);
    g.moveTo(0, ME.y); g.lineTo(W, ME.y);
    g.stroke();

    // 3. Primary & Bypass Navigation Vectors
    const hasHazard = appState.hazards.length > 0;
    const R1 = [ME, { x: W * 0.54, y: H * 0.62 }, { x: W * 0.62, y: H * 0.44 }, SHELTER];
    const R2 = [ME, { x: W * 0.28, y: H * 0.68 }, { x: W * 0.20, y: H * 0.40 }, { x: W * 0.36, y: H * 0.18 }, SHELTER];

    if (hasHazard) {
      g.strokeStyle = '#52525B';
      g.lineWidth = 2;
      g.setLineDash([4, 5]);
      g.beginPath();
      R1.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();

      g.strokeStyle = '#FACC15';
      g.lineWidth = 3.5;
      g.setLineDash([]);
      g.beginPath();
      R2.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    } else {
      g.strokeStyle = '#4ADE80';
      g.lineWidth = 3.5;
      g.setLineDash([]);
      g.beginPath();
      R1.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }

    // 4. Dropped NO-GO Hazards from TacticalEdgeDB
    appState.hazards.forEach((h, idx) => {
      const rx = typeof h.rx === 'number' ? h.rx : (0.56 - (idx % 3) * 0.06);
      const ry = typeof h.ry === 'number' ? h.ry : (0.50 - (idx % 2) * 0.12);
      const hx = W * rx, hy = H * ry;
      const rad = unit100m * 0.72;
      g.save();
      g.fillStyle = 'rgba(220, 38, 38, 0.22)';
      g.strokeStyle = '#DC2626';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(hx, hy, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      g.fillStyle = '#DC2626';
      g.fillRect(hx - 34, hy - 9, 68, 18);
      g.fillStyle = '#FFFFFF';
      g.font = FONT(9, 900);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((h.type || 'NO-GO') + ' ' + (h.radius || 100) + 'M', hx, hy);
      g.restore();
    });

    // 5. Waypoint Pins (Tactical Rally Points & User-Dropped Pins)
    appState.waypoints.forEach((wp) => {
      const wx = W * wp.rx;
      const wy = H * wp.ry;
      g.save();
      g.strokeStyle = '#FACC15';
      g.fillStyle = '#09090B';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(wx, wy - 7);
      g.lineTo(wx + 7, wy);
      g.lineTo(wx, wy + 7);
      g.lineTo(wx - 7, wy);
      g.closePath();
      g.fill();
      g.stroke();

      g.fillStyle = '#FACC15';
      g.font = FONT(9, 900);
      g.textAlign = 'left';
      g.fillText('◆ ' + wp.label, wx + 10, wy + 3);
      g.restore();
    });

    // 6. Stamped FLIR Thermal Contacts & Backup Pins
    appState.contacts.forEach((cPin, idx) => {
      const cx = W * (0.34 + (idx % 3) * 0.12);
      const cy = H * (0.32 + (idx % 2) * 0.14);
      g.fillStyle = cPin.type === 'ASSIST' ? '#DC2626' : '#FACC15';
      g.beginPath();
      g.arc(cx, cy, 6, 0, Math.PI * 2);
      g.fill();
      g.font = FONT(9, 900);
      g.textAlign = 'left';
      g.fillText(cPin.label, cx + 9, cy + 3);
    });

    // 7. Primary Extraction Waypoint (SHELTER / LZ)
    g.strokeStyle = '#38BDF8';
    g.lineWidth = 2;
    g.strokeRect(SHELTER.x - 8, SHELTER.y - 8, 16, 16);
    g.fillStyle = '#38BDF8';
    g.fillRect(SHELTER.x - 3, SHELTER.y - 3, 6, 6);
    g.font = FONT(10, 900);
    g.fillStyle = '#38BDF8';
    g.textAlign = 'left';
    g.fillText('■ SHELTER / LZ', SHELTER.x + 12, SHELTER.y + 4);

    // 8. Active GPS Operator Marker (ALPHA-01)
    if (appState.sosActive) {
      const ph = (now % 1200) / 1200;
      g.strokeStyle = '#DC2626';
      g.lineWidth = 3;
      g.globalAlpha = 1 - ph;
      g.beginPath();
      g.arc(ME.x, ME.y, 12 + ph * unit100m, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    g.fillStyle = appState.sosActive ? '#DC2626' : '#FACC15';
    g.strokeStyle = '#09090B';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ME.x, ME.y - 11);
    g.lineTo(ME.x - 9, ME.y + 8);
    g.lineTo(ME.x + 9, ME.y + 8);
    g.closePath();
    g.fill();
    g.stroke();

    g.fillStyle = '#F4F4F5';
    g.font = FONT(10, 900);
    g.fillText('▲ ALPHA-01 (GPS ACTIVE)', ME.x + 13, ME.y + 4);
  }

  /* =====================================================================
     6. SCREEN 2: TRIAGE (`squad_triage` IndexedDB Sync)
     ===================================================================== */
  const ecgState = { c: $('#ecg-canvas'), x: 0, prev: null, lastT: 0, reset: true };
  const TRIAGE_LEVELS = ['RED', 'YELLOW', 'GREEN', 'BLACK'];

  function renderSquadRoster() {
    const grid = $('#squad-grid');
    if (!grid) return;
    grid.textContent = '';

    const counts = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0 };

    appState.squad.forEach((op, idx) => {
      const lvl = op.triageLevel || 'GREEN';
      counts[lvl] = (counts[lvl] || 0) + 1;

      const btn = document.createElement('button');
      btn.className = 'squad-card t-' + lvl + (idx === appState.selectedOpIndex ? ' selected' : '');

      const vitalsStr = lvl === 'BLACK' ? '0 BPM · --%' : op.bpm + ' BPM · ' + op.spo2 + '%';
      const labelMap = { RED: 'IMMEDIATE / RED', YELLOW: 'DELAYED / YLW', GREEN: 'MINIMAL / GRN', BLACK: 'EXPECTANT / BLK' };

      btn.innerHTML = `
        <div class="sc-left">
          <div class="sc-id">${op.operatorId} · ${op.name}</div>
          <div class="sc-role">${op.role || 'OPERATOR'}</div>
        </div>
        <div class="sc-right">
          <div class="sc-vitals">${vitalsStr}</div>
          <span class="sc-tag">${labelMap[lvl] || lvl}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        appState.selectedOpIndex = idx;
        ecgState.reset = true;
        renderVitalsMonitor();
        renderSquadRoster();
      });
      grid.appendChild(btn);
    });

    $('#squad-summary-txt').textContent =
      counts.RED + ' RED · ' + counts.YELLOW + ' YLW · ' + counts.GREEN + ' GRN · ' + counts.BLACK + ' BLK';
  }

  function renderVitalsMonitor() {
    const op = getActiveOperator();
    const lvl = op.triageLevel || 'GREEN';
    const badge = $('#vm-badge');
    badge.className = 'triage-badge ' + lvl;
    badge.textContent = lvl;

    $('#vm-callsign').textContent = op.operatorId + ' // ' + op.name;
    $('#ecg-lead-lbl').textContent = 'ECG // LEAD II — ' + op.operatorId;

    const isFlat = runtime.dropMode !== 'ok' || lvl === 'BLACK';
    $('#v-bpm').textContent = isFlat ? '0' : String(op.bpm);
    $('#v-spo2').textContent = isFlat ? '--' : String(op.spo2);

    const bpmColor = lvl === 'RED' ? '#FCA5A5' : lvl === 'YELLOW' ? '#FACC15' : lvl === 'GREEN' ? '#4ADE80' : '#71717A';
    $('#v-bpm').style.color = isFlat ? '#71717A' : bpmColor;
    $('#v-spo2').style.color = isFlat ? '#71717A' : (op.spo2 < 90 ? '#FCA5A5' : '#F4F4F5');

    const statusLbl = $('#ecg-status-lbl');
    if (runtime.dropMode !== 'ok') {
      statusLbl.textContent = 'IMU IMPACT // DROP DETECTED';
      statusLbl.style.color = '#FACC15';
    } else if (lvl === 'BLACK') {
      statusLbl.textContent = 'ASYSTOLE // UNRESPONSIVE';
      statusLbl.style.color = '#71717A';
    } else if (lvl === 'RED') {
      statusLbl.textContent = 'CRITICAL // IMMEDIATE MEDEVAC';
      statusLbl.style.color = '#FCA5A5';
    } else {
      statusLbl.textContent = 'SINUS RHYTHM // TELEMETRY NOMINAL';
      statusLbl.style.color = '#4ADE80';
    }
  }

  async function cycleSelectedOperatorPriority() {
    const op = getActiveOperator();
    if (!op) return;
    const nextIdx = (TRIAGE_LEVELS.indexOf(op.triageLevel) + 1) % TRIAGE_LEVELS.length;
    op.triageLevel = TRIAGE_LEVELS[nextIdx];
    if (op.triageLevel === 'RED') { op.bpm = 136; op.spo2 = 85; }
    else if (op.triageLevel === 'YELLOW') { op.bpm = 106; op.spo2 = 93; }
    else if (op.triageLevel === 'GREEN') { op.bpm = 78; op.spo2 = 99; }
    else { op.bpm = 0; op.spo2 = 0; }

    ecgState.reset = true;
    if (window.updateSquadVitals) {
      try {
        await window.updateSquadVitals(op.operatorId, {
          bpm: op.bpm,
          spo2: op.spo2,
          triageLevel: op.triageLevel
        });
      } catch (e) {}
    }
    renderVitalsMonitor();
    renderSquadRoster();
  }

  function simulateGearDrop() {
    if (runtime.dropMode !== 'ok') return;
    const now = performance.now();
    runtime.dropMode = 'drop';
    runtime.dropDeadline = now + 15000;
    $('#drop-card').hidden = false;
    $('#drop-card').classList.remove('alarm');
    renderVitalsMonitor();
  }

  function cancelGearDrop() {
    runtime.dropMode = 'ok';
    $('#drop-card').hidden = true;
    $('#drop-card').classList.remove('alarm');
    ecgState.reset = true;
    renderVitalsMonitor();
  }

  function tickSmartDrop(now) {
    if (runtime.dropMode !== 'drop') return;
    const rem = Math.max(0, runtime.dropDeadline - now);
    $('#dc-fill').style.width = ((rem / 15000) * 100).toFixed(1) + '%';
    $('#dc-count').textContent = Math.ceil(rem / 1000) + 'S';
    if (rem <= 0) {
      runtime.dropMode = 'alarm';
      $('#drop-card').classList.add('alarm');
      $('#dc-title').textContent = '[!] SENSOR UNSEATED > 15S // MEDIC CHECK REQUIRED';
    }
  }

  function sampleEcgWaveform(t, op) {
    if (runtime.dropMode !== 'ok' || op.triageLevel === 'BLACK' || op.bpm <= 0) {
      return (Math.random() - 0.5) * 0.03;
    }
    const period = 60 / clamp(op.bpm, 40, 180);
    const p = (t % period) / period;
    const G = (m, s, a) => a * Math.exp(-((p - m) ** 2) / (2 * s * s));
    return G(0.12, 0.025, 0.14) + G(0.215, 0.008, -0.14) + G(0.245, 0.01, 1.0) + G(0.275, 0.009, -0.26) + G(0.48, 0.04, 0.24) + (Math.random() - 0.5) * 0.02;
  }

  function drawEcgCanvas(now) {
    const c = ecgState.c, d = DPR(), W = c.width / d, H = c.height / d;
    if (W < 10 || H < 10) return;
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const t = now / 1000;
    const op = getActiveOperator();

    if (ecgState.reset) {
      g.fillStyle = '#050507';
      g.fillRect(0, 0, W, H);
      ecgState.x = 0;
      ecgState.prev = null;
      ecgState.lastT = t;
      ecgState.reset = false;
      return;
    }

    const dt = Math.min(Math.max(t - ecgState.lastT, 0), 0.1);
    const speed = W / 2.8;
    const dist = dt * speed;
    const steps = Math.max(1, Math.ceil(dist));

    const strokeCol = (runtime.dropMode !== 'ok' || op.triageLevel === 'BLACK') ? '#71717A'
      : op.triageLevel === 'RED' ? '#DC2626'
      : op.triageLevel === 'YELLOW' ? '#FACC15' : '#4ADE80';

    g.strokeStyle = strokeCol;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.lineCap = 'round';

    for (let i = 1; i <= steps; i++) {
      const tt = ecgState.lastT + (dt * i) / steps;
      let x = ecgState.x + dist / steps;
      if (x >= W) { x = 0; ecgState.prev = null; }
      g.fillStyle = '#050507';
      g.fillRect(x, 0, 12, H);
      const y = H * 0.62 - sampleEcgWaveform(tt, op) * H * 0.46;
      if (ecgState.prev) {
        g.beginPath();
        g.moveTo(ecgState.prev.x, ecgState.prev.y);
        g.lineTo(x, y);
        g.stroke();
      }
      ecgState.prev = { x, y };
      ecgState.x = x;
    }
    ecgState.lastT = t;
  }

  /* =====================================================================
     7. SCREEN 3: FLIR (THERMAL / LIDAR / CONTACT / ASSIST)
     ===================================================================== */
  const SW = 32, SH = 24, UP = 4;
  const flir = {
    c: $('#flir-canvas'),
    video: $('#flir-video'),
    stream: null,
    frame: new Float32Array(SW * SH),
    off: document.createElement('canvas'),
    lastCapture: 0,
    cross: { x: 0.5, y: 0.5 },
    hot: null
  };
  flir.off.width = SW * UP;
  flir.off.height = SH * UP;
  flir.octx = flir.off.getContext('2d');
  flir.img = flir.octx.createImageData(SW * UP, SH * UP);

  function ironbowRgb(val) {
    const x = clamp(val / 255, 0, 1);
    const r = clamp(Math.round(255 * Math.min(1, Math.max(0, (x - 0.15) * 1.65))), 0, 255);
    const g = clamp(Math.round(255 * Math.pow(Math.max(0, x - 0.35) / 0.65, 1.4)), 0, 255);
    const b = clamp(Math.round(255 * (x < 0.45 ? x * 1.8 : Math.max(0, (0.85 - x) * 1.6) + (x > 0.85 ? (x - 0.85) * 6 : 0))), 0, 255);
    return [r, g, b];
  }

  function sampleSyntheticThermal(az, el) {
    const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;
    const dx = wrap(az - 6);
    const head = dx * dx + (el - 8) * (el - 8) < 6;
    const torso = Math.abs(dx) < 3.6 && el < 6 && el > -6;
    const limbs = Math.abs(dx) < 5.0 && el <= -6 && el > -16;
    if (head || torso) return 37.2;
    if (limbs) return 35.4;
    return 14.5 + (17.5 - el) * 0.22 + Math.sin(az * 0.1) * 1.2;
  }

  function updateFlirFrame() {
    const f = flir.frame;
    const ph = 55 / SW, pv = 35 / SH;
    let maxT = -99, sx = 0, sy = 0, count = 0, i0 = 99, i1 = -1, j0 = 99, j1 = -1;

    for (let j = 0; j < SH; j++) {
      for (let i = 0; i < SW; i++) {
        const az = appState.sensors.panAz + (i - 15.5) * ph;
        const el = (11.5 - j) * pv;
        const T = sampleSyntheticThermal(az, el) + (Math.random() - 0.5) * 0.45;
        f[j * SW + i] = T;
        if (T > maxT) maxT = T;
        if (T >= 33.5) {
          sx += i + 0.5; sy += j + 0.5; count++;
          if (i < i0) i0 = i; if (i > i1) i1 = i;
          if (j < j0) j0 = j; if (j > j1) j1 = j;
        }
      }
    }

    if (count >= 4) {
      flir.hot = { cx: sx / count / SW, cy: sy / count / SH, x0: i0 / SW, x1: (i1 + 1) / SW, y0: j0 / SH, y1: (j1 + 1) / SH };
      appState.sensors.bodyDetected = true;
      appState.sensors.detectedTemp = maxT;
    } else {
      flir.hot = null;
      appState.sensors.bodyDetected = false;
      appState.sensors.detectedTemp = maxT;
    }

    const D = flir.img.data, w = SW * UP, h = SH * UP;
    const thermalOn = appState.sensors.thermalActive;

    for (let y = 0; y < h; y++) {
      const syP = clamp((y + 0.5) / UP - 0.5, 0, SH - 1), jA = Math.floor(syP), jB = Math.min(jA + 1, SH - 1), fy = syP - jA;
      for (let x = 0; x < w; x++) {
        const sxP = clamp((x + 0.5) / UP - 0.5, 0, SW - 1), iA = Math.floor(sxP), iB = Math.min(iA + 1, SW - 1), fx = sxP - iA;
        const T = (f[jA * SW + iA] * (1 - fx) + f[jA * SW + iB] * fx) * (1 - fy) +
                  (f[jB * SW + iA] * (1 - fx) + f[jB * SW + iB] * fx) * fy;
        const norm = clamp(((T - 13) / 25) * 255, 0, 255);
        const o = (y * w + x) * 4;
        if (thermalOn) {
          const [r, g, b] = ironbowRgb(norm);
          D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = 255;
        } else {
          const lum = clamp(norm * 0.75 + 18, 10, 230);
          D[o] = Math.round(lum * 0.72);
          D[o + 1] = Math.round(lum * 0.95);
          D[o + 2] = Math.round(lum * 0.76);
          D[o + 3] = 255;
        }
      }
    }
    flir.octx.putImageData(flir.img, 0, 0);
  }

  function drawFlirCanvas(now) {
    const c = flir.c, d = DPR(), W = c.width / d, H = c.height / d;
    if (W < 10 || H < 10) return;
    appState.sensors.panAz += (appState.sensors.panTarget - appState.sensors.panAz) * 0.14;

    if (now - flir.lastCapture > 65) {
      flir.lastCapture = now;
      updateFlirFrame();
      updateFlirHudUI();
    }

    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#050507';
    g.fillRect(0, 0, W, H);

    if (appState.sensors.liveCamActive && flir.video.readyState >= 2) {
      g.drawImage(flir.video, 0, 0, W, H);
      if (appState.sensors.thermalActive) {
        g.fillStyle = 'rgba(250, 120, 20, 0.28)';
        g.fillRect(0, 0, W, H);
      }
    } else {
      g.drawImage(flir.off, 0, 0, W, H);
    }

    if (appState.sensors.lidarActive) {
      g.save();
      g.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      g.fillStyle = '#38BDF8';
      g.lineWidth = 1;
      const cols = 12, rows = 9;
      for (let r = 1; r < rows; r++) {
        g.beginPath();
        for (let col = 1; col < cols; col++) {
          const px = (col / cols) * W;
          const py = (r / rows) * H + Math.sin(now / 400 + col * 0.6) * 3;
          if (col === 1) g.moveTo(px, py); else g.lineTo(px, py);
          g.fillRect(px - 1.5, py - 1.5, 3, 3);
        }
        g.stroke();
      }
      g.font = FONT(10, 900);
      g.fillStyle = '#38BDF8';
      g.fillText('LIDAR ToF // 14.2M PROXIMITY MESH', 12, H - 46);
      g.restore();
    }

    const h = flir.hot;
    const tgt = h ? { x: h.cx, y: h.cy } : { x: 0.5 + 0.25 * Math.sin(now / 700), y: 0.5 };
    flir.cross.x += (tgt.x - flir.cross.x) * 0.2;
    flir.cross.y += (tgt.y - flir.cross.y) * 0.2;
    const cx = flir.cross.x * W, cy = flir.cross.y * H;

    g.strokeStyle = h ? '#FACC15' : '#F4F4F5';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 18, cy); g.lineTo(cx - 6, cy);
    g.moveTo(cx + 6, cy); g.lineTo(cx + 18, cy);
    g.moveTo(cx, cy - 18); g.lineTo(cx, cy - 6);
    g.moveTo(cx, cy + 6); g.lineTo(cx, cy + 18);
    g.stroke();

    if (h) {
      const x0 = h.x0 * W, x1 = h.x1 * W, y0 = h.y0 * H, y1 = h.y1 * H;
      g.strokeStyle = '#DC2626';
      g.lineWidth = 2.5;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#DC2626';
      g.fillRect(x0, Math.max(0, y0 - 18), 96, 18);
      g.fillStyle = '#FFFFFF';
      g.font = FONT(10, 900);
      g.fillText('LOCK ' + appState.sensors.detectedTemp.toFixed(1) + '°C', x0 + 5, Math.max(12, y0 - 5));
    }
  }

  function updateFlirHudUI() {
    const s = appState.sensors;
    const sign = s.panAz >= 0 ? '+' : '-';
    $('#flir-az-pill').textContent = 'AZ ' + sign + String(Math.round(Math.abs(s.panAz))).padStart(3, '0') + '° // 16HZ';
    $('#flir-mode-pill').textContent = 'MODE: ' + (s.thermalActive ? 'IRONBOW THERMAL' : 'OPTICAL RGB');
    $('#flir-lidar-txt').textContent = s.lidarActive ? 'LIDAR: 14.2M' : 'DEPTH: OFF';

    const strip = $('#flir-status-strip');
    const txt = $('#flir-hud-txt');
    if (s.bodyDetected) {
      strip.classList.add('detected');
      txt.textContent = '[+] ' + s.detectedTemp.toFixed(1) + '°C // HUMAN SIGNATURE LOCKED';
    } else {
      strip.classList.remove('detected');
      txt.textContent = '[ ] SWEEPING SECTOR // NO BIOLOGICAL HEAT';
    }

    $('#btn-lidar').classList.toggle('cyan-on', s.lidarActive);
    $('#lidar-sub').textContent = s.lidarActive ? 'DEPTH MESH: ON' : 'DEPTH IR MESH: OFF';

    $('#btn-thermal').classList.toggle('amber-on', s.thermalActive);
    $('#thermal-sub').textContent = s.thermalActive ? 'IRONBOW IR: ACTIVE' : 'STANDARD OPTICAL';
  }

  function stampContactFound() {
    const temp = appState.sensors.detectedTemp.toFixed(1);
    appState.contacts.push({
      type: 'CONTACT',
      label: 'CONTACT ' + temp + '°C',
      lat: appState.telemetry.lat,
      lon: appState.telemetry.lon
    });
    appState.opticalDraft.cat = 'THERMAL';
    appState.opticalDraft.msg = 'THERMAL CONTACT CONFIRMED';
    $('#optical-custom-msg').value = appState.opticalDraft.msg;
    $('#btn-contact').classList.add('green-on');
    $('#contact-sub').textContent = 'PIN STAMPED TO MAP!';
    setTimeout(() => {
      $('#btn-contact').classList.remove('green-on');
      $('#contact-sub').textContent = 'STAMP THERMAL PIN';
    }, 1800);
    updateMapHudUI();
  }

  function stampAssistBackup() {
    appState.assistActive = !appState.assistActive;
    const btn = $('#btn-assist');
    btn.classList.toggle('sos', appState.assistActive);
    btn.classList.toggle('active', appState.assistActive);
    $('#assist-sub').textContent = appState.assistActive ? 'BACKUP REQUESTED!' : 'REINFORCE POS';
    if (appState.assistActive) {
      appState.contacts.push({
        type: 'ASSIST',
        label: 'URGENT ASSIST',
        lat: appState.telemetry.lat,
        lon: appState.telemetry.lon
      });
    }
    updateMapHudUI();
  }

  async function toggleFlirLiveCam() {
    if (appState.sensors.liveCamActive) {
      stopFlirCamera();
      $('#btn-cam-toggle').textContent = 'OPTICAL CAM: SIM';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      flir.stream = stream;
      flir.video.srcObject = stream;
      await flir.video.play();
      appState.sensors.liveCamActive = true;
      $('#btn-cam-toggle').textContent = 'OPTICAL CAM: LIVE';
    } catch (e) {
      appState.sensors.liveCamActive = false;
      $('#btn-cam-toggle').textContent = 'OPTICAL CAM: SIM';
    }
  }

  function stopFlirCamera() {
    appState.sensors.liveCamActive = false;
    if (flir.stream) {
      flir.stream.getTracks().forEach((t) => t.stop());
      flir.stream = null;
    }
  }

  /* =====================================================================
     8. NAVIGATION, MODALS & 2.5S HOLD DESTRUCT (`zeroizeDatabase()`)
     ===================================================================== */
  const VALID_TABS = ['maps', 'triage', 'flir'];
  function switchTab(tabName) {
    if (runtime.sterile || !VALID_TABS.includes(tabName)) return;
    appState.activeTab = tabName;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + tabName));
    $$('.dock-tab').forEach((t) => {
      const on = t.dataset.tab === tabName;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    fitAllCanvases();
    if (tabName === 'triage') ecgState.reset = true;
  }

  function openModal(name) {
    if (runtime.sterile) return;
    closeModal();
    runtime.modal = name;
    const m = $('#modal-' + name);
    if (m) m.classList.add('open');
    if (name === 'optical') {
      switchOpticalSubtab('tx');
    }
    if (name === 'zero') {
      $('#zero-slider').value = 0;
    }
  }

  function closeModal() {
    if (!runtime.modal) return;
    stopRxCamera();
    const m = $('#modal-' + runtime.modal);
    if (m) m.classList.remove('open');
    runtime.modal = null;
  }

  const destructHold = { active: false, startTs: 0, rafId: 0, DURATION: 2500 };

  function startDestructHold(e) {
    if (runtime.sterile) return;
    if (e.type === 'mousedown' && e.button !== 0) return;
    destructHold.active = true;
    destructHold.startTs = performance.now();
    $('#btn-destruct').classList.add('holding');

    const tick = (now) => {
      if (!destructHold.active) return;
      const elapsed = now - destructHold.startTs;
      const pct = clamp((elapsed / destructHold.DURATION) * 100, 0, 100);
      $('#destruct-fill').style.width = pct.toFixed(1) + '%';
      const remSec = Math.max(0, (destructHold.DURATION - elapsed) / 1000).toFixed(1);
      $('#destruct-main').textContent = 'WIPING ' + remSec + 'S';
      if (elapsed >= destructHold.DURATION) {
        destructHold.active = false;
        executeZeroizeProtocol();
        return;
      }
      destructHold.rafId = requestAnimationFrame(tick);
    };
    destructHold.rafId = requestAnimationFrame(tick);
  }

  function endDestructHold() {
    if (!destructHold.active) return;
    const elapsed = performance.now() - destructHold.startTs;
    destructHold.active = false;
    cancelAnimationFrame(destructHold.rafId);
    $('#btn-destruct').classList.remove('holding');
    $('#destruct-fill').style.width = '0%';
    $('#destruct-main').textContent = 'DESTRUCT';
    if (elapsed < 450) {
      openModal('zero');
    }
  }

  async function executeZeroizeProtocol() {
    if (runtime.sterile) return;
    runtime.sterile = true;
    cancelAnimationFrame(runtime.raf);
    stopRxCamera();
    stopFlirCamera();

    if (window.zeroizeTacticalData) {
      await window.zeroizeTacticalData();
    } else {
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    }

    document.body.classList.add('flash');
    setTimeout(() => {
      document.body.classList.remove('flash');
      document.body.innerHTML = `
        <div id="sterile">
          <div class="sterile-box">
            <div style="font-size:16px;font-weight:900;color:var(--alert-red);letter-spacing:0.06em">[!] VITAL-X // TacticalEdgeDB ZEROIZED</div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.4">
              INDEXEDDB OBJECT STORES (tactical_messages, hazards, squad_triage, optical_packets), LOCAL STORAGE &amp; SESSION STORAGE PURGED (0x00).
            </div>
            <button class="btn on" id="reboot-btn" style="margin-top:8px">[ RE-INITIALIZE DB // DEMO RESTORE ]</button>
          </div>
        </div>
      `;
      const rb = document.getElementById('reboot-btn');
      if (rb) rb.addEventListener('click', () => location.reload());
    }, 180);
  }

  /* =====================================================================
     9. CANVAS RESIZE, EVENT LISTENERS & DB BOOTSTRAP
     ===================================================================== */
  function fitCanvasToParent(c) {
    if (!c || !c.parentElement) return false;
    const r = c.parentElement.getBoundingClientRect();
    const d = DPR();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) {
      c.width = Math.round(w * d);
      c.height = Math.round(h * d);
      return true;
    }
    return false;
  }

  function fitAllCanvases() {
    if (appState.activeTab === 'maps') fitCanvasToParent(mapCanvas);
    if (appState.activeTab === 'triage' && fitCanvasToParent(ecgState.c)) ecgState.reset = true;
    if (appState.activeTab === 'flir') fitCanvasToParent(flir.c);
  }

  function mainLoop(now) {
    if (runtime.sterile) return;
    runtime.raf = requestAnimationFrame(mainLoop);
    if (appState.activeTab === 'maps') drawMapCanvas(now);
    else if (appState.activeTab === 'triage') drawEcgCanvas(now);
    else if (appState.activeTab === 'flir') drawFlirCanvas(now);
    tickSmartDrop(now);
  }

  function bindEvents() {
    $$('.dock-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('#btn-beacon').addEventListener('click', () => openModal('optical'));
    $('#btn-comms').addEventListener('click', () => openModal('optical'));

    const destBtn = $('#btn-destruct');
    destBtn.addEventListener('mousedown', startDestructHold);
    destBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startDestructHold(e); }, { passive: false });
    window.addEventListener('mouseup', endDestructHold);
    window.addEventListener('touchend', endDestructHold);
    window.addEventListener('touchcancel', endDestructHold);

    $('#zero-slider').addEventListener('input', (e) => {
      if (+e.target.value >= 96) executeZeroizeProtocol();
    });
    $('#zero-slider').addEventListener('change', (e) => {
      if (+e.target.value < 96) e.target.value = 0;
    });

    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));

    $('#tab-tx').addEventListener('click', () => switchOpticalSubtab('tx'));
    $('#tab-rx').addEventListener('click', () => switchOpticalSubtab('rx'));

    $$('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.preset-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        appState.opticalDraft.cat = chip.dataset.cat;
        appState.opticalDraft.msg = chip.dataset.msg;
        $('#optical-custom-msg').value = chip.dataset.msg;
        updateOpticalInspectorAndQR();
      });
    });

    $('#optical-custom-msg').addEventListener('input', (e) => {
      const val = e.target.value;
      appState.opticalDraft.msg = val;
      const matchingChip = $$('.preset-chip').find((c) => c.dataset.msg === val);
      $$('.preset-chip').forEach((c) => c.classList.toggle('active', c === matchingChip));
      appState.opticalDraft.cat = matchingChip ? matchingChip.dataset.cat : 'CUSTOM';
      updateOpticalInspectorAndQR();
    });

    $('#btn-transmit-frame').addEventListener('click', transmitAndSaveOpticalFrame);

    $('#rx-retry-btn').addEventListener('click', startRxCamera);
    $('#rx-sim-btn').addEventListener('click', simulateIncomingOpticalPacket);
    $('#rx-import-btn').addEventListener('click', ingestScannedOpticalPacket);
    $('#rx-again-btn').addEventListener('click', startRxCamera);

    // Maps Screen 2x2 Pad + Tactical Canvas Waypoint Pin Drop
    $('#btn-sos').addEventListener('click', triggerSos);
    $('#btn-nogo').addEventListener('click', dropNoGoHazard);
    $('#btn-sync').addEventListener('click', triggerSyncPos);
    $('#hud-clear-haz').addEventListener('click', clearAllHazards);
    if (mapCanvas) {
      mapCanvas.addEventListener('click', handleMapCanvasTap);
    }

    // Triage Screen Controls
    $('#btn-cycle-priority').addEventListener('click', cycleSelectedOperatorPriority);
    $('#btn-sim-drop').addEventListener('click', simulateGearDrop);
    $('#cancel-drop-btn').addEventListener('click', cancelGearDrop);

    // FLIR Screen Controls
    $('#btn-lidar').addEventListener('click', () => {
      appState.sensors.lidarActive = !appState.sensors.lidarActive;
      updateFlirHudUI();
    });
    $('#btn-thermal').addEventListener('click', () => {
      appState.sensors.thermalActive = !appState.sensors.thermalActive;
      updateFlirHudUI();
    });
    $('#btn-contact').addEventListener('click', stampContactFound);
    $('#btn-assist').addEventListener('click', stampAssistBackup);
    $('#scan-l').addEventListener('click', () => { appState.sensors.panTarget -= 16; });
    $('#scan-r').addEventListener('click', () => { appState.sensors.panTarget += 16; });
    $('#btn-cam-toggle').addEventListener('click', toggleFlirLiveCam);

    setInterval(() => {
      if (runtime.sterile || runtime.dropMode !== 'ok') return;
      appState.squad.forEach((op) => {
        if (op.triageLevel === 'BLACK') return;
        const delta = Math.round((Math.random() - 0.5) * 3);
        const baseBpm = op.triageLevel === 'RED' ? 136 : op.triageLevel === 'YELLOW' ? 106 : 78;
        op.bpm = clamp(op.bpm + delta, baseBpm - 6, baseBpm + 6);
      });
      renderVitalsMonitor();
      renderSquadRoster();
    }, 1600);

    window.addEventListener('resize', fitAllCanvases);
    if (window.ResizeObserver) new ResizeObserver(fitAllCanvases).observe($('#stage'));
  }

  async function bootstrapApp() {
    registerServiceWorkerAndNetworkHooks();
    bindEvents();
    fitAllCanvases();

    if (window.initTacticalDB) {
      try {
        await window.initTacticalDB();
        if (window.getAllSquadMembers) {
          const dbSquad = await window.getAllSquadMembers();
          if (dbSquad && dbSquad.length === 8) {
            appState.squad = dbSquad;
          }
        }
        if (window.getActiveHazards) {
          appState.hazards = await window.getActiveHazards();
        }
        if (window.getLastTelemetryFix) {
          const cachedPos = await window.getLastTelemetryFix();
          if (cachedPos && Array.isArray(cachedPos.geo)) {
            appState.telemetry.lat = cachedPos.geo[0];
            appState.telemetry.lon = cachedPos.geo[1];
            appState.telemetry.acc = cachedPos.accuracy || 4;
          }
        }
        await refreshRecentMessagesUI();
        if (window.runTacticalDBSelfTest) {
          await window.runTacticalDBSelfTest();
        }
      } catch (err) {
        $('#hud-engine').textContent = 'IDB: MEMORY FALLBACK';
      }
    }

    updateMapHudUI();
    renderSquadRoster();
    renderVitalsMonitor();
    updateFlirHudUI();
    updateOpticalInspectorAndQR();

    runtime.raf = requestAnimationFrame(mainLoop);
  }

  bootstrapApp();
})();

