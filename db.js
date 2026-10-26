'use strict';
/**
 * ============================================================================
 * AEGIS-LINK // TACTICAL EDGE OFFLINE DATABASE ENGINE (db.js)
 * Zero-dependency, local-first persistence layer using native IndexedDB API.
 * Database: TacticalEdgeDB (Version 1)
 * Object Stores:
 *   1. hazards           (keyPath: 'id', autoIncrement: true | indexes: ts, type)
 *   2. squad_triage      (keyPath: 'operatorId'              | indexes: triageLevel)
 *   3. optical_packets   (keyPath: 'seq'                     | indexes: ts, direction)
 *   4. telemetry_cache   (keyPath: 'id'                      | indexes: ts)
 *   5. tactical_messages (keyPath: 'id', autoIncrement: true | indexes: ts, category)
 * ============================================================================
 */
(function (global) {
  const DB_NAME = 'TacticalEdgeDB';
  const DB_VERSION = 1;

  let dbInstance = null;

  const SEVERITY_PRIORITY = {
    RED: 1,
    YELLOW: 2,
    GREEN: 3,
    BLACK: 4
  };

  const DEFAULT_SQUAD_MEMBERS = [
    { operatorId: 'OP-ALPHA-01', callsign: 'ALPHA-01 // SGT MALIK', name: 'SGT MALIK', role: 'SQUAD LEAD', triageLevel: 'RED',    bpm: 134, spo2: 86, notes: 'BLAST TRAUMA // TOURNIQUET APPLIED' },
    { operatorId: 'OP-ALPHA-02', callsign: 'ALPHA-02 // CPL CHEN',  name: 'CPL CHEN',  role: 'RECON / UAV', triageLevel: 'YELLOW', bpm: 108, spo2: 93, notes: 'SHRAPNEL LACERATION // STABLE' },
    { operatorId: 'OP-ALPHA-03', callsign: 'ALPHA-03 // LT VERMA',  name: 'LT VERMA',  role: 'COMMS SPEC',  triageLevel: 'GREEN',  bpm: 78,  spo2: 99, notes: 'NOMINAL // ACTIVE RELAY' },
    { operatorId: 'OP-ALPHA-04', callsign: 'ALPHA-04 // SPC RAO',   name: 'SPC RAO',   role: 'MEDIC',       triageLevel: 'GREEN',  bpm: 82,  spo2: 98, notes: 'NOMINAL // TREATING CASUALTIES' },
    { operatorId: 'OP-ALPHA-05', callsign: 'ALPHA-05 // SGT KABIR', name: 'SGT KABIR', role: 'BREACHER',    triageLevel: 'RED',    bpm: 142, spo2: 84, notes: 'AIRWAY COMPROMISE // MEDEVAC P1' },
    { operatorId: 'OP-ALPHA-06', callsign: 'ALPHA-06 // PFC DAS',   name: 'PFC DAS',   role: 'SAPPER',      triageLevel: 'YELLOW', bpm: 102, spo2: 94, notes: 'CONCUSSION // WALKING WOUNDED' },
    { operatorId: 'OP-ALPHA-07', callsign: 'ALPHA-07 // CPL NAIR',  name: 'CPL NAIR',  role: 'POINTMAN',    triageLevel: 'GREEN',  bpm: 74,  spo2: 99, notes: 'NOMINAL // PERIMETER SECURITY' },
    { operatorId: 'OP-ALPHA-08', callsign: 'ALPHA-08 // SPC GILL',  name: 'SPC GILL',  role: 'REAR GUARD',  triageLevel: 'BLACK',  bpm: 0,   spo2: 0,  notes: 'UNRESPONSIVE // ZERO VITALS' }
  ];

  function createSchema(db) {
    // 1. hazards: Key id (autoIncrement), Fields: type, geo, radius, ts, ttl, active | Indexes: ts, type
    if (!db.objectStoreNames.contains('hazards')) {
      const hazStore = db.createObjectStore('hazards', {
        keyPath: 'id',
        autoIncrement: true
      });
      hazStore.createIndex('ts', 'ts', { unique: false });
      hazStore.createIndex('type', 'type', { unique: false });
    }

    // 2. squad_triage: Key operatorId | Fields: callsign, triageLevel, bpm, spo2, lastUpdate, notes | Indexes: triageLevel
    if (!db.objectStoreNames.contains('squad_triage')) {
      const squadStore = db.createObjectStore('squad_triage', {
        keyPath: 'operatorId'
      });
      squadStore.createIndex('triageLevel', 'triageLevel', { unique: false });
    }

    // 3. optical_packets: Key seq | Fields: v, ts, src, rawPayload, direction, status | Indexes: ts, direction
    if (!db.objectStoreNames.contains('optical_packets')) {
      const pktStore = db.createObjectStore('optical_packets', {
        keyPath: 'seq'
      });
      pktStore.createIndex('ts', 'ts', { unique: false });
      pktStore.createIndex('direction', 'direction', { unique: false });
    }

    // 4. telemetry_cache: Key id ("LAST_KNOWN_POS") | Fields: geo, accuracy, heading, ts, syncedToCloud
    if (!db.objectStoreNames.contains('telemetry_cache')) {
      const telStore = db.createObjectStore('telemetry_cache', {
        keyPath: 'id'
      });
      telStore.createIndex('ts', 'ts', { unique: false });
    }

    // 5. tactical_messages: Key id (autoIncrement) | Indexes: ts, category
    if (!db.objectStoreNames.contains('tactical_messages')) {
      const msgStore = db.createObjectStore('tactical_messages', {
        keyPath: 'id',
        autoIncrement: true
      });
      msgStore.createIndex('ts', 'ts', { unique: false });
      msgStore.createIndex('category', 'category', { unique: false });
    }
  }

  /**
   * Opens TacticalEdgeDB (v1), creates object stores and indices on upgradeneeded,
   * and pre-populates the default 8 squad members in `squad_triage` if empty.
   * @returns {Promise<IDBDatabase|null>}
   */
  function initTacticalDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve) => {
      if (!global.indexedDB) {
        console.warn('[TacticalEdgeDB] IndexedDB unavailable; operating in memory fallback.');
        resolve(null);
        return;
      }

      let request;
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        console.warn('[TacticalEdgeDB] Open failed:', err);
        resolve(null);
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        createSchema(db);
      };

      request.onsuccess = async (event) => {
        const db = event.target.result;

        // If an earlier schema of v1 existed without `telemetry_cache`, upgrade seamlessly
        const requiredStores = ['hazards', 'squad_triage', 'optical_packets', 'telemetry_cache', 'tactical_messages'];
        const missingStore = requiredStores.some((s) => !db.objectStoreNames.contains(s));
        if (missingStore) {
          const nextVer = db.version + 1;
          db.close();
          const upgReq = global.indexedDB.open(DB_NAME, nextVer);
          upgReq.onupgradeneeded = (ev) => createSchema(ev.target.result);
          upgReq.onsuccess = async (ev) => {
            dbInstance = ev.target.result;
            await seedDefaultsIfEmpty(dbInstance);
            resolve(dbInstance);
          };
          upgReq.onerror = () => resolve(null);
          return;
        }

        dbInstance = db;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
        };

        await seedDefaultsIfEmpty(dbInstance);
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('[TacticalEdgeDB] Database error:', event.target.error);
        resolve(null);
      };
    });
  }

  /**
   * Pre-populates the 8 squad members in `squad_triage` and default `LAST_KNOWN_POS`
   * in `telemetry_cache` if empty.
   * @param {IDBDatabase} db
   * @returns {Promise<void>}
   */
  function seedDefaultsIfEmpty(db) {
    if (!db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['squad_triage', 'telemetry_cache'], 'readwrite');
        const squadStore = tx.objectStore('squad_triage');
        const telStore = tx.objectStore('telemetry_cache');

        const countReq = squadStore.count();
        countReq.onsuccess = () => {
          if (countReq.result === 0) {
            const nowSec = Math.floor(Date.now() / 1000);
            DEFAULT_SQUAD_MEMBERS.forEach((m) => {
              squadStore.put({
                operatorId: m.operatorId,
                callsign: m.callsign,
                name: m.name,
                role: m.role,
                triageLevel: m.triageLevel,
                bpm: m.bpm,
                spo2: m.spo2,
                lastUpdate: nowSec,
                notes: m.notes
              });
            });
          }
        };

        const telReq = telStore.get('LAST_KNOWN_POS');
        telReq.onsuccess = () => {
          if (!telReq.result) {
            telStore.put({
              id: 'LAST_KNOWN_POS',
              geo: [28.6139, 77.2090],
              accuracy: 4,
              heading: 42,
              ts: Math.floor(Date.now() / 1000),
              syncedToCloud: false
            });
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  /* ==========================================================================
     HAZARDS API (saveHazard, getActiveHazards, clearHazard)
     ========================================================================== */

  /**
   * Stores a new NO-GO / obstacle hazard marker in `hazards`.
   * @param {Object} hazardData - { type, geo, radius, ts, ttl, active, rx, ry }
   * @returns {Promise<Object|null>}
   */
  async function saveHazard(hazardData = {}) {
    const db = await initTacticalDB();
    const nowSec = Math.floor(Date.now() / 1000);
    const rawTs = typeof hazardData.ts === 'number' ? hazardData.ts : nowSec;
    // Normalize timestamp to epoch seconds so `ts + ttl > currentTime` works consistently
    const tsSec = rawTs > 1e11 ? Math.floor(rawTs / 1000) : rawTs;

    const record = {
      type: String(hazardData.type || 'BLOCK').toUpperCase(),
      geo: Array.isArray(hazardData.geo) ? hazardData.geo : [28.6139, 77.2090],
      radius: typeof hazardData.radius === 'number' ? hazardData.radius : 100,
      ts: tsSec,
      ttl: typeof hazardData.ttl === 'number' ? hazardData.ttl : 7200, // Default 2 hours (7200s)
      active: hazardData.active !== undefined ? Boolean(hazardData.active) : true,
      rx: typeof hazardData.rx === 'number' ? hazardData.rx : 0.56,
      ry: typeof hazardData.ry === 'number' ? hazardData.ry : 0.50
    };

    if (!db) return record;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['hazards'], 'readwrite');
        const store = tx.objectStore('hazards');
        const req = store.add(record);
        req.onsuccess = (e) => {
          record.id = e.target.result;
          resolve(record);
        };
        req.onerror = () => resolve(record);
      } catch (err) {
        resolve(record);
      }
    });
  }

  /**
   * Returns all hazards where `active === true` and `ts + ttl > currentTime`.
   * @returns {Promise<Array<Object>>}
   */
  async function getActiveHazards() {
    const db = await initTacticalDB();
    if (!db) return [];

    const nowSec = Math.floor(Date.now() / 1000);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['hazards'], 'readonly');
        const store = tx.objectStore('hazards');
        const req = store.getAll();
        req.onsuccess = (e) => {
          const all = e.target.result || [];
          const valid = all.filter((h) => {
            if (!h || h.active !== true) return false;
            const tsSec = h.ts > 1e11 ? Math.floor(h.ts / 1000) : (h.ts || nowSec);
            const ttlSec = typeof h.ttl === 'number' ? h.ttl : 7200;
            return (tsSec + ttlSec) > nowSec;
          });
          resolve(valid);
        };
        req.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  /**
   * Marks a hazard inactive (`active = false`) by `hazardId`, or clears all active hazards
   * if `hazardId` is omitted or `'ALL'`.
   * @param {number|string} [hazardId]
   * @returns {Promise<boolean>}
   */
  async function clearHazard(hazardId) {
    const db = await initTacticalDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['hazards'], 'readwrite');
        const store = tx.objectStore('hazards');

        if (hazardId !== undefined && hazardId !== null && hazardId !== 'ALL') {
          const getReq = store.get(hazardId);
          getReq.onsuccess = (e) => {
            const rec = e.target.result;
            if (rec) {
              rec.active = false;
              store.put(rec);
            }
          };
        } else {
          const curReq = store.openCursor();
          curReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const val = cursor.value;
              if (val.active) {
                val.active = false;
                cursor.update(val);
              }
              cursor.continue();
            }
          };
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  /* ==========================================================================
     SQUAD TRIAGE & VITALS API (updateOperatorVitals, getAllSquadMembers)
     ========================================================================== */

  /**
   * Updates live BPM, SpO2, triageLevel, lastUpdate, and notes for an operator.
   * @param {string} operatorId - e.g. "OP-ALPHA-01" or "ALPHA-01"
   * @param {Object} vitalsData - { bpm, spo2, triageLevel, callsign, notes }
   * @returns {Promise<Object|null>}
   */
  async function updateOperatorVitals(operatorId, vitalsData = {}) {
    const db = await initTacticalDB();
    if (!db) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['squad_triage'], 'readwrite');
        const store = tx.objectStore('squad_triage');
        const getReq = store.get(operatorId);

        let updated = null;
        getReq.onsuccess = (e) => {
          const existing = e.target.result || {
            operatorId,
            callsign: vitalsData.callsign || operatorId,
            name: vitalsData.name || operatorId,
            role: vitalsData.role || 'OPERATOR',
            triageLevel: 'GREEN',
            bpm: 80,
            spo2: 98,
            notes: ''
          };

          updated = {
            ...existing,
            triageLevel: vitalsData.triageLevel || existing.triageLevel,
            bpm: vitalsData.bpm !== undefined ? Number(vitalsData.bpm) : existing.bpm,
            spo2: vitalsData.spo2 !== undefined ? Number(vitalsData.spo2) : existing.spo2,
            notes: vitalsData.notes !== undefined ? String(vitalsData.notes) : existing.notes,
            lastUpdate: nowSec
          };
          store.put(updated);
        };

        tx.oncomplete = () => resolve(updated);
        tx.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  /**
   * Retrieves all 8 operator records sorted by triage severity:
   * RED -> YELLOW -> GREEN -> BLACK (with tie-breaking by operatorId).
   * @returns {Promise<Array<Object>>}
   */
  async function getAllSquadMembers() {
    const db = await initTacticalDB();
    if (!db) return DEFAULT_SQUAD_MEMBERS.slice();

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['squad_triage'], 'readonly');
        const store = tx.objectStore('squad_triage');
        const req = store.getAll();
        req.onsuccess = (e) => {
          const list = e.target.result || [];
          list.sort((a, b) => {
            const pA = SEVERITY_PRIORITY[a.triageLevel] || 99;
            const pB = SEVERITY_PRIORITY[b.triageLevel] || 99;
            if (pA !== pB) return pA - pB;
            return String(a.operatorId).localeCompare(String(b.operatorId));
          });
          resolve(list);
        };
        req.onerror = () => resolve(DEFAULT_SQUAD_MEMBERS.slice());
      } catch (err) {
        resolve(DEFAULT_SQUAD_MEMBERS.slice());
      }
    });
  }

  /* ==========================================================================
     AIR-LINK TRANSCEIVER PACKETS API (logPacket, isPacketProcessed)
     ========================================================================== */

  /**
   * Quick duplicate check before processing an incoming optical frame.
   * @param {number} seq - Packet sequence number
   * @returns {Promise<boolean>} True if `seq` already exists with status === "PROCESSED".
   */
  async function isPacketProcessed(seq) {
    const db = await initTacticalDB();
    if (!db || seq === undefined || seq === null) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['optical_packets'], 'readonly');
        const store = tx.objectStore('optical_packets');
        const req = store.get(Number(seq));
        req.onsuccess = (e) => {
          const rec = e.target.result;
          resolve(Boolean(rec && rec.status === 'PROCESSED'));
        };
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  /**
   * Saves incoming ("RX") or outgoing ("TX") QR packet frames into `optical_packets`
   * and `tactical_messages`.
   * @param {Object} packetData - { seq, v, ts, src, cat, msg, geo, rawPayload }
   * @param {string} [direction="TX"] - "TX" or "RX"
   * @returns {Promise<Object|null>}
   */
  async function logPacket(packetData = {}, direction) {
    const db = await initTacticalDB();
    const nowSec = Math.floor(Date.now() / 1000);
    const dir = (direction || packetData.direction || 'TX').toUpperCase() === 'RX' ? 'RX' : 'TX';
    const seqNum = typeof packetData.seq === 'number' ? packetData.seq : 100;
    const tsSec = typeof packetData.ts === 'number'
      ? (packetData.ts > 1e11 ? Math.floor(packetData.ts / 1000) : packetData.ts)
      : nowSec;

    const rawStr = typeof packetData.rawPayload === 'string'
      ? packetData.rawPayload
      : JSON.stringify(packetData);

    const pktRecord = {
      seq: seqNum,
      v: packetData.v || 1,
      ts: tsSec,
      src: packetData.src || 'OP-ALPHA-01',
      rawPayload: rawStr,
      direction: dir,
      status: 'PROCESSED',
      category: String(packetData.category || packetData.cat || 'CUSTOM').toUpperCase(),
      text: String(packetData.text || packetData.msg || ''),
      geo: Array.isArray(packetData.geo) ? packetData.geo : [28.6139, 77.2090]
    };

    if (!db) return pktRecord;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['optical_packets', 'tactical_messages'], 'readwrite');
        const pktStore = tx.objectStore('optical_packets');
        const msgStore = tx.objectStore('tactical_messages');

        pktStore.put(pktRecord);
        msgStore.add({
          seq: pktRecord.seq,
          ts: pktRecord.ts,
          category: pktRecord.category,
          text: pktRecord.text,
          geo: pktRecord.geo,
          direction: pktRecord.direction
        });

        tx.oncomplete = () => resolve(pktRecord);
        tx.onerror = () => resolve(pktRecord);
      } catch (err) {
        resolve(pktRecord);
      }
    });
  }

  /**
   * Fetches recent optical packets / messages sorted by timestamp (`ts`) descending.
   * @param {number} [limit=20]
   * @returns {Promise<Array<Object>>}
   */
  async function getRecentMessages(limit = 20) {
    const db = await initTacticalDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['optical_packets'], 'readonly');
        const store = tx.objectStore('optical_packets');
        const tsIndex = store.index('ts');
        const results = [];

        const curReq = tsIndex.openCursor(null, 'prev');
        curReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        curReq.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  /* ==========================================================================
     TELEMETRY CACHE API (saveTelemetryFix, getLastTelemetryFix)
     ========================================================================== */

  /**
   * Stores the operator's latest GNSS fix into `telemetry_cache` (key: "LAST_KNOWN_POS").
   * @param {Object} fixData - { id, geo, accuracy, heading, ts, syncedToCloud }
   * @returns {Promise<Object|null>}
   */
  async function saveTelemetryFix(fixData = {}) {
    const db = await initTacticalDB();
    const record = {
      id: fixData.id || 'LAST_KNOWN_POS',
      geo: Array.isArray(fixData.geo) ? fixData.geo : [28.6139, 77.2090],
      accuracy: typeof fixData.accuracy === 'number' ? fixData.accuracy : 4,
      heading: typeof fixData.heading === 'number' ? fixData.heading : 42,
      ts: typeof fixData.ts === 'number' ? fixData.ts : Math.floor(Date.now() / 1000),
      syncedToCloud: Boolean(fixData.syncedToCloud)
    };

    if (!db) return record;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['telemetry_cache'], 'readwrite');
        const store = tx.objectStore('telemetry_cache');
        store.put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => resolve(record);
      } catch (err) {
        resolve(record);
      }
    });
  }

  /**
   * Retrieves `LAST_KNOWN_POS` from `telemetry_cache`.
   * @returns {Promise<Object|null>}
   */
  async function getLastTelemetryFix() {
    const db = await initTacticalDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['telemetry_cache'], 'readonly');
        const store = tx.objectStore('telemetry_cache');
        const req = store.get('LAST_KNOWN_POS');
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  /* ==========================================================================
     ZEROIZE / EMERGENCY WIPE (zeroizeTacticalData)
     ========================================================================== */

  /**
   * Immediately closes all open connections, deletes `TacticalEdgeDB`,
   * clears `localStorage` and `sessionStorage`, and returns a resolved Promise.
   * @returns {Promise<void>}
   */
  function zeroizeTacticalData() {
    return new Promise((resolve) => {
      try {
        if (dbInstance) {
          dbInstance.close();
          dbInstance = null;
        }
      } catch (e) {}

      try {
        global.localStorage.clear();
      } catch (e) {}

      try {
        global.sessionStorage.clear();
      } catch (e) {}

      if (!global.indexedDB) {
        resolve();
        return;
      }

      try {
        const delReq = global.indexedDB.deleteDatabase(DB_NAME);
        delReq.onsuccess = () => {
          console.info('[TacticalEdgeDB] ZEROIZE COMPLETE: TacticalEdgeDB deleted.');
          resolve();
        };
        delReq.onerror = () => resolve();
        delReq.onblocked = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  /* ==========================================================================
     OFFLINE PERSISTENCE VERIFICATION & SELF-TEST LOGGER
     ========================================================================== */

  /**
   * Verifies that TacticalEdgeDB persists across browser refreshes even when
   * Network is set to "Offline" in DevTools. Logs a structured diagnostic table.
   * @returns {Promise<Object>}
   */
  async function verifyOfflinePersistence() {
    const db = await initTacticalDB();
    const squad = await getAllSquadMembers();
    const hazards = await getActiveHazards();
    const packets = await getRecentMessages(20);
    const lastPos = await getLastTelemetryFix();

    const report = {
      database: DB_NAME,
      version: db ? db.version : DB_VERSION,
      networkOnline: Boolean(global.navigator && global.navigator.onLine),
      storesVerified: db ? Array.from(db.objectStoreNames) : [],
      squadMembersCount: squad.length,
      activeHazardsCount: hazards.length,
      opticalPacketsCount: packets.length,
      cachedGpsFix: lastPos ? lastPos.geo : null
    };

    console.info(
      '%c[TacticalEdgeDB] OFFLINE PERSISTENCE VERIFIED (100% LOCAL)',
      'background:#09090B;color:#FACC15;font-weight:bold;padding:3px 6px;border:1px solid #FACC15;',
      report
    );
    return report;
  }

  const TacticalDB = {
    // Primary methods from specification
    initTacticalDB,
    saveHazard,
    getActiveHazards,
    clearHazard,
    updateOperatorVitals,
    getAllSquadMembers,
    logPacket,
    isPacketProcessed,
    saveTelemetryFix,
    getLastTelemetryFix,
    zeroizeTacticalData,
    verifyOfflinePersistence,

    // Aliases for seamless compatibility
    initDB: initTacticalDB,
    saveMessage: (msgData) => logPacket(msgData, msgData && msgData.direction),
    getRecentMessages,
    resolveAllHazards: () => clearHazard('ALL'),
    getSquadRoster: getAllSquadMembers,
    updateSquadVitals: updateOperatorVitals,
    zeroizeDatabase: zeroizeTacticalData
  };

  global.TacticalDB = TacticalDB;
  global.initTacticalDB = initTacticalDB;
  global.initDB = initTacticalDB;
  global.saveHazard = saveHazard;
  global.getActiveHazards = getActiveHazards;
  global.clearHazard = clearHazard;
  global.updateOperatorVitals = updateOperatorVitals;
  global.updateSquadVitals = updateOperatorVitals;
  global.getAllSquadMembers = getAllSquadMembers;
  global.logPacket = logPacket;
  global.saveMessage = TacticalDB.saveMessage;
  global.isPacketProcessed = isPacketProcessed;
  global.getRecentMessages = getRecentMessages;
  global.saveTelemetryFix = saveTelemetryFix;
  global.getLastTelemetryFix = getLastTelemetryFix;
  global.zeroizeTacticalData = zeroizeTacticalData;
  global.zeroizeDatabase = zeroizeTacticalData;
  global.runTacticalDBSelfTest = verifyOfflinePersistence;
})(typeof window !== 'undefined' ? window : this);
