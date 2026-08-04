CREATE TABLE `tipos_aporte` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`monto_base` real NOT NULL,
	`descripcion` text,
	`activo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `socios` ADD `tipo_aporte_id` text REFERENCES tipos_aporte(id);
-- Seed del catálogo de tipos de aporte (mismos ids que packages/db/src/catalogo.ts).
-- INSERT OR IGNORE: idempotente — no duplica filas si la migración se re-ejecuta.--> statement-breakpoint
INSERT OR IGNORE INTO `tipos_aporte` (id, nombre, monto_base, descripcion, activo) VALUES
	('ta-pleno', 'Socio Pleno', 50, 'Cuota plena mensual', 1),
	('ta-familiar', 'Familiar', 30, 'Cuota familiar', 1),
	('ta-jubilado', 'Jubilado', 25, 'Cuota jubilados', 1),
	('ta-honorario', 'Honorario', 0, 'Cuota simbólica (0)', 1);--> statement-breakpoint
-- Backfill por monto: socio cuyo aporte_base coincide con un monto_base del
-- catálogo → ese tipo; sin coincidencia → tipo activo por defecto (ta-pleno).
-- Idempotente (WHERE tipo_aporte_id IS NULL) y NO toca `aportes` existentes:
-- solo asigna socios.tipo_aporte_id. (Fase 0004 — limpieza de aporte_base en
-- una migración posterior.)
UPDATE `socios` SET `tipo_aporte_id` = CASE `aporte_base`
	WHEN 50 THEN 'ta-pleno'
	WHEN 30 THEN 'ta-familiar'
	WHEN 25 THEN 'ta-jubilado'
	WHEN 0 THEN 'ta-honorario'
	ELSE 'ta-pleno'
END
WHERE `tipo_aporte_id` IS NULL;