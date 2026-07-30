import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { Socio, Movimiento, Egreso } from '@otb/core';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { fontSize: 18, marginBottom: 20, textAlign: 'center' },
  section: { marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontWeight: 'bold' },
});

type ReporteProps = {
  titulo: string;
  socios: Socio[];
  movimientos: Movimiento[];
  egresos: Egreso[];
};

export function ReportePDF({ titulo, socios, movimientos, egresos }: ReporteProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{titulo}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Socios: {socios.length}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Movimientos: {movimientos.length}</Text>
          {movimientos.map((m) => (
            <View key={m.id} style={styles.row}>
              <Text>{m.fecha}</Text>
              <Text>{m.tipo}</Text>
              <Text>Bs {m.monto.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Egresos: {egresos.length}</Text>
          {egresos.map((e) => (
            <View key={e.id} style={styles.row}>
              <Text>{e.fecha}</Text>
              <Text>{e.categoria}</Text>
              <Text>Bs {e.monto.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function generateReportPdf(props: ReporteProps): Promise<Blob> {
  return pdf(<ReportePDF {...props} />).toBlob();
}
