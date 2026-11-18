// Versioned storage in IndexedDB. Nothing in this file writes on page load.
import { DEFAULT_CATEGORIES, KINDS } from './seed.js';

export const SCHEMA_VERSION = 2;

const DB_NAME = 'money-hq';
const DB_VERSION = 1;
const STORE = 'kv';
const MAIN_KEY = 'main';
const META_KEY = 'meta';
const BEFORE_RESTORE_KEY = 'beforeRestore';

export function defaultSettings() {
  return {
    paydates: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: {},
    buffer: 0,
    merchantRules: {},
    payerRules: [],
    recurring: [],
    quick: { pinned: [], hidden: [] },
    potDefs: [],
    legacy: {},
  };
}

// Version 2 shape:
//   transactions: { id, date 'YYYY-MM-DD', desc, amount (always positive), direction 'out'|'in',
//                   kind (see seed.js), category, account, tag?, source, ref? }
//   pots: money moved in and out of pots: { id, pot, type 'in'|'out', amount, date }
export function emptyData() {
  return { schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), transactions: [], closedMonths: [], pots: [] };
}

// MIGRATIONS[n] upgrades data from version n to n + 1.
// Add one entry per schema change, and a test for it. Never edit an old one.
const MIGRATIONS = {
  // Version 1 had empty settings and loosely-shaped transactions. Version 2 gives every transaction
  // an id, a direction, a kind and an account, and adds the settings the importer needs.
  1(data) {
    const transactions = (Array.isArray(data.transactions) ? data.transactions : []).map((t, i) => ({
      ...t,
      id: t.id ?? `legacy-${i}`,
      desc: t.desc ?? '',
      amount: Math.abs(Number(t.amount)) || 0,
      direction: t.direction ?? 'out',
      kind: t.kind ?? 'spending',
      category: t.category ?? t.bucket ?? '',
      account: t.account ?? t.bank ?? '',
      source: t.source ?? 'manual',
    }));
    const settings = { ...defaultSettings(), ...(data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {}) };
    return { ...data, transactions, settings };
  },
};

const LIST_KEYS = ['transactions', 'closedMonths', 'pots'];
const SETTING_LISTS = ['paydates', 'categories', 'payerRules', 'recurring', 'potDefs'];
const SETTING_OBJECTS = ['budgets', 'merchantRules', 'quick', 'legacy'];
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Checks a data object and brings it up to the current schema version.
// Throws a plain-English error if the data can't be used. Never modifies its input.
export function migrate(input) {
  if (!isObject(input)) throw new Error('The data is not in the expected shape.');
  let data = { ...input };
  let version = Number(data.schemaVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error('The data has no valid version number.');
  if (version > SCHEMA_VERSION) {
    throw new Error(`This was made by a newer version of Money HQ (data version ${version}). Update the app first.`);
  }
  while (version < SCHEMA_VERSION) {
    data = MIGRATIONS[version](data);
    version += 1;
    data.schemaVersion = version;
  }
  const out = { ...emptyData(), ...data, schemaVersion: SCHEMA_VERSION };
  for (const key of LIST_KEYS) {
    if (!Array.isArray(out[key])) throw new Error(`The "${key}" section is damaged.`);
  }
  if (!isObject(out.settings)) throw new Error('The "settings" section is damaged.');
  out.settings = { ...defaultSettings(), ...out.settings };
  for (const key of SETTING_LISTS) {
    if (!Array.isArray(out.settings[key])) throw new Error(`The "${key}" setting is damaged.`);
  }
  for (const key of SETTING_OBJECTS) {
    if (!isObject(out.settings[key])) throw new Error(`The "${key}" setting is damaged.`);
  }
  out.settings.quick = { pinned: [], hidden: [], ...out.settings.quick };
  for (const t of out.transactions) {
    if (!isObject(t) || !KINDS.includes(t.kind)) throw new Error('A transaction in the data is damaged.');
  }
  return out;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open storage on this device.'));
  });
}

function runRequest(mode, makeRequest) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = makeRequest(tx.objectStore(STORE));
    let result;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Saving failed.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Saving was cancelled.')); };
  }));
}

const dbGet = (key) => runRequest('readonly', (store) => store.get(key));
const dbPut = (key, value) => runRequest('readwrite', (store) => store.put(value, key));

// Returns the saved data, or null if nothing has been saved yet.
export async function loadData() {
  const record = await dbGet(MAIN_KEY);
  return record ? migrate(record) : null;
}

export async function saveData(data) {
  await dbPut(MAIN_KEY, migrate(data));
}

export async function getMeta() {
  return (await dbGet(META_KEY)) || {};
}

export async function setMeta(patch) {
  await dbPut(META_KEY, { ...(await getMeta()), ...patch });
}

// Keeps a copy of what was there before a restore, so nothing is lost.
export async function keepBeforeRestore(data) {
  await dbPut(BEFORE_RESTORE_KEY, { savedAt: new Date().toISOString(), data });
}
