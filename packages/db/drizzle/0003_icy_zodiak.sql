CREATE TABLE `acciones_socio` (
	`id` text PRIMARY KEY NOT NULL,
	`clave` text NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acciones_socio_clave_unique` ON `acciones_socio` (`clave`);--> statement-breakpoint
CREATE TABLE `estado_acciones` (
	`estado_id` text NOT NULL,
	`accion_id` text NOT NULL,
	PRIMARY KEY(`estado_id`, `accion_id`),
	FOREIGN KEY (`estado_id`) REFERENCES `estados_socio`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accion_id`) REFERENCES `acciones_socio`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `estados_socio` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`color` text DEFAULT '#22c55e' NOT NULL,
	`es_activo` integer DEFAULT 0 NOT NULL,
	`es_baja` integer DEFAULT 0 NOT NULL,
	`es_defecto` integer DEFAULT 0 NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grupos` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text
);
--> statement-breakpoint
CREATE TABLE `socio_grupos` (
	`socio_id` text NOT NULL,
	`grupo_id` text NOT NULL,
	PRIMARY KEY(`socio_id`, `grupo_id`),
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `socios` ADD `estado_id` text REFERENCES estados_socio(id);--> statement-breakpoint
ALTER TABLE `socios` ADD `grupo_primario_id` text REFERENCES grupos(id);--> statement-breakpoint
ALTER TABLE `socios` ADD `motivo_baja` text;--> statement-breakpoint
ALTER TABLE `socios` ADD `fecha_baja` text;
-- Seed del catálogo (mismos ids que packages/db/src/catalogo.ts)--> statement-breakpoint
INSERT INTO `acciones_socio` (id, clave, nombre, descripcion, orden) VALUES
	('acc-asistencia', 'asistencia', 'Asistencia', NULL, 1),
	('acc-aportes', 'aportes', 'Aportes', NULL, 2),
	('acc-pagos', 'pagos', 'Pagos', NULL, 3),
	('acc-multas', 'multas', 'Multas', NULL, 4),
	('acc-anulaciones', 'anulaciones', 'Anulaciones', NULL, 5),
	('acc-reportes', 'reportes', 'Reportes', NULL, 6),
	('acc-dashboard', 'dashboard', 'Dashboard', NULL, 7);--> statement-breakpoint
INSERT INTO `estados_socio` (id, nombre, color, es_activo, es_baja, es_defecto, orden) VALUES
	('est-activo', 'activo', '#22c55e', 1, 0, 1, 1),
	('est-suspendido', 'suspendido', '#f59e0b', 0, 0, 0, 2),
	('est-inactivo', 'inactivo', '#9ca3af', 0, 0, 0, 3),
	('est-baja', 'dado_de_baja', '#ef4444', 0, 1, 0, 4);--> statement-breakpoint
INSERT INTO `estado_acciones` (estado_id, accion_id) SELECT 'est-activo', id FROM `acciones_socio`;--> statement-breakpoint
INSERT INTO `estado_acciones` (estado_id, accion_id) VALUES ('est-suspendido', 'acc-reportes');
-- Backfill por nombre de socios existentes (fase 0004, junto al DROP COLUMN de `estado`):
-- UPDATE `socios` SET `estado_id` = 'est-activo'     WHERE `estado` = 'activo';
-- UPDATE `socios` SET `estado_id` = 'est-suspendido' WHERE `estado` = 'suspendido';
-- UPDATE `socios` SET `estado_id` = 'est-inactivo'   WHERE `estado` = 'inactivo';