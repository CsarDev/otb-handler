-- Migración 0007 — Aplicación M:N definición↔grupo (D23). ADITIVO primero
-- (join table + backfill de `aplica_grupo_id`); el bloque DROP de la columna
-- legacy (recreate de `aportes_definicion`) va AL FINAL.
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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_aportes_definicion` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`monto` real NOT NULL,
	`recurrencia` text DEFAULT 'mensual' NOT NULL,
	`inicio` text,
	`fin` text,
	`modalidad_pago` text DEFAULT 'cuotas' NOT NULL,
	`activo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_aportes_definicion`("id", "nombre", "monto", "recurrencia", "inicio", "fin", "modalidad_pago", "activo") SELECT "id", "nombre", "monto", "recurrencia", "inicio", "fin", "modalidad_pago", "activo" FROM `aportes_definicion`;--> statement-breakpoint
DROP TABLE `aportes_definicion`;--> statement-breakpoint
ALTER TABLE `__new_aportes_definicion` RENAME TO `aportes_definicion`;--> statement-breakpoint
PRAGMA foreign_keys=ON;