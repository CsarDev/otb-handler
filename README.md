# OTB Handler

Sistema de gestión de socios, asistencia, aportes y finanzas para Organizaciones Territoriales de Base (OTB) de Bolivia. Open source, auto-hosteable, diseñado para funcionar sin conexión a internet.

Cada OTB tiene su propia instalación — NO es un SaaS multi-tenant. Podés correrlo localmente como app de escritorio (Tauri), en un celular (Expo), o en un VPS con Docker Compose.

---

## Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Frontend | React 19 + Vite + Tailwind CSS v4 | Liviano, PWA, comparte código con mobile |
| UI | shadcn/ui (componentes propios) | Modular, sin framework pesado |
| Estado | Zustand | ~1KB, cero boilerplate |
| Router | TanStack Router | Type-safe, prefetching |
| Backend | Hono + Bun | Hono pesa 3KB; Bun es un solo binario (~10MB) |
| ORM | Drizzle | ~3KB, tipos automáticos desde SQL |
| DB (dev) | SQLite + better-sqlite3 | Un archivo .db por OTB, cero config |
| DB (prod) | PostgreSQL | Estándar para contabilidad |
| Auth | jose + bcrypt | JWT estándar, ~8KB total |
| PDF | @react-pdf/renderer | Componentes React → PDF |
| Excel | SheetJS (xlsx) | Importar/exportar datos |
| Logging | Pino | Logger más rápido de Node.js |
| Monorepo | Nx + pnpm workspaces | Grafo de dependencias, builds selectivos |
| Desktop | Tauri 2 | Binario nativo (~10MB) con Rust + web view |
| Mobile | Expo + React Native | App nativa Android/iOS |
| Testing | Vitest + Playwright | Tests unitarios rápidos + E2E reales |

---

## Arranque rápido

```bash
# Requisitos: Node >= 20, pnpm >= 9, Bun

git clone <repo-url>
cd otb-handler

pnpm install

# Iniciar BD (SQLite local)
pnpm --filter @otb/db db:push && pnpm --filter @otb/db db:seed

# Iniciar server (Bun + Hono) y web (Vite) a la vez
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api
- Health check: http://localhost:3000/health

### Docker (producción)

```bash
# Requiere: Docker + Docker Compose
cp .env.example .env   # editar JWT_SECRET
docker compose -f docker/docker-compose.yml up -d
```

---

## Arquitectura

```
otb-handler/
├── apps/
│   ├── web/          React 19 + Vite (PWA)
│   ├── server/       Hono + Bun (API REST)
│   ├── mobile/       Expo + React Native
│   └── desktop/      Tauri 2 + React
│
├── packages/
│   ├── core/         Tipos, fórmulas, validaciones
│   ├── db/           Drizzle ORM + esquemas + seed
│   ├── api/          Rutas Hono (REST)
│   ├── ui/           Componentes shadcn/ui
│   ├── auth/         JWT (jose) + roles
│   ├── pdf/          Templates PDF (@react-pdf)
│   ├── excel/        Export/import SheetJS
│   ├── logger/       Pino estructurado
│   └── modules/      Sistema modular configurable
│
├── docker/
│   └── docker-compose.yml
│
├── nx.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Principios

- **TypeScript estricto** en todo el código
- **Cada package es independiente**: tiene su propio `tsconfig.json`, `package.json` y `vitest.config.ts`
- **SQLite en desarrollo**, PostgreSQL en producción — Drizzle abstrae la diferencia
- **Modular**: cada OTB habilita/deshabilita módulos según sus necesidades

---

## Paquetes

| Paquete | `@otb/*` | Propósito |
|---------|----------|-----------|
| Core | `@otb/core` | Tipos (`Socio`, `Aporte`, `Multa`, etc.), utilidades (`calcularEdad`, `formatearMoneda`) |
| DB | `@otb/db` | Esquemas Drizzle, migraciones, seed data, conexión SQLite/PostgreSQL |
| API | `@otb/api` | Router Hono con 8 endpoints (socios, aportes, multas, egresos, asistencia, actividades, dashboard, config) |
| UI | `@otb/ui` | Componentes base: `Button`, `Card`, `Input`, utilitario `cn()` |
| Auth | `@otb/auth` | JWT con jose, roles (`admin`, `tesorero`, `secretario`, `vocal`, `socio`) |
| PDF | `@otb/pdf` | Generación de PDFs con @react-pdf/renderer |
| Excel | `@otb/excel` | Exportar/importar datos completos a Excel via SheetJS |
| Logger | `@otb/logger` | Pino con nivel configurable por `LOG_LEVEL` |
| Modules | `@otb/modules` | Definiciones de módulos (`core`, `financial`, `hr`, `inventory`) |

---

## Modelo de datos

| Tabla | Descripción |
|-------|-------------|
| `socios` | Miembros de la OTB (nombre, CI, teléfono, email, estado: activo/inactivo/suspendido) |
| `tipos_actividad` | Tipos de actividad con opciones, multas y tolerancia |
| `actividades` | Eventos/actividades programadas |
| `asistencia` | Registro de asistencia (asistió, falta, tardanza, justificado) |
| `aportes` | Aportes mensuales, extraordinarios, anuales |
| `multas` | Multas generadas por actividad o concepto |
| `movimientos` | Libro diario: todos los ingresos y egresos |
| `egresos` | Gastos registrados por categoría |
| `modules_config` | Config de módulos habilitados por OTB |
| `custom_field_definitions` | Definiciones de campos personalizados (EAV) |
| `custom_field_values` | Valores de campos personalizados (EAV) |

---

## Sistema de módulos

Cada OTB configura los módulos que necesita. Los módulos `core` (socios, asistencia, aportes, multas) están siempre disponibles. Los módulos `financial`, `hr` e `inventory` son progresivos.

| Categoría | Módulos |
|-----------|---------|
| Core | Socios, Asistencia, Aportes, Multas |
| Financial | Egresos ✅, Facturas 🚧, Contabilidad 🚧 |
| HR | Empleados 🚧, Nóminas 🚧 |
| Inventory | Productos 🚧, Mov. Inventario 🚧 |

El sistema de campos personalizados usa el patrón EAV (Entity-Attribute-Value), permitiendo agregar campos sin migraciones.

---

## API endpoints

| Ruta | Descripción |
|------|-------------|
| `GET /health` | Health check |
| `GET/POST /api/socios` | CRUD de socios |
| `GET/POST /api/aportes` | CRUD de aportes |
| `GET/POST /api/multas` | CRUD de multas |
| `GET/POST /api/egresos` | CRUD de egresos |
| `GET/POST /api/asistencia` | Registro de asistencia |
| `GET/POST /api/actividades` | CRUD de actividades |
| `GET /api/dashboard` | KPIs del dashboard |
| `GET/POST /api/config` | Configuración de la OTB |

---

## Scripts útiles

```bash
pnpm dev            # Inicia todo (server + web)
pnpm build          # Build de todos los paquetes
pnpm test           # Tests unitarios (Vitest)
pnpm lint           # Linting
pnpm typecheck      # TypeScript check en todo el proyecto
pnpm format         # Prettier
pnpm format:check   # Verifica formato

# DB (SQLite local)
pnpm --filter @otb/db db:push       # Sincroniza schema a SQLite
pnpm --filter @otb/db db:migrate    # Corre migraciones
pnpm --filter @otb/db db:seed       # Datos de ejemplo
pnpm --filter @otb/db db:studio     # Drizzle Studio (GUI)
pnpm --filter @otb/db db:reset      # Borra DB + migra + seed
```

---

## Licencia

MIT
