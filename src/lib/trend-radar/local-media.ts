/**
 * Browser-local, opt-in storage for media the owner chooses to keep with a
 * Trend Radar project. Never sent to the server or shared across devices.
 */
const DATABASE = "launchpad-trend-radar-media";
const STORE = "assets";
export type LocalAsset = {
  key: string;
  projectId: string;
  role: string;
  filename: string;
  mime: string;
  blob: Blob;
  savedAt: string;
};
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support local media storage."));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const collection = database.createObjectStore(STORE, { keyPath: "key" });
        collection.createIndex("projectId", "projectId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local media library."));
  });
}
export async function saveLocalAssets(projectId: string, assets: { role: string; file: File }[]): Promise<void> {
  if (!/^[\w-]{5,80}$/.test(projectId)) throw new Error("Invalid local project reference.");
  if (!assets.length) return;
  for (const { role, file } of assets) {
    if (!/^(video|@Image[1-9]\d*)$/.test(role)) throw new Error("Invalid asset role.");
    const max = role === "video" ? 80 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size < 1 || file.size > max) throw new Error(role + " is too large for local project storage.");
    if (!(role === "video" ? /^video\/(mp4|webm|quicktime)$/ : /^image\/(png|jpeg|webp|gif)$/).test(file.type))
      throw new Error("Use a supported video or image file.");
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const collection = transaction.objectStore(STORE);
      for (const { role, file } of assets) {
        const row: LocalAsset = {
          key: projectId + ":" + role,
          projectId, role, filename: file.name, mime: file.type,
          blob: file, savedAt: new Date().toISOString(),
        };
        collection.put(row);
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("Local media storage failed."));
      transaction.onerror = () => reject(transaction.error || new Error("Local media storage failed."));
    });
  } finally { database.close(); }
}
export async function readLocalAssets(projectId: string): Promise<LocalAsset[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).index("projectId").getAll(projectId);
      request.onsuccess = () => resolve(request.result as LocalAsset[]);
      request.onerror = () => reject(request.error || new Error("Could not read local assets."));
    });
  } finally { database.close(); }
}
export async function clearLocalAssets(projectId: string): Promise<void> {
  const assets = await readLocalAssets(projectId);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      for (const asset of assets) transaction.objectStore(STORE).delete(asset.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear local assets."));
    });
  } finally { database.close(); }
}
