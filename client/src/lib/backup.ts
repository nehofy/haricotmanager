import { db, defaultSettings } from "./db";

/**
 * A full snapshot of the local database, portable across devices/reinstalls.
 * Bumping `version` lets future imports detect and migrate older backups.
 */
export interface HaricotManagerBackup {
  app: "haricotmanager-pwa";
  version: 1;
  exportedAt: string;
  data: {
    parcels: unknown[];
    expenses: unknown[];
    activities: unknown[];
    templates: unknown[];
    stock: unknown[];
    stockMovements: unknown[];
    settings: unknown[];
  };
}

export async function exportBackup(): Promise<HaricotManagerBackup> {
  const [parcels, expenses, activities, templates, stock, stockMovements, settings] = await Promise.all([
    db.parcels.toArray(),
    db.expenses.toArray(),
    db.activities.toArray(),
    db.templates.toArray(),
    db.stock.toArray(),
    db.stockMovements.toArray(),
    db.settings.toArray(),
  ]);

  return {
    app: "haricotmanager-pwa",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { parcels, expenses, activities, templates, stock, stockMovements, settings },
  };
}

/** Triggers a browser download of the current data as a dated .json file. */
export async function downloadBackup() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = backup.exportedAt.slice(0, 10);
  a.href = url;
  a.download = `haricotmanager-sauvegarde-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return backup;
}

export function isValidBackup(value: unknown): value is HaricotManagerBackup {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.app === "haricotmanager-pwa" && typeof v.data === "object" && v.data !== null;
}

export type ImportMode = "merge" | "replace";

/**
 * merge: keeps existing rows, adds/overwrites rows from the backup by id (bulkPut).
 * replace: wipes each table first, then loads the backup — use for restoring
 * onto a fresh install or reverting to a known-good state.
 */
export async function importBackup(backup: HaricotManagerBackup, mode: ImportMode = "merge") {
  if (!isValidBackup(backup)) throw new Error("Fichier de sauvegarde invalide.");

  await db.transaction(
    "rw",
    [db.parcels, db.expenses, db.activities, db.templates, db.stock, db.stockMovements, db.settings],
    async () => {
      const tables: Array<[keyof HaricotManagerBackup["data"], typeof db.parcels]> = [
        ["parcels", db.parcels],
        ["expenses", db.expenses],
        ["activities", db.activities],
        ["templates", db.templates],
        ["stock", db.stock],
        ["stockMovements", db.stockMovements],
        ["settings", db.settings],
      ] as never;

      for (const [key, table] of tables) {
        const rows = backup.data[key] ?? [];
        if (mode === "replace") await table.clear();
        if (rows.length) await table.bulkPut(rows as never[]);
      }

      // A backup taken before "settings" existed, or with an empty array, would
      // otherwise leave the app without price/category config after a replace.
      const settingsCount = await db.settings.count();
      if (settingsCount === 0) await db.settings.put(defaultSettings);
    },
  );
}

export function readBackupFile(file: File): Promise<HaricotManagerBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidBackup(parsed)) {
          reject(new Error("Ce fichier ne correspond pas à une sauvegarde HaricotManager."));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error("Fichier JSON illisible ou corrompu."));
      }
    };
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsText(file);
  });
}
