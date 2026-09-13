import Dexie, { type Table } from "dexie";
import type { Activity, ActivityTemplate, Expense, Parcel, Settings, StockItem, StockMovement } from "./types";

/** Central place for the recurrence → interval mapping used by both the UI and the scheduler. */
export function recurrenceIntervalDays(activity: Pick<Activity, "recurrence" | "customFrequencyDays">): number | undefined {
  switch (activity.recurrence) {
    case "7":
      return 7;
    case "14":
      return 14;
    case "30":
      return 30;
    case "custom":
      return activity.customFrequencyDays && activity.customFrequencyDays > 0 ? activity.customFrequencyDays : undefined;
    default:
      return undefined;
  }
}

/** IndexedDB is the sole source of truth: the app continues to work with no connection. */
class HaricotManagerDatabase extends Dexie {
  parcels!: Table<Parcel, string>;
  expenses!: Table<Expense, string>;
  activities!: Table<Activity, string>;
  templates!: Table<ActivityTemplate, string>;
  stock!: Table<StockItem, string>;
  stockMovements!: Table<StockMovement, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("haricotmanager-pwa");
    this.version(1).stores({
      parcels: "id, name, sowingDate, createdAt",
      expenses: "id, parcelId, date, category, createdAt",
      activities: "id, parcelId, scheduledAt, done, type",
      templates: "id, type",
      stock: "id, kind, remainingQuantity",
      stockMovements: "id, stockItemId, parcelId, date, direction",
      settings: "id",
    });

    // v2 — full activity editing + background alarms: adds a time-of-day, a recurrence
    // mode, series grouping (for "modifier toute la série"), and the notification tags
    // scheduled for each occurrence so they can be cancelled precisely on edit/delete.
    this.version(2)
      .stores({
        parcels: "id, name, sowingDate, createdAt",
        expenses: "id, parcelId, date, category, createdAt",
        activities: "id, parcelId, scheduledAt, done, type, seriesId, templateId",
        templates: "id, type",
        stock: "id, kind, remainingQuantity",
        stockMovements: "id, stockItemId, parcelId, date, direction",
        settings: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table<Activity, string>("activities")
          .toCollection()
          .modify((activity) => {
            if (!activity.time) activity.time = "08:00";
            if (!activity.recurrence) {
              activity.recurrence = activity.frequencyDays ? "custom" : "none";
              if (activity.frequencyDays) activity.customFrequencyDays = activity.frequencyDays;
            }
            if (!activity.notificationIds) activity.notificationIds = [];
          });
      });
  }
}

export const db = new HaricotManagerDatabase();

export const defaultSettings: Settings = {
  id: "app",
  pricePerKg: 850,
  defaultLowStockThreshold: 5,
  categories: [
    "Semences",
    "Labour",
    "Semis",
    "Engrais",
    "Herbicide",
    "Insecticide",
    "Main d’œuvre",
    "Transport",
    "Emballage",
    "Autres",
  ],
};

export const defaultTemplates: ActivityTemplate[] = [
  { id: "template-herbicide", name: "Herbicide pré-levée", type: "Protection", frequencyDays: 0, startAfterDays: 10 },
  { id: "template-desherbage", name: "Désherbage", type: "Entretien", frequencyDays: 0, startAfterDays: 15 },
  { id: "template-insecticide", name: "Insecticide", type: "Protection", frequencyDays: 14, startAfterDays: 20 },
];
