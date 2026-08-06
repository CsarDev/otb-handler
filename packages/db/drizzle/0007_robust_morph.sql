-- Migración 0007 — Aplicación M:N definición↔grupo (D23). ADITIVO primero
-- (join table + backfill de `aplica_grupo_id`); el DROP de la columna legacy
-- va AL FINAL. Usa `ALTER TABLE ... DROP COLUMN` nativo (SQLite 3.35+), NO el
-- recreate `__new_` que genera drizzle-kit: el migrator de drizzle envuelve
-- todo en UNA transacción, donde `PRAGMA foreign_keys=OFF` es un no-op, y el
-- DROP TABLE del recreate hace un DELETE implícito que viola las FKs de
-- `aportes`/`socio_aportes` cuando la DB tiene datos (verificado en la DB
-- real: 222 registros). DROP COLUMN no toca las filas y respeta `foreign_keys=ON`.
CREATE TABLE `aportes_definicion_grupos` (
	`definition_id` text NOT NULL,
	`grupo_id` text NOT NULL,
	PRIMARY KEY(`definition_id`, `grupo_id`),
	FOREIGN KEY (`definition_id`) REFERENCES `aportes_definicion`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- BACKFILL aditivo: convierte la columna singular → filas de la join.
-- Idempotente (INSERT OR IGNORE + PK compuesta); NO toca socios ni registros.
INSERT OR IGNORE INTO `aportes_definicion_grupos` (definition_id, grupo_id)
SELECT id, aplica_grupo_id
FROM `aportes_definicion`
WHERE aplica_grupo_id IS NOT NULL;
--> statement-breakpoint
-- DROP de la columna legacy (la join ya es la única fuente de verdad, D1).
ALTER TABLE `aportes_definicion` DROP COLUMN `aplica_grupo_id`;