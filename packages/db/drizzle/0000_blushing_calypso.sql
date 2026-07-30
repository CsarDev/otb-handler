CREATE TABLE `actividades` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo_id` text NOT NULL,
	`fecha` text NOT NULL,
	`hora` text,
	`descripcion` text,
	FOREIGN KEY (`tipo_id`) REFERENCES `tipos_actividad`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `aportes` (
	`id` text PRIMARY KEY NOT NULL,
	`socio_id` text NOT NULL,
	`mes` integer,
	`gestion` integer,
	`tipo` text DEFAULT 'mensual' NOT NULL,
	`monto_base` real NOT NULL,
	`numero_recibo` text,
	`fecha_pago` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asistencia` (
	`id` text PRIMARY KEY NOT NULL,
	`actividad_id` text NOT NULL,
	`socio_id` text NOT NULL,
	`tipo_asistencia` text NOT NULL,
	`minutos_tardanza` integer DEFAULT 0 NOT NULL,
	`fecha_reg` text NOT NULL,
	FOREIGN KEY (`actividad_id`) REFERENCES `actividades`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`field_name` text NOT NULL,
	`field_label` text NOT NULL,
	`field_type` text NOT NULL,
	`field_config` text,
	`required` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`field_value` text,
	`field_value_numeric` real,
	`field_value_boolean` integer
);
--> statement-breakpoint
CREATE TABLE `modules_config` (
	`id` text PRIMARY KEY NOT NULL,
	`module_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config` text
);
--> statement-breakpoint
CREATE TABLE `egresos` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria` text NOT NULL,
	`beneficiario` text NOT NULL,
	`monto` real NOT NULL,
	`descripcion` text,
	`fecha` text NOT NULL,
	`num_recibo` text
);
--> statement-breakpoint
CREATE TABLE `movimientos` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`referencia_id` text,
	`socio_id` text,
	`monto` real NOT NULL,
	`numero_recibo` text,
	`nota` text,
	`fecha` text NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `multas` (
	`id` text PRIMARY KEY NOT NULL,
	`socio_id` text NOT NULL,
	`actividad_id` text,
	`concepto` text NOT NULL,
	`monto` real NOT NULL,
	`fecha_gen` text NOT NULL,
	`fecha_pago` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actividad_id`) REFERENCES `actividades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `socios` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`apellido_paterno` text NOT NULL,
	`apellido_materno` text,
	`ci` text,
	`telefono` text,
	`email` text,
	`ocupacion` text,
	`direccion` text,
	`fecha_nac` text,
	`fecha_ing` text,
	`fecha_alta` text,
	`aporte_base` real DEFAULT 0 NOT NULL,
	`estado` text DEFAULT 'activo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tipos_actividad` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`opciones` text NOT NULL,
	`multas` text,
	`tolerancia` integer DEFAULT 0 NOT NULL
);
