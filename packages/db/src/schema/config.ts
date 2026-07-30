import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const modulesConfig = sqliteTable('modules_config', {
  id: text('id').primaryKey(),
  moduleName: text('module_name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config'),
});

export const customFieldDefinitions = sqliteTable('custom_field_definitions', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  fieldName: text('field_name').notNull(),
  fieldLabel: text('field_label').notNull(),
  fieldType: text('field_type').notNull(),
  fieldConfig: text('field_config'),
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
});

export const customFieldValues = sqliteTable('custom_field_values', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fieldName: text('field_name').notNull(),
  fieldValue: text('field_value'),
  fieldValueNumeric: real('field_value_numeric'),
  fieldValueBoolean: integer('field_value_boolean', { mode: 'boolean' }),
});
