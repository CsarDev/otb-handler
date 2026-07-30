# Task-10: UI Form Fixes — Corrección de Selects y Opciones en Formularios

## Description

Corregir bugs de UI en formularios que envían valores incorrectos o tienen opciones inválidas. Cambios puramente de frontend, sin impacto en API.

### Actividades — Select de Tipo
- `value={t.nombre}` → `value={t.id}` (enviar UUID, no nombre)
- `key={t.nombre}` → `key={t.id}` (key única por UUID)
- Display text: `{t.nombre}` se mantiene

### Aportes — Select de Tipo
- Remover opciones `individual` y `anual`
- Solo mantener `mensual` y `extraordinario` (coincide con el schema enum)
- Default preseleccionado: `mensual`

### Config — addTipoActividad
- No enviar `id: crypto.randomUUID()` en el payload
- Enviar solo `{ nombre, opciones, multas, tolerancia }` — la API genera el UUID

### Config — removeTipoActividad
- Cambiar `handleRemoveTipo(t.nombre)` a `handleRemoveTipo(t.id)`
- Ya cubierto en Task-05

### Multas — Saldo Pendiente en Tabla y Pago Parcial UI
- Agregar columna "Saldo Pendiente" con `Bs {m.saldoPendiente.toFixed(2)}`
- En modal de pago: mostrar texto "Saldo pendiente: Bs {multa.saldoPendiente}"
- Pre-fill monto con `multa.saldoPendiente` (no `multa.monto`)

## Files

- `apps/web/src/routes/actividades.tsx` — select value = t.id, key = t.id
- `apps/web/src/routes/aportes.tsx` — select options solo mensual/extraordinario
- `apps/web/src/routes/config.tsx` — remover randomUUID del payload
- `apps/web/src/routes/multas.tsx` — columna saldoPendiente, partial payment UI

## Dependencies

- Task-01 (saldoPendiente existe en schema y response)
- Task-03 (socioNombre/socioApellido disponibles para display en tablas)
- Task-05 (config.tsx fixes parcialmente cubiertos)

## Acceptance Criteria

- [ ] Select de tipo en actividad usa `t.id` como value y `t.nombre` como display
- [ ] Select de tipo en aporte solo tiene opciones "Mensual" y "Extraordinario"
- [ ] Select de tipo en aporte tiene "mensual" preseleccionado por defecto
- [ ] `addTipoActividad` no envía `id` en el body del POST
- [ ] Tabla de multas muestra columna "Saldo Pendiente" con formato `Bs {m.saldoPendiente.toFixed(2)}`
- [ ] Modal de pago de multa muestra "Saldo pendiente: Bs {monto}" y pre-fill con saldoPendiente
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

55
