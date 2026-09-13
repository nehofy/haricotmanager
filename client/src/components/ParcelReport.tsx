/** Design reminder: an Atelier des Récoltes report is sparse, factual, warm and field-oriented. */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Activity, Expense, Parcel, Settings } from "@/lib/types";
import { formatDate, formatFCFA, formatNumber } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 34, backgroundColor: "#FCFBF7", fontSize: 9, color: "#27342A", fontFamily: "Helvetica" },
  eyebrow: { color: "#A95E3B", fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 7 },
  title: { color: "#215A3B", fontSize: 25, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  sub: { color: "#687267", fontSize: 10, marginBottom: 17 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#D8DDCF", marginBottom: 16 },
  section: { marginBottom: 15 },
  sectionTitle: { color: "#215A3B", fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 7 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "30%", backgroundColor: "#EDF2E8", padding: 8, borderLeftWidth: 3, borderLeftColor: "#A95E3B" },
  label: { color: "#687267", fontSize: 7, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  value: { color: "#27342A", fontSize: 10, fontFamily: "Helvetica-Bold" },
  tableHead: { flexDirection: "row", backgroundColor: "#215A3B", color: "#FFFFFF", padding: 6, fontFamily: "Helvetica-Bold" },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#E7E9E1" },
  cellDate: { width: "18%" }, cellName: { width: "45%" }, cellNum: { width: "37%", textAlign: "right" },
  image: { width: 118, height: 82, objectFit: "cover", marginRight: 7, marginBottom: 7 },
});

export function ParcelReport({ parcel, expenses, activities, settings }: { parcel: Parcel; expenses: Expense[]; activities: Activity[]; settings: Settings }) {
  const costs = expenses.reduce((sum, item) => sum + item.total, 0);
  const actualProduction = (parcel.actualYieldKgHa ?? 0) * parcel.areaHa;
  const margin = actualProduction * settings.pricePerKg - costs;
  return (
    <Document title={`Rapport — ${parcel.name}`} author="HaricotManager PWA">
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>HaricotManager PWA · Rapport de parcelle</Text>
        <Text style={styles.title}>{parcel.name}</Text>
        <Text style={styles.sub}>{parcel.variety || "Variété non précisée"} · {formatNumber(parcel.areaHa, 2)} ha · {parcel.location || "Localisation non précisée"}</Text>
        <View style={styles.rule} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synthèse économique</Text>
          <View style={styles.row}>
            <View style={styles.metric}><Text style={styles.label}>Dépenses</Text><Text style={styles.value}>{formatFCFA(costs)}</Text></View>
            <View style={styles.metric}><Text style={styles.label}>Production réelle</Text><Text style={styles.value}>{formatNumber(actualProduction)} kg</Text></View>
            <View style={styles.metric}><Text style={styles.label}>Marge estimée</Text><Text style={styles.value}>{formatFCFA(margin)}</Text></View>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Culture</Text>
          <View style={styles.row}>
            <View style={styles.metric}><Text style={styles.label}>Semis</Text><Text style={styles.value}>{formatDate(parcel.sowingDate)}</Text></View>
            <View style={styles.metric}><Text style={styles.label}>Récolte estimée</Text><Text style={styles.value}>{formatDate(parcel.estimatedHarvestDate)}</Text></View>
            <View style={styles.metric}><Text style={styles.label}>Rendement réel</Text><Text style={styles.value}>{parcel.actualYieldKgHa ? `${formatNumber(parcel.actualYieldKgHa)} kg/ha` : "À renseigner"}</Text></View>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dépenses ({expenses.length})</Text>
          <View style={styles.tableHead}><Text style={styles.cellDate}>Date</Text><Text style={styles.cellName}>Désignation</Text><Text style={styles.cellNum}>Montant</Text></View>
          {expenses.length ? expenses.map((item) => <View style={styles.tableRow} key={item.id}><Text style={styles.cellDate}>{formatDate(item.date)}</Text><Text style={styles.cellName}>{item.category} · {item.description || "Sans détail"}</Text><Text style={styles.cellNum}>{formatFCFA(item.total)}</Text></View>) : <Text>Aucune dépense enregistrée.</Text>}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calendrier d’activités</Text>
          <View style={styles.tableHead}><Text style={styles.cellDate}>Prévu</Text><Text style={styles.cellName}>Intervention</Text><Text style={styles.cellNum}>État</Text></View>
          {activities.length ? activities.map((item) => <View style={styles.tableRow} key={item.id}><Text style={styles.cellDate}>{formatDate(item.scheduledAt)}</Text><Text style={styles.cellName}>{item.name}</Text><Text style={styles.cellNum}>{item.done ? `Fait · ${formatDate(item.doneAt)}` : "À faire"}</Text></View>) : <Text>Aucune activité planifiée.</Text>}
        </View>
        {parcel.photos.length > 0 && <View style={styles.section}><Text style={styles.sectionTitle}>Suivi visuel</Text><View style={styles.row}>{parcel.photos.slice(0, 6).map((photo) => <Image style={styles.image} src={photo.dataUrl} key={photo.id} />)}</View></View>}
      </Page>
    </Document>
  );
}
