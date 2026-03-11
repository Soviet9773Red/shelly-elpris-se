/* 
  shelly-elprisSE
  Migration script: 3.1.5 -> 3.1.7
  Run once, then remove.
*/

let MAX_INST = 2; // adjust if you use more instances
let DRY_RUN = false;
let SCRIPT_ID = Shelly.getCurrentScriptId();

function log(msg) {
  console.log("[KVS 3.1.5 to 3.1.7] " + msg);
}
function stopScript() {
  log("Stopping migration script: #" + SCRIPT_ID);
  Shelly.call("Script.Stop", { id: SCRIPT_ID });
}
function migrateCommon(cfg) {
  let changes = 0;

  function normalize(oldKey, newKey) {
	// if legacy values exist
	if (cfg[oldKey] !== undefined) {
		// if no new — moving values
		if (cfg[newKey] === undefined) {
		  cfg[newKey] = cfg[oldKey];
		  log("Migrated '" + oldKey + "' -> '" + newKey + "'");
		  changes++;
		}
	// deleting legacy
	delete cfg[oldKey];
	log("Removed legacy field '" + oldKey + "'");
	changes++;
	}
  }

  normalize("day", "d");
  normalize("night", "n");
  normalize("dayw", "dw");
  normalize("nightw", "nw");

  if (!Array.isArray(cfg.tf) || cfg.tf.length !== 2) {
    cfg.tf = [6, 22];
    log("Added default 'tf'");
    changes++;
  }

  if (cfg.ot === undefined) {
    cfg.ot = 0;
    log("Added default 'ot'");
    changes++;
  }
  return changes;
}

function migrateInstance(cfg, idx) {
  let changes = 0;

  if (cfg.m0 === undefined) {
    cfg.m0 = { c: 0 };
    log("Instance " + idx + ": added m0");
    changes++;
  }

  if (cfg.m1 === undefined) {
    cfg.m1 = { l: "avg" };
    log("Instance " + idx + ": added m1");
    changes++;
  }

  if (cfg.m2 === undefined) {
    cfg.m2 = {
      p: 24, c: 8, l: 0, s: 0, m: 10,
      ps: 0, pe: 12, ps2: 12, pe2: 24, c2: 8
    };
    log("Instance " + idx + ": added m2");
    changes++;
  }
  return changes;
}

/* ---------------- Sequential queue ---------------- */

let keys = ["elpris"];
for (let i = 1; i <= MAX_INST; i++) {
  keys.push("elpris-" + i);
}

let current = 0, totalChanges = 0, modifiedFields = 0;

function processNext() {

	if (current >= keys.length) {
		(totalChanges === 0) ?
		  log("No migration required. All keys already match 3.1.7 schema.") :
		  log("Migration completed. Modified keys: " + totalChanges + ", fields: " + modifiedFields);
	  Timer.set(500, false, stopScript);
	  return;
	}

  let key = keys[current++];
  log("Processing '" + key + "'");

  Shelly.call("KVS.Get", { key: key }, function (res, err) {

    if (err) {
      log("Key not found: " + key);
      Timer.set(200, false, processNext);
      return;
    }

    let cfg;
    try {
      cfg = JSON.parse(res.value);
    } catch (e) {
      log("Invalid JSON in " + key);
      Timer.set(200, false, processNext);
      return;
    }

	let changes = 0;

	if (key === "elpris") {
	  changes = migrateCommon(cfg);
	} else {
	  let idx = key.split("-")[1];
	  changes = migrateInstance(cfg, idx);
	}

	if (changes === 0) {
	  log("No changes for " + key);
	  Timer.set(200, false, processNext);
	  return;
	}

	// if changed
	totalChanges++;          // keys
	modifiedFields += changes;  // fields

    if (DRY_RUN) {
      log("DRY RUN - not writing " + key);
      Timer.set(200, false, processNext);
      return;
    }

    Shelly.call("KVS.Set",
      { key: key, value: JSON.stringify(cfg) },
      function (r2, err2) {

        if (err2) log("Write failed: " + key);
        else log("Saved: " + key);

        Timer.set(200, false, processNext);
      }
    );
  });
}

Timer.set(500, false, function () {
  log("Starting sequential migration...");
  processNext();
});
