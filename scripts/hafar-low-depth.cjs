// CommonJS script — query Firestore for Hafar Al Batin installations with depth < 40
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

const firebaseConfig = {
  apiKey:            "AIzaSyAZ39e477sCTQqhgsxXeIWCSo5ijGJh5xQ",
  authDomain:        "flowset-143fc.firebaseapp.com",
  projectId:         "flowset-143fc",
  storageBucket:     "flowset-143fc.firebasestorage.app",
  messagingSenderId: "799211858991",
  appId:             "1:799211858991:web:f7e63c89332e729fcdaada",
};

const DEPTH_THRESHOLD = 40;

const HAFAR_ALIASES = new Set([
  "hafar al batin", "hafr albatin", "hafaralbatin", "hafralbatin",
  "hafar albatin", "hafar", "hafar al-batin",
]);

function isHafar(name) {
  return HAFAR_ALIASES.has((name || "").toLowerCase().trim());
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  // ── 1. Find Hafar team IDs ──────────────────────────────────────────────
  console.log("Fetching teams…");
  const teamsSnap = await getDocs(collection(db, "teams"));
  const hafarTeamIds = new Set();
  const teamNames = {};
  teamsSnap.forEach(d => {
    const data = d.data();
    const name = data.name || data.teamName || d.id || "";
    teamNames[d.id] = name;
    if (isHafar(name)) {
      hafarTeamIds.add(d.id);
      console.log(`  ✔ Hafar team: "${name}" (id=${d.id})`);
    }
  });

  if (hafarTeamIds.size === 0) {
    console.log("\nNo Hafar team found. All teams:");
    teamsSnap.forEach(d => {
      const data = d.data();
      console.log(`  • ${d.id}: "${data.name || data.teamName || ""}"`);
    });
    process.exit(1);
  }

  // ── 2. Build location coords map ────────────────────────────────────────
  console.log("Fetching locations…");
  const locSnap = await getDocs(collection(db, "locations"));
  const locationCoords = {};  // locationId -> { lat, lon }
  locSnap.forEach(d => {
    const data = d.data();
    const locId = String(data.locationId || d.id).trim();
    const lat = typeof data.latitude === "number" ? data.latitude : parseFloat(data.latitude);
    const lon = typeof data.longitude === "number" ? data.longitude : parseFloat(data.longitude);
    if (!isNaN(lat) && !isNaN(lon)) {
      locationCoords[locId] = { lat, lon };
    }
  });

  // ── 3. Filter installations ─────────────────────────────────────────────
  console.log("Fetching installations…");
  const instSnap = await getDocs(collection(db, "installations"));

  const results = [];
  instSnap.forEach(d => {
    const data = d.data();
    if (!hafarTeamIds.has(data.teamId)) return;
    const reading = typeof data.sensorReading === "number" ? data.sensorReading : null;
    if (reading === null || reading >= DEPTH_THRESHOLD) return;

    const locId = data.locationId ? String(data.locationId).trim() : "";
    let coords = "-";
    if (locId === "9999" || locId === "") {
      // Use user-captured GPS
      const lat = data.latitude;
      const lon = data.longitude;
      if (lat != null && lon != null) {
        coords = `${parseFloat(lat).toFixed(6)}, ${parseFloat(lon).toFixed(6)}`;
      }
    } else {
      const loc = locationCoords[locId];
      if (loc) {
        coords = `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`;
      }
    }

    results.push({
      deviceId:   data.deviceId || d.id,
      locationId: locId || "-",
      amanah:     teamNames[data.teamId] || "-",
      coords,
      reading,
    });
  });

  if (results.length === 0) {
    console.log(`\nNo Hafar devices with sensor reading < ${DEPTH_THRESHOLD} cm.`);
    process.exit(0);
  }

  results.sort((a, b) => a.reading - b.reading);

  const SEP = "─".repeat(110);
  console.log(`\n${SEP}`);
  console.log(`Hafar Al Batin — manhole depth < ${DEPTH_THRESHOLD} cm   (${results.length} device${results.length === 1 ? "" : "s"})`);
  console.log(SEP);
  console.log(`${"#".padEnd(4)} ${"Device ID".padEnd(22)} ${"Location ID".padEnd(14)} ${"Depth(cm)".padEnd(11)} ${"Amanah".padEnd(20)} Coordinates`);
  console.log(SEP);
  results.forEach((r, i) => {
    console.log(
      `${String(i + 1).padEnd(4)} ${r.deviceId.padEnd(22)} ${r.locationId.padEnd(14)} ${String(r.reading).padEnd(11)} ${r.amanah.padEnd(20)} ${r.coords}`
    );
  });
  console.log(SEP);
}

main().catch(err => { console.error(err); process.exit(1); });
