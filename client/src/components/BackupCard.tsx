import { useRef, useState } from "react";
import { Download, Upload, DatabaseBackup, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadBackup, importBackup, readBackupFile, type HaricotManagerBackup } from "@/lib/backup";

interface BackupCardProps {
  onImported?: () => void;
}

export function BackupCard({ onImported }: BackupCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File; backup: HaricotManagerBackup } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const backup = await downloadBackup();
      const total = Object.values(backup.data).reduce((sum, rows) => sum + rows.length, 0);
      toast.success(`Sauvegarde téléchargée (${total} enregistrement${total > 1 ? "s" : ""})`);
    } catch {
      toast.error("Échec de l'export de la sauvegarde");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      // Replacing existing data is destructive, so we always confirm first —
      // a straight merge (the common case, e.g. moving to a new phone) proceeds right away.
      setPendingFile({ file, backup });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fichier de sauvegarde invalide");
    }
  };

  const runImport = async (mode: "merge" | "replace") => {
    if (!pendingFile) return;
    setImporting(true);
    try {
      await importBackup(pendingFile.backup, mode);
      toast.success(mode === "replace" ? "Données remplacées avec succès" : "Sauvegarde fusionnée avec succès");
      onImported?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'import de la sauvegarde");
    } finally {
      setImporting(false);
      setPendingFile(null);
    }
  };

  const recordCount = pendingFile
    ? Object.values(pendingFile.backup.data).reduce((sum, rows) => sum + rows.length, 0)
    : 0;

  return (
    <div className="backup-card">
      <div className="backup-card-header">
        <DatabaseBackup size={18} />
        <div>
          <h3>Sauvegarde des données</h3>
          <p>Vos données restent sur cet appareil — exportez-les régulièrement pour ne rien perdre.</p>
        </div>
      </div>
      <div className="backup-card-actions">
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
          Exporter (.json)
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
          Importer une sauvegarde
        </Button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileSelected} />
      </div>

      <AlertDialog open={!!pendingFile} onOpenChange={(open) => !open && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importer "{pendingFile?.file.name}"</AlertDialogTitle>
            <AlertDialogDescription>
              Ce fichier contient {recordCount} enregistrement{recordCount > 1 ? "s" : ""}
              {pendingFile ? ` (exporté le ${new Date(pendingFile.backup.exportedAt).toLocaleDateString("fr-FR")})` : ""}.
              Choisissez comment l'appliquer : <strong>Fusionner</strong> ajoute ces données à celles déjà présentes
              (recommandé pour changer d'appareil). <strong>Remplacer</strong> efface d'abord toutes les données
              actuelles — irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFile(null)}>Annuler</AlertDialogCancel>
            <Button variant="outline" onClick={() => runImport("merge")}>
              Fusionner
            </Button>
            <AlertDialogAction onClick={() => runImport("replace")} className="destructive-action">
              Remplacer tout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
