-- Migración 0005 — Aportes como definiciones dinámicas (D1) con asignación
-- many-to-many socio↔aporte. ADITIVO primero (definiciones, seed, join,
-- `aportes.aporte_id` y backfill); el bloque DROP (columnas legacy + tabla
-- `tipos_aporte`) va AL FINAL (Migration/Rollout del design).
CREATE TABLE `aportes_definicion` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`monto` real NOT NULL,
	`recurrencia` text DEFAULT 'mensual' NOT NULL,
	`inicio` text,
	`fin` text,
	`modalidad_pago` text DEFAULT 'cuotas' NOT NULL,
	`aplica_grupo_id` text REFERENCES grupos(id),
	`activo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
-- Seed de las 4 definiciones por defecto (mismos ids que packages/db/src/catalogo.ts).
-- INSERT OR IGNORE: idempotente — no duplica filas si la migración se re-ejecuta.
INSERT OR IGNORE INTO `aportes_definicion`
	(id, nombre, monto, recurrencia, inicio, fin, modalidad_pago, aplica_grupo_id, activo)
	VALUES
	('ap-mensual',  'Cuota Social Mensual', 50, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
	('ap-familiar', 'Aporte Familiar',      30, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
	('ap-jubilado', 'Aporte Jubilado',      25, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
	('ap-honorario','Aporte Honorario',      0, 'mensual', NULL, NULL, 'cuotas', NULL, 1);
--> statement-breakpoint
CREATE TABLE `socio_aportes` (
	`socio_id` text NOT NULL,
	`aporte_id` text NOT NULL,
	PRIMARY KEY(`socio_id`, `aporte_id`),
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`aporte_id`) REFERENCES `aportes_definicion`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Linaje de los registros de cobro (nullable: registros legacy quedan NULL, D2).
ALTER TABLE `aportes` ADD `aporte_id` text REFERENCES aportes_definicion(id);
--> statement-breakpoint
-- BACKFILL aditivo: convierte socios.tipo_aporte_id → filas socio_aportes.
-- Idempotente (INSERT OR IGNORE + PK compuesta). NO toca `aportes` existentes.
INSERT OR IGNORE INTO `socio_aportes` (socio_id, aporte_id)
SELECT s.id,
	CASE s.tipo_aporte_id
		WHEN 'ta-pleno' THEN 'ap-mensual'
		WHEN 'ta-familiar' THEN 'ap-familiar'
		WHEN 'ta-jubilado' THEN 'ap-jubilado'
		WHEN 'ta-honorario' THEN 'ap-honorario'
	END
FROM `socios` s
WHERE s.tipo_aporte_id IS NOT NULL;
--> statement-breakpoint
-- Bloque DROP final (tras verificar lo aditivo): columnas legacy + tabla vieja.
ALTER TABLE `socios` DROP COLUMN `tipo_aporte_id`;
--> statement-breakpoint
ALTER TABLE `socios` DROP COLUMN `aporte_base`;
--> statement-breakpoint
DROP TABLE `tipos_aporte`;
