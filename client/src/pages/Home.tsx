/** Design reminder: Atelier des Récoltes combines warm material cues with one-handed, data-first farm workflows. */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell, CalendarCheck2, Check, ChevronRight, Download, Leaf, LayoutDashboard, MapPin, Package, Pencil, Plus, ReceiptText, Settings2, Sprout, Warehouse, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db, defaultSettings, defaultTemplates } from "@/lib/db";
import { downloadBlob, fileToDataUrl, formatDate, formatFCFA, formatNumber, uid } from "@/lib/format";
import type { Activity, ActivityTemplate, Expense, Parcel, Settings, StockItem, StockMovement } from "@/lib/types";
import { ParcelList } from "@/components/ParcelList";
import { InstallPWAButton } from "@/components/InstallPWAButton";
import { BackupCard } from "@/components/BackupCard";
import { ActivityEditModal, type EditScope } from "@/components/ActivityEditModal";
import { notifyDueActivities, updateAppBadge } from "@/lib/notifications";
import { requestNotificationPermission, rescheduleAllAlarms, cancelActivityAlarms, useAlarmFallback } from "@/hooks/useNotifications";
import { recurrenceIntervalDays } from "@/lib/db";
import { toast } from "sonner";

type Section = "tableau" | "parcelles" | "depenses" | "planning" | "stock";
type DialogName = "parcel" | "expense" | "stock" | "movement" | "activity" | "template" | "settings" | null;

const logoUrl = "/images/logo.png";
const bannerUrl = "/images/season-banner.jpg";
const parcelImageUrl = "/images/parcel-card.jpg";

const nav: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "tableau", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "parcelles", label: "Parcelles", icon: MapPin },
  { id: "depenses", label: "Dépenses", icon: ReceiptText },
  { id: "planning", label: "Planning", icon: CalendarCheck2 },
  { id: "stock", label: "Stock", icon: Warehouse },
];

const isoToday = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); return next.toISOString().slice(0, 10); };

function MetricCard({ label, value, detail, icon: Icon, tone = "green" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "green" | "clay" | "saffron" | "ink" }) {
  return <article className={`metric-card metric-${tone}`}><div><p className="eyebrow">{label}</p><strong>{value}</strong><p className="metric-detail">{detail}</p></div><span className="metric-icon"><Icon size={22} strokeWidth={1.8} /></span></article>;
}

function Empty({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><div className="empty-seed"><Sprout size={25} /></div><div><h3>{title}</h3><p>{text}</p>{action && <Button className="mt-3" onClick={action}><Plus size={16} /> Ajouter</Button>}</div></div>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("tableau");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [receiptPhoto, setReceiptPhoto] = useState<string>("");
  const [activityPhoto, setActivityPhoto] = useState<string>("");
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [notificationReady, setNotificationReady] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const [modalActivity, setModalActivity] = useState<Activity | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplate | null>(null);

  const load = async () => {
    const [storedParcels, storedExpenses, storedActivities, storedTemplates, storedStock, storedMovements, storedSettings] = await Promise.all([
      db.parcels.toArray(), db.expenses.toArray(), db.activities.toArray(), db.templates.toArray(), db.stock.toArray(), db.stockMovements.toArray(), db.settings.get("app"),
    ]);
    if (!storedSettings) await db.settings.put(defaultSettings);
    if (!storedTemplates.length) await db.templates.bulkPut(defaultTemplates);
    setParcels(storedParcels.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setExpenses(storedExpenses.sort((a, b) => b.date.localeCompare(a.date)));
    setActivities(storedActivities.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    setTemplates(storedTemplates.length ? storedTemplates : defaultTemplates);
    setStock(storedStock);
    setStockMovements(storedMovements.sort((a, b) => b.date.localeCompare(a.date)));
    setSettings(storedSettings ?? defaultSettings);
  };

  useEffect(() => { void load(); void navigator.storage?.persist?.(); }, []);

  const parcelById = useMemo(() => new Map(parcels.map((parcel) => [parcel.id, parcel])), [parcels]);
  const costByParcel = useMemo(() => expenses.reduce<Record<string, number>>((all, item) => ({ ...all, [item.parcelId]: (all[item.parcelId] ?? 0) + item.total }), {}), [expenses]);
  const upcoming = useMemo(() => activities.filter((item) => !item.done).filter((item) => item.scheduledAt >= isoToday()).slice(0, 6), [activities]);
  const lowStock = useMemo(() => stock.filter((item) => item.remainingQuantity < item.minimumThreshold), [stock]);
  const monthPrefix = isoToday().slice(0, 7);
  const monthlyExpenses = useMemo(() => expenses.filter((item) => item.date.startsWith(monthPrefix)).reduce((sum, item) => sum + item.total, 0), [expenses, monthPrefix]);
  const categoryData = useMemo(() => Object.entries(expenses.reduce<Record<string, number>>((result, item) => ({ ...result, [item.category]: (result[item.category] ?? 0) + item.total }), {})).map(([name, value]) => ({ name, value })), [expenses]);
  const parcelCostData = useMemo(() => parcels.map((parcel) => ({ name: parcel.name, montant: costByParcel[parcel.id] ?? 0 })), [parcels, costByParcel]);

  useEffect(() => {
    if (!notificationReady) return;
    // Fires immediately on open/foreground (covers the reliable case) and then
    // re-checks periodically while the app stays open in the background tab.
    void notifyDueActivities(activities, parcelById);
    const interval = window.setInterval(() => void notifyDueActivities(activities, parcelById), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [notificationReady, activities, parcelById]);

  // The two per-activity alarms (rappel veille 18h + alarme jour J). Re-scheduling on
  // every activities/parcels change keeps them in sync after any create/edit — each
  // schedule call cancels its own previous notifications first, so this is safe to
  // re-run often.
  useEffect(() => {
    if (!notificationReady) return;
    void rescheduleAllAlarms(activities, parcelById);
  }, [notificationReady, activities, parcelById]);

  // Best-effort coverage for browsers without the Notification Triggers API (no true
  // background scheduling — e.g. iOS Safari): catches anything due while the app is open.
  useAlarmFallback(activities, parcelById, notificationReady);

  // Opens the full edit modal directly when the user taps a "Rappel"/"Alarme" notification:
  // either on first load (?activity=... in the URL, from clients.openWindow in the SW) or
  // live via postMessage (when the SW instead focused this already-open tab).
  const openActivityById = (id: string) => { const target = activities.find((item) => item.id === id); if (target) setModalActivity(target); };
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("activity");
    if (!id || !activities.length) return;
    openActivityById(id);
    window.history.replaceState(null, "", window.location.pathname);
  }, [activities]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "navigate" || typeof event.data.url !== "string") return;
      const id = new URLSearchParams(event.data.url.split("?")[1] ?? "").get("activity");
      if (id) openActivityById(id);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [activities]);

  useEffect(() => {
    void updateAppBadge(upcoming.filter((item) => item.scheduledAt <= isoToday()).length);
  }, [upcoming]);

  const closeDialog = () => { setDialog(null); setPendingPhotos([]); setReceiptPhoto(""); setActivityPhoto(""); setEditingParcel(null); setEditingActivity(null); setSelectedStock(null); setEditingTemplate(null); setEditingExpense(null); setEditingStock(null); };
  const open = (name: DialogName) => setDialog(name);
  const handlePhotoList = async (files?: FileList | null) => { if (!files) return; const urls = await Promise.all(Array.from(files).map(fileToDataUrl)); setPendingPhotos((current) => [...current, ...urls]); };
  const handleSinglePhoto = async (files?: FileList | null, target: "receipt" | "activity" = "receipt") => { if (!files?.[0]) return; const url = await fileToDataUrl(files[0]); target === "receipt" ? setReceiptPhoto(url) : setActivityPhoto(url); };

  const saveParcel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const isEditing = Boolean(editingParcel); const id = editingParcel?.id ?? uid();
    const parcel: Parcel = { id, name: String(form.get("name")), areaHa: Number(form.get("areaHa")), variety: String(form.get("variety")), location: String(form.get("location")), sowingDate: String(form.get("sowingDate")), estimatedHarvestDate: String(form.get("estimatedHarvestDate") || ""), actualHarvestDate: String(form.get("actualHarvestDate") || ""), estimatedYieldKgHa: Number(form.get("estimatedYieldKgHa")) || undefined, actualYieldKgHa: Number(form.get("actualYieldKgHa")) || undefined, photos: [...(editingParcel?.photos ?? []), ...pendingPhotos.map((dataUrl) => ({ id: uid(), dataUrl, capturedAt: isoToday() }))], createdAt: editingParcel?.createdAt ?? new Date().toISOString() };
    if (isEditing) { await db.parcels.put(parcel); toast.success("Parcelle mise à jour"); } else { await db.parcels.add(parcel); toast.success("Parcelle créée", { description: "Ajoutez ses activités depuis l’onglet Planning." }); }
    closeDialog(); await load();
  };

  const saveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const quantity = Number(form.get("quantity")); const unitPrice = Number(form.get("unitPrice"));
    const expense: Expense = { id: editingExpense?.id ?? uid(), parcelId: String(form.get("parcelId")), date: String(form.get("date")), category: String(form.get("category")), description: String(form.get("description")), quantity, unitPrice, total: quantity * unitPrice, receiptPhoto: receiptPhoto || editingExpense?.receiptPhoto || undefined, createdAt: editingExpense?.createdAt ?? new Date().toISOString() };
    await db.expenses.put(expense);
    toast.success(editingExpense ? "Dépense mise à jour" : "Dépense enregistrée"); closeDialog(); await load();
  };

  const saveStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const initialQuantity = Number(form.get("initialQuantity"));
    const minimumThreshold = Number(form.get("minimumThreshold")) || settings.defaultLowStockThreshold;
    if (editingStock) {
      // Garde la quantité déjà consommée : seul l'écart avec l'ancienne quantité initiale est répercuté sur le restant.
      const remainingQuantity = editingStock.remainingQuantity + (initialQuantity - editingStock.initialQuantity);
      await db.stock.put({ ...editingStock, kind: String(form.get("kind")) as StockItem["kind"], label: String(form.get("label")), lot: String(form.get("lot")), packagingDate: String(form.get("packagingDate")), unit: String(form.get("unit")) as StockItem["unit"], initialQuantity, remainingQuantity: Math.max(0, remainingQuantity), minimumThreshold });
      toast.success("Article mis à jour");
    } else {
      await db.stock.add({ id: uid(), kind: String(form.get("kind")) as StockItem["kind"], label: String(form.get("label")), lot: String(form.get("lot")), packagingDate: String(form.get("packagingDate")), unit: String(form.get("unit")) as StockItem["unit"], initialQuantity, remainingQuantity: initialQuantity, minimumThreshold, createdAt: new Date().toISOString() });
      toast.success("Article ajouté au stock");
    }
    closeDialog(); await load();
  };

  const saveActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const frequencyDays = Number(form.get("frequencyDays")) || undefined;
    const next: Activity = { id: editingActivity?.id ?? uid(), parcelId: String(form.get("parcelId")), name: String(form.get("name")), type: String(form.get("type")), scheduledAt: String(form.get("scheduledAt")), time: editingActivity?.time ?? "08:00", frequencyDays, recurrence: editingActivity?.recurrence ?? (frequencyDays ? "custom" : "none"), customFrequencyDays: editingActivity?.customFrequencyDays ?? frequencyDays, seriesId: editingActivity?.seriesId ?? (frequencyDays ? uid() : undefined), notificationIds: editingActivity?.notificationIds ?? [], done: editingActivity?.done ?? false, doneAt: editingActivity?.doneAt, notes: editingActivity?.notes, photo: activityPhoto || editingActivity?.photo || undefined, createdAt: editingActivity?.createdAt ?? new Date().toISOString() };
    await db.activities.put(next); toast.success(editingActivity ? "Activité mise à jour" : "Activité ajoutée au planning"); closeDialog(); await load();
  };

  const saveMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedStock) return; const form = new FormData(event.currentTarget); const quantity = Number(form.get("quantity")); const direction = String(form.get("direction")) as StockMovement["direction"]; const delta = direction === "Entrée" ? quantity : -quantity; const remainingQuantity = selectedStock.remainingQuantity + delta;
    if (remainingQuantity < 0) { toast.error("La sortie dépasse la quantité disponible."); return; }
    await db.transaction("rw", db.stock, db.stockMovements, async () => { await db.stock.update(selectedStock.id, { remainingQuantity }); await db.stockMovements.add({ id: uid(), stockItemId: selectedStock.id, parcelId: String(form.get("parcelId") || "") || undefined, date: String(form.get("date")), direction, quantity, reason: String(form.get("reason")) }); });
    toast.success("Mouvement de stock enregistré"); closeDialog(); await load();
  };

  const saveTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const template: ActivityTemplate = { id: editingTemplate?.id ?? uid(), name: String(form.get("name")), type: String(form.get("type")), frequencyDays: Number(form.get("frequencyDays")), startAfterDays: Number(form.get("startAfterDays")) };
    await db.templates.put(template);
    if (editingTemplate) {
      const propagate = window.confirm("Mettre à jour toutes les futures activités déjà générées à partir de ce modèle ?");
      if (propagate) {
        const futureGenerated = activities.filter((activity) => activity.templateId === template.id && !activity.done && activity.scheduledAt >= isoToday());
        await Promise.all(futureGenerated.map((activity) => db.activities.update(activity.id, { name: template.name, type: template.type, frequencyDays: template.frequencyDays || undefined })));
      }
      toast.success("Modèle mis à jour");
    } else {
      toast.success("Modèle ajouté");
    }
    closeDialog(); await load();
  };

  const markDone = async (activity: Activity) => {
    const nowDone = !activity.done;
    await db.activities.update(activity.id, { done: nowDone, doneAt: nowDone ? isoToday() : undefined });
    if (nowDone) {
      await cancelActivityAlarms(activity.id);
      const intervalDays = recurrenceIntervalDays(activity);
      if (intervalDays) {
        const nextDate = addDays(activity.scheduledAt, intervalDays);
        await db.activities.add({ ...activity, id: uid(), scheduledAt: nextDate, done: false, doneAt: undefined, notificationIds: [], seriesId: activity.seriesId ?? activity.id, createdAt: new Date().toISOString() });
      }
    }
    toast.success(activity.done ? "Activité rouverte" : "Activité marquée comme faite");
    await load();
  };
  const deleteRecord = async (kind: "parcel" | "expense" | "stock" | "activity", id: string) => {
    if (!window.confirm("Supprimer cet enregistrement ?")) return;
    if (kind === "activity") await cancelActivityAlarms(id);
    const table = kind === "parcel" ? db.parcels : kind === "expense" ? db.expenses : kind === "stock" ? db.stock : db.activities;
    await table.delete(id);
    if (kind === "parcel") { await db.expenses.where("parcelId").equals(id).delete(); const parcelActivities = await db.activities.where("parcelId").equals(id).toArray(); await Promise.all(parcelActivities.map((activity) => cancelActivityAlarms(activity.id))); await db.activities.where("parcelId").equals(id).delete(); }
    toast.success("Enregistrement supprimé"); await load();
  };
  const openActivityModal = (activity: Activity) => setModalActivity(activity);
  const closeActivityModal = () => setModalActivity(null);
  const saveActivityFromModal = async (updated: Activity, scope: EditScope) => {
    await db.activities.put(updated);
    if (scope === "series" && updated.seriesId) {
      const siblings = activities.filter((item) => item.seriesId === updated.seriesId && item.id !== updated.id && !item.done);
      await Promise.all(siblings.map((sibling) => db.activities.put({ ...sibling, name: updated.name, parcelId: updated.parcelId, type: updated.type, time: updated.time, recurrence: updated.recurrence, customFrequencyDays: updated.customFrequencyDays, frequencyDays: updated.frequencyDays, notes: updated.notes })));
    }
    toast.success("Activité mise à jour"); closeActivityModal(); await load();
  };
  const deleteActivityFromModal = async (activity: Activity, scope: EditScope) => {
    await cancelActivityAlarms(activity.id);
    const idsToDelete = [activity.id];
    if (scope === "series" && activity.seriesId) {
      const siblings = activities.filter((item) => item.seriesId === activity.seriesId && item.id !== activity.id && !item.done && item.scheduledAt >= activity.scheduledAt);
      await Promise.all(siblings.map((sibling) => cancelActivityAlarms(sibling.id)));
      idsToDelete.push(...siblings.map((item) => item.id));
    }
    await db.activities.bulkDelete(idsToDelete);
    toast.success("Activité supprimée"); closeActivityModal(); await load();
  };
  const requestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationReady(granted);
    if (granted) {
      toast.success("Rappels activés — les tâches du jour s'afficheront à l'ouverture de l'application");
      void notifyDueActivities(activities, parcelById);
    } else {
      toast.error("Autorisation de notification refusée ou indisponible sur cet appareil");
    }
  };
  const exportCsv = (kind: "expenses" | "stock") => {
    const rows = kind === "expenses" ? [["Date", "Parcelle", "Catégorie", "Description", "Quantité", "Prix unitaire FCFA", "Total FCFA"], ...expenses.map((item) => [item.date, parcelById.get(item.parcelId)?.name ?? "", item.category, item.description, item.quantity, item.unitPrice, item.total])] : [["Article", "Type", "Lot", "Unité", "Quantité initiale", "Quantité restante", "Seuil"], ...stock.map((item) => [item.label, item.kind, item.lot ?? "", item.unit, item.initialQuantity, item.remainingQuantity, item.minimumThreshold])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n"); downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `haricotmanager-${kind}-${isoToday()}.csv`); toast.success("Export CSV téléchargé");
  };
  const exportParcelPdf = async (parcel: Parcel) => {
    const loadingToast = toast.loading("Génération du rapport PDF…");
    try {
      // @react-pdf/renderer is a large layout engine only needed here, at export
      // time — loading it on demand keeps it out of the app's initial bundle.
      const [{ pdf }, { ParcelReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/ParcelReport"),
      ]);
      const blob = await pdf(
        <ParcelReport
          parcel={parcel}
          expenses={expenses.filter((item) => item.parcelId === parcel.id)}
          activities={activities.filter((item) => item.parcelId === parcel.id)}
          settings={settings}
        />,
      ).toBlob();
      downloadBlob(blob, `rapport-${parcel.name.toLowerCase().replaceAll(/[^a-z0-9]+/gi, "-")}.pdf`);
      toast.success("Rapport PDF généré", { id: loadingToast });
    } catch {
      toast.error("Échec de la génération du rapport PDF", { id: loadingToast });
    }
  };
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const categoryInput = String(form.get("categories")); const next = { ...settings, pricePerKg: Number(form.get("pricePerKg")), defaultLowStockThreshold: Number(form.get("threshold")), categories: categoryInput.split(",").map((item) => item.trim()).filter(Boolean) }; await db.settings.put(next); setSettings(next); toast.success("Paramètres enregistrés"); closeDialog(); };

  const title = nav.find((item) => item.id === section)?.label ?? "HaricotManager";
  const renderDashboard = () => <>
    <section className="season-banner"><img src={bannerUrl} alt="Parcelle de haricots vue du ciel" onError={(event) => { event.currentTarget.style.display = "none"; }} /><div className="season-overlay" /><div className="season-copy"><p className="eyebrow text-white/70">Atelier de pilotage · Hors ligne</p><h1>Votre saison,<br /><em>parcelle par parcelle.</em></h1><p>Une vue claire sur les tâches, les dépenses et le stock, même sans réseau.</p><Button onClick={() => open("parcel")}><Plus size={17} /> Nouvelle parcelle</Button></div><div className="season-stamp"><Leaf size={17} /><span>Les données restent<br />sur votre appareil</span></div></section>
    <section className="metrics-grid"><MetricCard label="Parcelles actives" value={String(parcels.length)} detail={parcels.length ? `${formatNumber(parcels.reduce((sum, item) => sum + item.areaHa, 0), 2)} ha suivis` : "Commencez votre première fiche"} icon={MapPin} /><MetricCard label="Dépenses du mois" value={formatFCFA(monthlyExpenses)} detail={`${expenses.filter((item) => item.date.startsWith(monthPrefix)).length} ligne(s) enregistrée(s)`} icon={ReceiptText} tone="clay" /><MetricCard label="Prochaines tâches" value={String(upcoming.length)} detail={upcoming[0] ? `${upcoming[0].name} · ${formatDate(upcoming[0].scheduledAt)}` : "Aucune intervention prévue"} icon={CalendarCheck2} tone="saffron" /><MetricCard label="Alertes de stock" value={String(lowStock.length)} detail={lowStock.length ? "À réapprovisionner" : "Tous les seuils sont respectés"} icon={Package} tone="ink" /></section>
    <section className="dashboard-workbench"><div className="panel panel-priority"><div className="panel-heading"><div><p className="eyebrow">À faire ensuite</p><h2>Priorités terrain</h2></div><Button variant="ghost" className="text-green-800" onClick={() => setSection("planning")}>Voir le planning <ChevronRight size={16} /></Button></div>{upcoming.length ? <div className="task-list">{upcoming.map((activity) => <button className="task-row" key={activity.id} onClick={() => void markDone(activity)}><span className="task-check" aria-hidden="true" /><div><strong>{activity.name}</strong><span>{parcelById.get(activity.parcelId)?.name ?? "Parcelle supprimée"} · {formatDate(activity.scheduledAt)}</span></div><span className="task-date">{activity.scheduledAt === isoToday() ? "Aujourd’hui" : formatDate(activity.scheduledAt)}</span></button>)}</div> : <Empty title="Le terrain est calme" text="Ajoutez une parcelle : les modèles d’activités créeront son planning automatiquement." action={() => open("parcel")} />}</div>
      <div className="panel yield-panel"><div className="panel-heading"><div><p className="eyebrow">Marge par parcelle</p><h2>Lecture rapide</h2></div><span className="panel-dot" /></div>{parcels.length ? <div className="parcel-summary">{parcels.slice(0, 3).map((parcel) => { const totalCosts = costByParcel[parcel.id] ?? 0; const sale = (parcel.actualYieldKgHa ?? 0) * parcel.areaHa * settings.pricePerKg; return <button key={parcel.id} onClick={() => { setSelectedParcel(parcel); setSection("parcelles"); }}><span>{parcel.name}</span><strong className={sale - totalCosts >= 0 ? "profit" : "loss"}>{formatFCFA(sale - totalCosts)}</strong><small>{formatNumber(totalCosts)} FCFA de dépenses</small></button>; })}</div> : <div className="illustrated-empty"><img src={parcelImageUrl} alt="Haricots fraîchement récoltés" onError={(event) => { event.currentTarget.style.display = "none"; }} /><p>Votre marge apparaîtra ici dès les premiers enregistrements.</p></div>}</div></section>
  </>;

  const renderParcels = () => parcels.length ? <ParcelList parcels={parcels} costByParcel={costByParcel} settings={settings} selectedParcelId={selectedParcel?.id} onCreate={() => open("parcel")} onDelete={(id) => void deleteRecord("parcel", id)} onExport={(parcel) => void exportParcelPdf(parcel)} onEdit={(parcel) => { setEditingParcel(parcel); setSelectedParcel(parcel); open("parcel"); }} /> : <section className="content-section"><div className="section-intro"><div><p className="eyebrow">Suivi des cultures</p><h1>Parcelles</h1><p>Photos, rendements et marge réunis dans une fiche de terrain.</p></div><Button onClick={() => open("parcel")}><Plus size={17} /> Ajouter une parcelle</Button></div><Empty title="Aucune parcelle enregistrée" text="Créez une fiche de parcelle, puis ajoutez ses interventions depuis l’onglet Planning." action={() => open("parcel")} /></section>;

  const renderExpenses = () => <section className="content-section"><div className="section-intro"><div><p className="eyebrow">Comptabilité terrain</p><h1>Dépenses</h1><p>Chaque montant est relié à une parcelle pour calculer sa marge réelle.</p></div><div className="action-pair"><Button variant="outline" onClick={() => exportCsv("expenses")}><Download size={16} /> CSV</Button><Button onClick={() => open("expense")} disabled={!parcels.length}><Plus size={17} /> Ajouter une dépense</Button></div></div>{expenses.length ? <><div className="analysis-grid"><div className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Répartition</p><h2>Par catégorie</h2></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4}>{categoryData.map((entry, index) => <Cell key={entry.name} fill={["#215A3B", "#A95E3B", "#D59639", "#5F7860", "#60473A", "#9BB385"][index % 6]} />)}</Pie><Tooltip formatter={(value) => formatFCFA(Number(value))} /></PieChart></ResponsiveContainer></div><div className="chart-key">{categoryData.map((item, index) => <span key={item.name}><i style={{ background: ["#215A3B", "#A95E3B", "#D59639", "#5F7860", "#60473A", "#9BB385"][index % 6] }} />{item.name}<b>{formatFCFA(item.value)}</b></span>)}</div></div><div className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Répartition</p><h2>Par parcelle</h2></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={parcelCostData}><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis hide /><Tooltip formatter={(value) => formatFCFA(Number(value))} /><Bar dataKey="montant" fill="#A95E3B" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div></div><div className="panel data-table-panel"><table><thead><tr><th>Date</th><th>Parcelle</th><th>Catégorie</th><th>Description</th><th>Qté × PU</th><th>Montant</th><th></th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id}><td>{formatDate(item.date)}</td><td>{parcelById.get(item.parcelId)?.name ?? "—"}</td><td><span className="status-pill">{item.category}</span></td><td>{item.description || "—"}</td><td>{formatNumber(item.quantity)} × {formatFCFA(item.unitPrice)}</td><td className="number-cell">{formatFCFA(item.total)}</td><td className="row-actions-cell"><button className="row-delete" onClick={() => { setEditingExpense(item); open("expense"); }} aria-label="Modifier la dépense"><Pencil size={14} /></button><button className="row-delete" onClick={() => void deleteRecord("expense", item.id)} aria-label="Supprimer la dépense"><X size={15} /></button></td></tr>)}</tbody></table></div></> : <Empty title="Aucune dépense enregistrée" text={parcels.length ? "Enregistrez les intrants, la main-d’œuvre ou le transport pour piloter la rentabilité." : "Ajoutez d’abord une parcelle afin de pouvoir y rattacher une dépense."} action={parcels.length ? () => open("expense") : undefined} />}</section>;

  const renderPlanning = () => <section className="content-section"><div className="section-intro"><div><p className="eyebrow">Calendrier de culture</p><h1>Planning</h1><p>Ajoutez une activité manuellement, ou utilisez un modèle comme base de départ.</p></div><div className="action-pair"><Button variant="outline" onClick={requestNotifications}><Bell size={16} /> Activer les rappels</Button><Button onClick={() => open("activity")} disabled={!parcels.length}><Plus size={17} /> Activité</Button></div></div><div className="planning-layout"><div className="panel planning-panel"><div className="panel-heading"><div><p className="eyebrow">Prochains passages</p><h2>Agenda de terrain</h2></div><span className="calendar-mark"><CalendarCheck2 size={17} /></span></div>{activities.length ? <div className="agenda-list">{activities.map((activity) => <article key={activity.id} className={activity.done ? "agenda-item done" : "agenda-item"}><button onClick={() => void markDone(activity)} className="agenda-toggle" aria-label={activity.done ? "Rouvrir" : "Marquer comme fait"}>{activity.done && <Check size={14} />}</button><div className="agenda-date"><strong>{new Date(`${activity.scheduledAt}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(`${activity.scheduledAt}T12:00:00`))}</span></div><div className="agenda-copy"><h3>{activity.name}</h3><p>{parcelById.get(activity.parcelId)?.name ?? "Parcelle supprimée"} · {activity.type}{activity.frequencyDays ? ` · toutes les ${activity.frequencyDays} j` : ""}</p></div><span className={`agenda-status ${activity.done ? "is-done" : ""}`}>{activity.done ? "Fait" : "Prévu"}</span><button className="row-delete" onClick={() => openActivityModal(activity)} aria-label="Modifier l’activité"><Pencil size={14} /></button><button className="row-delete" onClick={() => void deleteRecord("activity", activity.id)} aria-label="Supprimer l’activité"><X size={15} /></button></article>)}</div> : <Empty title="Planning prêt à démarrer" text="Créez une parcelle ou ajoutez une activité manuelle." action={() => open("activity")} />}</div><aside className="model-box"><div><p className="eyebrow">Vos modèles</p><h2>Routines de culture</h2></div><p>Ces modèles ne sont plus appliqués automatiquement ; utilisez-les comme repère pour créer vos activités.</p><div className="template-list">{templates.map((template) => <div key={template.id}><span className="template-leaf"><Leaf size={14} /></span><span><strong>{template.name}</strong><small>J+{template.startAfterDays}{template.frequencyDays ? ` · puis tous les ${template.frequencyDays} j` : ""}</small></span><button className="row-delete" onClick={() => { setEditingTemplate(template); open("template"); }} aria-label={`Modifier le modèle ${template.name}`}><Pencil size={14} /></button></div>)}</div><Button variant="outline" onClick={() => open("template")}><Plus size={15} /> Nouveau modèle</Button></aside></div></section>;

  const renderStock = () => <section className="content-section"><div className="section-intro"><div><p className="eyebrow">Intrants & semences</p><h1>Stock</h1><p>Quantités en kilogrammes, litres ou sachets ; seuils d’alerte par article.</p></div><div className="action-pair"><Button variant="outline" onClick={() => exportCsv("stock")}><Download size={16} /> CSV</Button><Button onClick={() => open("stock")}><Plus size={17} /> Ajouter un article</Button></div></div>{lowStock.length > 0 && <div className="stock-alert"><Bell size={20} /><div><strong>{lowStock.length} alerte{lowStock.length > 1 ? "s" : ""} de stock</strong><p>{lowStock.map((item) => item.label).join(", ")} {lowStock.length > 1 ? "sont sous leurs seuils." : "est sous son seuil."}</p></div></div>}{stock.length ? <><div className="stock-grid">{stock.map((item) => { const percent = Math.min(100, Math.max(0, (item.remainingQuantity / item.initialQuantity) * 100)); const low = item.remainingQuantity < item.minimumThreshold; return <article className="stock-card" key={item.id}><div className="stock-top"><span className="stock-kind">{item.kind}</span><div className="row-actions-cell"><button className="icon-button" onClick={() => { setEditingStock(item); open("stock"); }} aria-label={`Modifier ${item.label}`}><Pencil size={14} /></button><button className="icon-button" onClick={() => void deleteRecord("stock", item.id)} aria-label={`Supprimer ${item.label}`}><X size={16} /></button></div></div><h2>{item.label}</h2><p>{item.lot ? `Lot ${item.lot}` : "Lot non précisé"}</p><div className="stock-quantity"><strong>{formatNumber(item.remainingQuantity, 2)}</strong><span>{item.unit}</span></div><div className="stock-progress"><span className={low ? "low" : ""} style={{ width: `${percent}%` }} /></div><div className="stock-meta"><span>Initial : {formatNumber(item.initialQuantity)} {item.unit}</span><span className={low ? "low-text" : ""}>Seuil : {formatNumber(item.minimumThreshold)} {item.unit}</span></div><Button className="stock-movement-button" variant="outline" onClick={() => { setSelectedStock(item); open("movement"); }}>Entrée / sortie</Button></article>; })}</div><div className="panel movement-panel"><div className="panel-heading"><div><p className="eyebrow">Derniers mouvements</p><h2>Journal du magasin</h2></div></div>{stockMovements.length ? <div className="movement-list">{stockMovements.slice(0, 8).map((movement) => <div key={movement.id}><span className={movement.direction === "Entrée" ? "movement-in" : "movement-out"}>{movement.direction === "Entrée" ? "+" : "−"}</span><p><strong>{movement.direction} · {stock.find((item) => item.id === movement.stockItemId)?.label ?? "Article supprimé"}</strong><small>{formatDate(movement.date)} · {movement.reason || "Sans motif"}{movement.parcelId ? ` · ${parcelById.get(movement.parcelId)?.name ?? "Parcelle"}` : ""}</small></p><b>{movement.direction === "Entrée" ? "+" : "−"}{formatNumber(movement.quantity)} {stock.find((item) => item.id === movement.stockItemId)?.unit ?? ""}</b></div>)}</div> : <p className="movement-empty">Enregistrez une entrée ou une sortie pour conserver l’historique du magasin.</p>}</div></> : <Empty title="Le magasin est vide" text="Ajoutez vos semences et intrants pour recevoir les alertes de réapprovisionnement." action={() => open("stock")} />}</section>;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-symbol" aria-hidden="true"><img src={logoUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /></span><div><strong>Haricot<span>Manager</span></strong><small>Atelier agricole</small></div></div><nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={section === item.id ? "active" : ""}><Icon size={18} /><span>{item.label}</span>{item.id === "planning" && upcoming.length > 0 && <b>{upcoming.length}</b>}</button>; })}</nav><div className="sidebar-bottom"><button onClick={() => open("settings")}><Settings2 size={18} /><span>Paramètres</span></button><div className="offline-note"><i /><span><strong>Mode hors ligne</strong>Vos données sont locales</span></div></div></aside><main><header className="topbar"><div><p className="eyebrow">HaricotManager PWA</p><h1>{title}</h1></div><div className="topbar-actions"><InstallPWAButton /><button className="notification-button" onClick={requestNotifications} aria-label="Activer les notifications"><Bell size={18} />{upcoming.length > 0 && <span>{upcoming.length}</span>}</button><Button className="quick-add" onClick={() => open(section === "depenses" ? "expense" : section === "planning" ? "activity" : section === "stock" ? "stock" : "parcel")}><Plus size={17} /><span>Ajout rapide</span></Button></div></header><div className="page-canvas">{section === "tableau" && renderDashboard()}{section === "parcelles" && renderParcels()}{section === "depenses" && renderExpenses()}{section === "planning" && renderPlanning()}{section === "stock" && renderStock()}</div></main><nav className="mobile-nav">{nav.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={section === item.id ? "active" : ""}><Icon size={19} /><span>{item.label.split(" ")[0]}</span></button>; })}</nav>
    <Dialog open={dialog === "parcel"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Fiche de culture</p><DialogTitle>{editingParcel ? "Modifier la parcelle" : "Nouvelle parcelle"}</DialogTitle><DialogDescription>{editingParcel ? "Actualisez les données de terrain, les rendements ou les photos." : "Ajoutez ensuite ses activités depuis l’onglet Planning."}</DialogDescription></DialogHeader><form onSubmit={saveParcel} className="form-grid"><label className="full"><span>Nom de la parcelle *</span><Input required name="name" defaultValue={editingParcel?.name} placeholder="Ex. Bas-fond Nord" /></label><label><span>Superficie (ha) *</span><Input required name="areaHa" min="0.01" step="0.01" type="number" defaultValue={editingParcel?.areaHa} placeholder="0,50" /></label><label><span>Variété</span><Input name="variety" defaultValue={editingParcel?.variety} placeholder="Ex. Paulista" /></label><label className="full"><span>Localisation</span><Input name="location" defaultValue={editingParcel?.location} placeholder="Village, repère ou coordonnées" /></label><label><span>Date de semis *</span><Input required name="sowingDate" defaultValue={editingParcel?.sowingDate ?? isoToday()} type="date" /></label><label><span>Récolte estimée</span><Input name="estimatedHarvestDate" defaultValue={editingParcel?.estimatedHarvestDate} type="date" /></label><label><span>Récolte réelle</span><Input name="actualHarvestDate" defaultValue={editingParcel?.actualHarvestDate} type="date" /></label><label><span>Rendement estimé (kg/ha)</span><Input name="estimatedYieldKgHa" defaultValue={editingParcel?.estimatedYieldKgHa} min="0" type="number" /></label><label><span>Rendement réel (kg/ha)</span><Input name="actualYieldKgHa" defaultValue={editingParcel?.actualYieldKgHa} min="0" type="number" /></label><label className="full photo-field"><span>Photos de suivi</span><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => void handlePhotoList(e.target.files)} /><div className="preview-list">{[...(editingParcel?.photos.map((photo) => photo.dataUrl) ?? []), ...pendingPhotos].map((photo, index) => <div key={`${photo}-${index}`}><img src={photo} alt="Aperçu" />{index >= (editingParcel?.photos.length ?? 0) && <button type="button" onClick={() => setPendingPhotos((all) => all.filter((_, current) => current !== index - (editingParcel?.photos.length ?? 0)))}><X size={14} /></button>}</div>)}</div></label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><Sprout size={16} /> {editingParcel ? "Enregistrer" : "Créer la parcelle"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={dialog === "expense"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Traçabilité des coûts</p><DialogTitle>{editingExpense ? "Modifier la dépense" : "Nouvelle dépense"}</DialogTitle><DialogDescription>Le total est calculé automatiquement avec la quantité et le prix unitaire.</DialogDescription></DialogHeader><form onSubmit={saveExpense} className="form-grid"><label className="full"><span>Parcelle *</span><select required name="parcelId" defaultValue={editingExpense?.parcelId ?? ""}><option value="" disabled>Choisir une parcelle</option>{parcels.map((parcel) => <option value={parcel.id} key={parcel.id}>{parcel.name}</option>)}</select></label><label><span>Date *</span><Input required name="date" type="date" defaultValue={editingExpense?.date ?? isoToday()} /></label><label><span>Catégorie *</span><select required name="category" defaultValue={editingExpense?.category}>{settings.categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="full"><span>Description</span><Input name="description" defaultValue={editingExpense?.description} placeholder="Ex. Pulvérisation de la parcelle nord" /></label><label><span>Quantité *</span><Input required name="quantity" type="number" min="0" step="0.01" defaultValue={editingExpense?.quantity ?? "1"} /></label><label><span>Prix unitaire (FCFA) *</span><Input required name="unitPrice" type="number" min="0" step="1" defaultValue={editingExpense?.unitPrice} /></label><label className="full photo-field"><span>Photo du reçu (facultative)</span><input type="file" accept="image/*" capture="environment" onChange={(e) => void handleSinglePhoto(e.target.files)} />{(receiptPhoto || editingExpense?.receiptPhoto) && <div className="receipt-preview"><img src={receiptPhoto || editingExpense?.receiptPhoto} alt="Aperçu du reçu" /><button type="button" onClick={() => setReceiptPhoto("")}><X size={14} /></button></div>}</label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><ReceiptText size={16} /> Enregistrer</Button></div></form></DialogContent></Dialog>
    <Dialog open={dialog === "stock"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Magasin d’intrants</p><DialogTitle>{editingStock ? "Modifier l’article" : "Ajouter au stock"}</DialogTitle><DialogDescription>{editingStock ? "La quantité restante s’ajuste automatiquement si vous changez la quantité initiale." : "Définissez un seuil propre à l’article pour activer l’alerte de stock bas."}</DialogDescription></DialogHeader><form onSubmit={saveStock} className="form-grid"><label><span>Type *</span><select name="kind" defaultValue={editingStock?.kind}><option>Semences</option><option>Herbicide</option><option>Insecticide</option><option>Engrais</option><option>Autre</option></select></label><label><span>Unité *</span><select name="unit" defaultValue={editingStock?.unit ?? "kg"}><option value="kg">kg</option><option value="L">L</option><option value="sachet">sachet</option></select></label><label className="full"><span>Nom de l’article *</span><Input required name="label" defaultValue={editingStock?.label} placeholder="Ex. Semence haricot Paulista" /></label><label><span>Lot</span><Input name="lot" defaultValue={editingStock?.lot} placeholder="Ex. LP-24-01" /></label><label><span>Date d’emballage</span><Input name="packagingDate" type="date" defaultValue={editingStock?.packagingDate} /></label><label><span>Quantité initiale *</span><Input required name="initialQuantity" type="number" step="0.01" min="0" defaultValue={editingStock?.initialQuantity} /></label><label><span>Seuil minimum</span><Input name="minimumThreshold" type="number" step="0.01" min="0" defaultValue={editingStock?.minimumThreshold} placeholder={String(settings.defaultLowStockThreshold)} /></label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><Package size={16} /> {editingStock ? "Enregistrer" : "Ajouter"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={dialog === "activity"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Intervention terrain</p><DialogTitle>{editingActivity ? "Modifier l’activité" : "Ajouter une activité"}</DialogTitle><DialogDescription>Créez une intervention ponctuelle ou une routine avec fréquence.</DialogDescription></DialogHeader><form onSubmit={saveActivity} className="form-grid"><label className="full"><span>Parcelle *</span><select required name="parcelId" defaultValue={editingActivity?.parcelId ?? ""}><option value="" disabled>Choisir une parcelle</option>{parcels.map((parcel) => <option value={parcel.id} key={parcel.id}>{parcel.name}</option>)}</select></label><label className="full"><span>Nom de l’activité *</span><Input required name="name" defaultValue={editingActivity?.name} placeholder="Ex. Contrôle des pucerons" /></label><label><span>Type</span><Input name="type" defaultValue={editingActivity?.type ?? "Entretien"} /></label><label><span>Date prévue *</span><Input required name="scheduledAt" type="date" defaultValue={editingActivity?.scheduledAt ?? isoToday()} /></label><label><span>Fréquence (jours)</span><Input name="frequencyDays" defaultValue={editingActivity?.frequencyDays} type="number" min="0" placeholder="Ex. 14" /></label><label className="photo-field"><span>Photo de repère (facultative)</span><input type="file" accept="image/*" capture="environment" onChange={(e) => void handleSinglePhoto(e.target.files, "activity")} />{activityPhoto && <div className="receipt-preview"><img src={activityPhoto} alt="Aperçu" /><button type="button" onClick={() => setActivityPhoto("")}><X size={14} /></button></div>}</label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><CalendarCheck2 size={16} /> {editingActivity ? "Enregistrer" : "Planifier"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={dialog === "movement"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Journal du magasin</p><DialogTitle>Mouvement — {selectedStock?.label}</DialogTitle><DialogDescription>La quantité restante sera mise à jour immédiatement sur cet appareil.</DialogDescription></DialogHeader><form onSubmit={saveMovement} className="form-grid"><label><span>Sens du mouvement *</span><select name="direction"><option>Entrée</option><option>Sortie</option></select></label><label><span>Date *</span><Input required name="date" type="date" defaultValue={isoToday()} /></label><label><span>Quantité ({selectedStock?.unit}) *</span><Input required name="quantity" type="number" min="0.01" step="0.01" /></label><label><span>Parcelle liée</span><select name="parcelId" defaultValue=""><option value="">Aucune</option>{parcels.map((parcel) => <option value={parcel.id} key={parcel.id}>{parcel.name}</option>)}</select></label><label className="full"><span>Motif</span><Input name="reason" placeholder="Ex. Application sur la parcelle Nord" /></label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><Package size={16} /> Enregistrer</Button></div></form></DialogContent></Dialog>
    <Dialog open={dialog === "template"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Bibliothèque d’interventions</p><DialogTitle>{editingTemplate ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle><DialogDescription>{editingTemplate ? "Ce modèle reste disponible comme repère pour vos futures activités." : "Il servira de repère pour créer rapidement une activité similaire."}</DialogDescription></DialogHeader><form onSubmit={saveTemplate} className="form-grid"><label className="full"><span>Nom du modèle *</span><Input required name="name" defaultValue={editingTemplate?.name} placeholder="Ex. Fertilisation de couverture" /></label><label><span>Type</span><Input name="type" defaultValue={editingTemplate?.type ?? "Entretien"} /></label><label><span>À partir de J+ *</span><Input required name="startAfterDays" min="0" type="number" defaultValue={editingTemplate?.startAfterDays} /></label><label><span>Répéter tous les (jours)</span><Input required name="frequencyDays" min="0" type="number" defaultValue={editingTemplate?.frequencyDays ?? 0} /></label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit">{editingTemplate ? "Enregistrer" : "Ajouter le modèle"}</Button></div></form></DialogContent></Dialog>
    <ActivityEditModal
      open={Boolean(modalActivity)}
      activity={modalActivity}
      parcels={parcels}
      hasFutureSeriesSiblings={Boolean(modalActivity?.seriesId) && activities.some((item) => item.seriesId === modalActivity?.seriesId && item.id !== modalActivity?.id && !item.done)}
      onClose={closeActivityModal}
      onSave={saveActivityFromModal}
      onDelete={deleteActivityFromModal}
    />
    <Dialog open={dialog === "settings"} onOpenChange={(open) => !open && closeDialog()}><DialogContent className="form-dialog"><DialogHeader><p className="eyebrow">Réglages de l’exploitation</p><DialogTitle>Paramètres</DialogTitle><DialogDescription>Ces valeurs restent uniquement sur cet appareil.</DialogDescription></DialogHeader><form onSubmit={saveSettings} className="form-grid"><label><span>Prix de vente par kg (FCFA)</span><Input required name="pricePerKg" type="number" min="0" defaultValue={settings.pricePerKg} /></label><label><span>Seuil de stock par défaut</span><Input required name="threshold" type="number" min="0" step="0.01" defaultValue={settings.defaultLowStockThreshold} /></label><label className="full"><span>Catégories de dépense</span><Textarea required name="categories" defaultValue={settings.categories.join(", ")} /><small>Séparez les catégories par des virgules.</small></label><div className="form-actions"><Button type="button" variant="ghost" onClick={closeDialog}>Annuler</Button><Button type="submit"><Settings2 size={16} /> Enregistrer</Button></div></form><BackupCard onImported={load} /></DialogContent></Dialog>
  </div>;
}
