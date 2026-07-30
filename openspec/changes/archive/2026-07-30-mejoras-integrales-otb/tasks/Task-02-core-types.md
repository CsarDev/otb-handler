# Task-02: Core Types — Interfaces Actualizadas con Nombres y Reportes

## Description

Actualizar `packages/core/src/index.ts` con los nuevos campos en los tipos existentes (`Multa`, `Aporte`, `Actividad`) y agregar los tres tipos de respuesta para los endpoints de reportes (`BalanceReport`, `LibroDiarioEntry`, `ResumenSocioReport`). Todos los campos nuevos de JOIN son `| null` porque LEFT JOIN puede no encontrar match (FK huérfanas en datos existentes).

## Files

- `packages/core/src/index.ts` — modificar tipos + agregar tipos de reporte

## Dependencies

Ninguna (tipos puramente sintácticos, no dependen de schema).

## Acceptance Criteria

- [x] `Multa` incluye `socioNombre: string | null`, `socioApellido: string | null`, `saldoPendiente: number`, `montoPagado: number`
- [x] `Aporte` incluye `socioNombre: string | null`, `socioApellido: string | null`
- [x] `Actividad` incluye `tipoNombre: string | null`
- [x] Nuevo tipo `BalanceReport` con `totalIngresos`, `totalEgresos`, `neto`, `desglose: Array<{ categoria: string; monto: number }>`
- [x] Nuevo tipo `LibroDiarioEntry` extiende `Movimiento` con `socioNombre: string | null`, `socioApellido: string | null`
- [x] Nuevo tipo `ResumenSocioReport` con `totalAportado`, `multasPagadas`, `saldoPendiente`, `socio: { id, nombre, apellidoPaterno }`
- [x] `pnpm typecheck` pasa sin errores

## Estimated Lines

35
