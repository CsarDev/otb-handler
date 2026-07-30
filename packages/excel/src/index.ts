import * as XLSX from 'xlsx';
import type { DBData } from '@otb/core';

export function buildWorkbook(data: DBData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const sociosWS = XLSX.utils.json_to_sheet(data.socios);
  XLSX.utils.book_append_sheet(wb, sociosWS, 'Socios');

  const aportesWS = XLSX.utils.json_to_sheet(data.aportes);
  XLSX.utils.book_append_sheet(wb, aportesWS, 'Aportes');

  const multasWS = XLSX.utils.json_to_sheet(data.multas);
  XLSX.utils.book_append_sheet(wb, multasWS, 'Multas');

  const movimientosWS = XLSX.utils.json_to_sheet(data.movimientos);
  XLSX.utils.book_append_sheet(wb, movimientosWS, 'Movimientos');

  const egresosWS = XLSX.utils.json_to_sheet(data.egresos);
  XLSX.utils.book_append_sheet(wb, egresosWS, 'Egresos');

  return wb;
}

export function parseWorkbook(wb: XLSX.WorkBook): Partial<DBData> {
  const result: Partial<DBData> = {};

  if (wb.SheetNames.includes('Socios')) {
    const ws = wb.Sheets['Socios'];
    result.socios = XLSX.utils.sheet_to_json(ws);
  }

  if (wb.SheetNames.includes('Aportes')) {
    const ws = wb.Sheets['Aportes'];
    result.aportes = XLSX.utils.sheet_to_json(ws);
  }

  if (wb.SheetNames.includes('Multas')) {
    const ws = wb.Sheets['Multas'];
    result.multas = XLSX.utils.sheet_to_json(ws);
  }

  if (wb.SheetNames.includes('Movimientos')) {
    const ws = wb.Sheets['Movimientos'];
    result.movimientos = XLSX.utils.sheet_to_json(ws);
  }

  if (wb.SheetNames.includes('Egresos')) {
    const ws = wb.Sheets['Egresos'];
    result.egresos = XLSX.utils.sheet_to_json(ws);
  }

  return result;
}
