export type ParcelPhoto = { id: string; dataUrl: string; capturedAt: string };

export type Parcel = {
  id: string;
  name: string;
  areaHa: number;
  variety: string;
  location: string;
  sowingDate: string;
  estimatedHarvestDate?: string;
  actualHarvestDate?: string;
  estimatedYieldKgHa?: number;
  actualYieldKgHa?: number;
  photos: ParcelPhoto[];
  createdAt: string;
};

export type Expense = {
  id: string;
  parcelId: string;
  date: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  receiptPhoto?: string;
  createdAt: string;
};

export type ActivityTemplate = {
  id: string;
  name: string;
  type: string;
  frequencyDays: number;
  startAfterDays: number;
};

export type ActivityRecurrence = "none" | "7" | "14" | "30" | "custom";

export type Activity = {
  id: string;
  parcelId: string;
  templateId?: string;
  name: string;
  type: string;
  scheduledAt: string;
  /** HH:mm, 24h. Defaults to "08:00" for activities created before this field existed. */
  time: string;
  /** @deprecated kept for backward compatibility / display; recurrence + customFrequencyDays now drive the schedule. */
  frequencyDays?: number;
  recurrence: ActivityRecurrence;
  /** Only meaningful when recurrence === "custom". Number of days between occurrences. */
  customFrequencyDays?: number;
  /** Groups every occurrence generated from the same recurring activity. Undefined for one-off activities. */
  seriesId?: string;
  /** Tags of the notifications currently scheduled for this occurrence (veille + jour J), so they can be cancelled precisely. */
  notificationIds?: string[];
  done: boolean;
  doneAt?: string;
  notes?: string;
  photo?: string;
  createdAt: string;
};

export type StockItem = {
  id: string;
  kind: "Semences" | "Herbicide" | "Insecticide" | "Engrais" | "Autre";
  label: string;
  lot?: string;
  packagingDate?: string;
  unit: "kg" | "L" | "sachet";
  initialQuantity: number;
  remainingQuantity: number;
  minimumThreshold: number;
  createdAt: string;
};

export type StockMovement = {
  id: string;
  stockItemId: string;
  parcelId?: string;
  date: string;
  direction: "Entrée" | "Sortie";
  quantity: number;
  reason: string;
};

export type Settings = {
  id: "app";
  pricePerKg: number;
  defaultLowStockThreshold: number;
  categories: string[];
};
