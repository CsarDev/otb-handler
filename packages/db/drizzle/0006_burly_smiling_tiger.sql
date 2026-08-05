-- Migración 0006 — Invariante de dedup para cobros con linaje (D13).
-- ADITIVO: índice único PARCIAL sobre (socio_id, aporte_id, mes, gestion)
-- WHERE aporte_id IS NOT NULL. Los registros legacy tienen aporte_id NULL y
-- NO quedan cubiertos (pueden repetir (socio_id, mes, gestion) legítimamente,
-- datos pre-lineaje D2). El índice no toca datos existentes (219 registros
-- reales, 0 con aporte_id NOT NULL → no puede conflictuar); droppable a voluntad.
-- Hipotético install con duplicados: CREATE UNIQUE INDEX falla loud (fail-fast)
-- y el operador corre un dedup one-off antes de aplicar.
CREATE UNIQUE INDEX `aporte_dedup_unico` ON `aportes` (`socio_id`,`aporte_id`,`mes`,`gestion`) WHERE "aportes"."aporte_id" IS NOT NULL;