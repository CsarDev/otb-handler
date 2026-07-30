ALTER TABLE `aportes` ADD `monto_pagado` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `aportes` ADD `saldo_pendiente` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `aportes` ADD `razon_anulacion` text;--> statement-breakpoint
ALTER TABLE `movimientos` ADD `anulado` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `movimientos` ADD `razon_anulacion` text;--> statement-breakpoint
ALTER TABLE `multas` ADD `razon_anulacion` text;