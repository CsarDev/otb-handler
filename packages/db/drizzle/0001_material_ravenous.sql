ALTER TABLE `multas` ADD `monto_pagado` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `multas` ADD `saldo_pendiente` real DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `multas` SET `saldo_pendiente` = `monto` WHERE `estado` = 'pendiente';--> statement-breakpoint
UPDATE `multas` SET `saldo_pendiente` = 0 WHERE `estado` != 'pendiente';--> statement-breakpoint
UPDATE `multas` SET `monto_pagado` = `monto` WHERE `estado` = 'pagado';