import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Activity, ActivityRecurrence, Parcel } from "@/lib/types";
import { uid } from "@/lib/format";

/** Fixed category list per the app's field-work vocabulary. */
export const ACTIVITY_CATEGORIES = ["Semis", "Engrais", "Herbicide", "Insecticide", "Désherbage", "Entretien", "Récolte"] as const;

const RECURRENCE_LABELS: Record<ActivityRecurrence, string> = {
  none: "Aucune",
  "7": "Tous les 7 jours",
  "14": "Tous les 14 jours",
  "30": "Tous les 30 jours",
  custom: "Personnalisé",
};

export type EditScope = "occurrence" | "series";

type ActivityEditModalProps = {
  open: boolean;
  activity: Activity | null;
  parcels: Parcel[];
  /** True when other not-yet-done activities share this occurrence's seriesId — this is
   *  what decides whether we need to ask "cette occurrence" vs "toute la série". */
  hasFutureSeriesSiblings: boolean;
  onClose: () => void;
  onSave: (updated: Activity, scope: EditScope) => void | Promise<void>;
  onDelete: (activity: Activity, scope: EditScope) => void | Promise<void>;
};

export function ActivityEditModal({ open, activity, parcels, hasFutureSeriesSiblings, onClose, onSave, onDelete }: ActivityEditModalProps) {
  const [recurrence, setRecurrence] = useState<ActivityRecurrence>("none");
  const [scope, setScope] = useState<EditScope>("occurrence");

  // Reset the local (non-form-controlled) bits whenever a different activity is opened.
  useEffect(() => {
    setRecurrence(activity?.recurrence ?? "none");
    setScope("occurrence");
  }, [activity?.id]);

  if (!activity) return null;
  const isSeries = Boolean(activity.seriesId) && hasFutureSeriesSiblings;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chosenRecurrence = String(form.get("recurrence")) as ActivityRecurrence;
    const customFrequencyDays = chosenRecurrence === "custom" ? Number(form.get("customFrequencyDays")) || undefined : undefined;
    const isDone = form.get("done") === "on";

    const updated: Activity = {
      ...activity,
      name: String(form.get("name")).trim(),
      parcelId: String(form.get("parcelId")),
      type: String(form.get("type")),
      scheduledAt: String(form.get("scheduledAt")),
      time: String(form.get("time") || "08:00"),
      recurrence: chosenRecurrence,
      customFrequencyDays,
      frequencyDays: chosenRecurrence === "none" ? undefined : customFrequencyDays ?? Number(chosenRecurrence),
      seriesId: activity.seriesId ?? (chosenRecurrence !== "none" ? uid() : undefined),
      notes: String(form.get("notes") || "") || undefined,
      done: isDone,
      doneAt: isDone ? (activity.done ? activity.doneAt : new Date().toISOString().slice(0, 10)) : undefined,
    };

    await onSave(updated, isSeries ? scope : "occurrence");
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer cette activité ?")) return;
    await onDelete(activity, isSeries ? scope : "occurrence");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <p className="eyebrow">Intervention terrain</p>
          <DialogTitle>Modifier l’activité</DialogTitle>
          <DialogDescription>Ajustez tous les détails de cette intervention planifiée.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="full">
            <span>Titre de l’activité *</span>
            <Input required name="name" defaultValue={activity.name} placeholder="Ex. Pulvérisation poste levé" />
          </label>

          <label>
            <span>Parcelle *</span>
            <select required name="parcelId" defaultValue={activity.parcelId}>
              {parcels.map((parcel) => (
                <option value={parcel.id} key={parcel.id}>{parcel.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Type / Catégorie *</span>
            <select required name="type" defaultValue={ACTIVITY_CATEGORIES.includes(activity.type as (typeof ACTIVITY_CATEGORIES)[number]) ? activity.type : ACTIVITY_CATEGORIES[5]}>
              {ACTIVITY_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Date *</span>
            <Input required name="scheduledAt" type="date" defaultValue={activity.scheduledAt} />
          </label>

          <label>
            <span>Heure *</span>
            <Input required name="time" type="time" defaultValue={activity.time || "08:00"} />
          </label>

          <label>
            <span>Récurrence</span>
            <select name="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as ActivityRecurrence)}>
              {(Object.keys(RECURRENCE_LABELS) as ActivityRecurrence[]).map((value) => (
                <option key={value} value={value}>{RECURRENCE_LABELS[value]}</option>
              ))}
            </select>
          </label>

          {recurrence === "custom" && (
            <label>
              <span>Tous les combien de jours ? *</span>
              <Input required name="customFrequencyDays" type="number" min="1" defaultValue={activity.customFrequencyDays ?? activity.frequencyDays ?? 7} />
            </label>
          )}

          <label className="full">
            <span>Notes</span>
            <Textarea name="notes" defaultValue={activity.notes} placeholder="Détails, dosage, précautions…" />
          </label>

          <label className="full checkbox-field">
            <input type="checkbox" name="done" defaultChecked={activity.done} />
            <span>Marquer comme fait</span>
          </label>

          {isSeries && (
            <div className="full series-scope">
              <span>Cette activité fait partie d’une série récurrente. Appliquer les changements à :</span>
              <label>
                <input type="radio" name="scope-choice" checked={scope === "occurrence"} onChange={() => setScope("occurrence")} />
                <span>Modifier seulement cette occurrence</span>
              </label>
              <label>
                <input type="radio" name="scope-choice" checked={scope === "series"} onChange={() => setScope("series")} />
                <span>Modifier toute la série à partir de cette date</span>
              </label>
            </div>
          )}

          <div className="form-actions">
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              <Trash2 size={16} /> Supprimer
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit"><CalendarCheck2 size={16} /> Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
