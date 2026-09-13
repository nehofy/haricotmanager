/** Design reminder: parcel controls are an agricultural workbench—clear filters, stamped crop states and paper-led cards. */
import { useMemo, useState } from "react";
import { Download, MapPin, Pencil, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatFCFA, formatNumber } from "@/lib/format";
import type { Parcel, Settings } from "@/lib/types";

type ParcelStatus = "En culture" | "À récolter" | "Terminée" | "Planifiée";
type StatusFilter = "Toutes" | "En culture" | "À récolter" | "Terminée" | "Planifiée";
type MarginFilter = "Toutes" | "Positive" | "Négative" | "À renseigner";
type SortOption = "Récentes" | "Marge décroissante" | "Marge croissante" | "Rendement décroissant" | "Superficie décroissante" | "Récolte la plus proche";

const fallbackImageUrl = "/images/parcel-card.jpg";

function getParcelStatus(parcel: Parcel): ParcelStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (parcel.actualHarvestDate) return "Terminée";
  if (parcel.estimatedHarvestDate && parcel.estimatedHarvestDate <= today) return "À récolter";
  if (parcel.sowingDate <= today) return "En culture";
  return "Planifiée";
}

function statusClass(status: ParcelStatus) {
  return status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-").toLowerCase();
}

export function ParcelList({
  parcels,
  costByParcel,
  settings,
  selectedParcelId,
  onCreate,
  onEdit,
  onDelete,
  onExport,
}: {
  parcels: Parcel[];
  costByParcel: Record<string, number>;
  settings: Settings;
  selectedParcelId?: string;
  onCreate: () => void;
  onEdit: (parcel: Parcel) => void;
  onDelete: (id: string) => void;
  onExport: (parcel: Parcel) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Toutes");
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("Toutes");
  const [sort, setSort] = useState<SortOption>("Récentes");

  const parcelRows = useMemo(() => parcels.map((parcel) => {
    const costs = costByParcel[parcel.id] ?? 0;
    const production = (parcel.actualYieldKgHa ?? 0) * parcel.areaHa;
    const marginKnown = parcel.actualYieldKgHa !== undefined;
    return { parcel, costs, production, margin: production * settings.pricePerKg - costs, marginKnown, status: getParcelStatus(parcel) };
  }), [parcels, costByParcel, settings.pricePerKg]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
    const rows = parcelRows.filter((row) => {
      const haystack = `${row.parcel.name} ${row.parcel.variety} ${row.parcel.location}`.toLocaleLowerCase("fr-FR");
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesStatus = statusFilter === "Toutes" || row.status === statusFilter;
      const matchesMargin = marginFilter === "Toutes" || (marginFilter === "À renseigner" ? !row.marginKnown : row.marginKnown && (marginFilter === "Positive" ? row.margin >= 0 : row.margin < 0));
      return matchesSearch && matchesStatus && matchesMargin;
    });
    return [...rows].sort((a, b) => {
      if (sort === "Marge décroissante") return b.margin - a.margin;
      if (sort === "Marge croissante") return a.margin - b.margin;
      if (sort === "Rendement décroissant") return (b.parcel.actualYieldKgHa ?? b.parcel.estimatedYieldKgHa ?? 0) - (a.parcel.actualYieldKgHa ?? a.parcel.estimatedYieldKgHa ?? 0);
      if (sort === "Superficie décroissante") return b.parcel.areaHa - a.parcel.areaHa;
      if (sort === "Récolte la plus proche") return (a.parcel.estimatedHarvestDate || "9999-12-31").localeCompare(b.parcel.estimatedHarvestDate || "9999-12-31");
      return b.parcel.createdAt.localeCompare(a.parcel.createdAt);
    });
  }, [parcelRows, search, statusFilter, marginFilter, sort]);

  const clearFilters = () => { setSearch(""); setStatusFilter("Toutes"); setMarginFilter("Toutes"); setSort("Récentes"); };
  const filtersActive = Boolean(search) || statusFilter !== "Toutes" || marginFilter !== "Toutes" || sort !== "Récentes";

  return <section className="content-section">
    <div className="section-intro">
      <div><p className="eyebrow">Suivi des cultures</p><h1>Parcelles</h1><p>Retrouvez rapidement les parcelles à suivre, à récolter ou les plus rentables.</p></div>
      <Button onClick={onCreate}>Ajouter une parcelle</Button>
    </div>
    <section className="parcel-filter-workbench" aria-label="Filtres et tri des parcelles">
      <div className="filter-heading"><span className="filter-stamp"><SlidersHorizontal size={16} /></span><div><p className="eyebrow">Outils de terrain</p><strong>Affiner la vue des cultures</strong></div><span className="filter-count">{filteredRows.length} / {parcels.length}</span></div>
      <div className="filter-controls">
        <label className="parcel-search-field"><Search size={16} /><span className="sr-only">Rechercher une parcelle</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, variété ou lieu" /></label>
        <label><span>Statut</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option>Toutes</option><option>En culture</option><option>À récolter</option><option>Terminée</option><option>Planifiée</option></select></label>
        <label><span>Marge</span><select value={marginFilter} onChange={(event) => setMarginFilter(event.target.value as MarginFilter)}><option>Toutes</option><option>Positive</option><option>Négative</option><option>À renseigner</option></select></label>
        <label><span>Trier par</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option>Récentes</option><option>Marge décroissante</option><option>Marge croissante</option><option>Rendement décroissant</option><option>Superficie décroissante</option><option>Récolte la plus proche</option></select></label>
        {filtersActive && <button className="filter-reset" onClick={clearFilters}><RotateCcw size={14} /> Réinitialiser</button>}
      </div>
      <div className="status-guide"><span className="status-en-culture">En culture</span><span className="status-a-recolter">À récolter</span><span className="status-terminee">Terminée</span><span className="status-planifiee">Planifiée</span></div>
    </section>
    {filteredRows.length ? <div className="parcel-grid">{filteredRows.map(({ parcel, costs, margin, marginKnown, status }) => <article className={`parcel-card ${selectedParcelId === parcel.id ? "selected" : ""}`} key={parcel.id}>
      <div className="parcel-visual">{parcel.photos[0] ? <img src={parcel.photos[0].dataUrl} alt={`Suivi de ${parcel.name}`} /> : <img src={fallbackImageUrl} alt="Haricots en panier" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<span className="parcel-area">{formatNumber(parcel.areaHa, 2)} ha</span><span className={`parcel-status status-${statusClass(status)}`}>{status}</span></div>
      <div className="parcel-body"><div className="parcel-card-head"><div><p className="eyebrow">{parcel.variety || "Variété à préciser"}</p><h2>{parcel.name}</h2></div><button className="icon-button" onClick={() => onDelete(parcel.id)} aria-label={`Supprimer ${parcel.name}`}><X size={17} /></button></div><p className="parcel-location"><MapPin size={14} /> {parcel.location || "Localisation à préciser"}</p><div className="parcel-facts"><span><small>Semis</small>{formatDate(parcel.sowingDate)}</span><span><small>Récolte</small>{formatDate(parcel.estimatedHarvestDate)}</span></div><div className="margin-line"><span>Marge estimée</span><strong className={!marginKnown ? "pending-margin" : margin >= 0 ? "profit" : "loss"}>{marginKnown ? formatFCFA(margin) : "À renseigner"}</strong></div>{parcel.photos.length > 1 && <div className="photo-strip">{parcel.photos.slice(1, 4).map((photo) => <img src={photo.dataUrl} alt="Suivi de la parcelle" key={photo.id} />)}<span>+{parcel.photos.length - 1}</span></div>}<div className="parcel-actions"><Button variant="outline" onClick={() => onExport(parcel)}><Download size={15} /> Rapport PDF</Button><Button variant="ghost" onClick={() => onEdit(parcel)}><Pencil size={14} /> Modifier</Button></div></div>
    </article>)}</div> : <div className="filtered-empty"><Search size={23} /><div><h2>Aucune parcelle ne correspond à cette vue</h2><p>Modifiez vos critères ou réinitialisez les filtres pour retrouver l’ensemble des cultures.</p></div><Button variant="outline" onClick={clearFilters}><RotateCcw size={15} /> Réinitialiser</Button></div>}
  </section>;
}
