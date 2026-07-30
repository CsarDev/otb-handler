CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS socios (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  nombre TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT,
  ci TEXT,
  telefono TEXT,
  email TEXT,
  ocupacion TEXT,
  direccion TEXT,
  fecha_nac DATE,
  fecha_ing DATE,
  fecha_alta DATE,
  aporte_base REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS tipos_actividad (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  nombre TEXT NOT NULL,
  opciones JSONB NOT NULL DEFAULT '[]',
  multas JSONB DEFAULT '[]',
  tolerancia INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS actividades (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  tipo TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS asistencia (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  actividad_id INTEGER NOT NULL,
  socio_id INTEGER NOT NULL,
  tipo_asistencia TEXT NOT NULL,
  minutos_tardanza INTEGER NOT NULL DEFAULT 0,
  fecha_reg TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aportes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  socio_id INTEGER NOT NULL,
  mes INTEGER,
  gestion INTEGER,
  tipo TEXT NOT NULL DEFAULT 'mensual',
  monto_base REAL NOT NULL,
  numero_recibo TEXT,
  fecha_pago DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS multas (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  socio_id INTEGER NOT NULL,
  actividad_id INTEGER,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  fecha_gen DATE NOT NULL,
  fecha_pago DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  tipo TEXT NOT NULL,
  referencia_id INTEGER,
  socio_id INTEGER,
  monto REAL NOT NULL,
  numero_recibo TEXT,
  nota TEXT,
  fecha DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS egresos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  categoria TEXT NOT NULL,
  beneficiario TEXT NOT NULL,
  monto REAL NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  num_recibo TEXT
);

CREATE TABLE IF NOT EXISTS modules_config (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  module_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  model TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  field_config JSONB,
  required BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_value_numeric REAL,
  field_value_boolean BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_socios_tenant ON socios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aportes_socio ON aportes(socio_id);
CREATE INDEX IF NOT EXISTS idx_multas_socio ON multas(socio_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_socio ON movimientos(socio_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_actividad ON asistencia(actividad_id);
