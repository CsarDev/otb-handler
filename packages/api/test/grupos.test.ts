// Capability grupos: CRUD de grupos en `/api/grupos`. POST valida `nombre`
// (obligatorio; `descripcion` opcional/nullable) y responde 201 con la lista
// completa; PUT actualiza los campos editables (404 si no existe); DELETE está
// guardado por 409 cuando el grupo está referenciado — (a) como primario de un
// socio, (b) por una fila en `socio_grupos` (adicional), o (c) por una fila en
// `aportes_definicion_grupos` (aplicación de una definición, D30 — fix del
// orphan-FK: la columna legacy `aplica_grupo_id` NO estaba guardada) — y
// responde 200 con la lista completa cuando el grupo no tiene referencias.
//
// Gap cerrado en verify remediation: la suite de grupos no existía (gap
// pre-existente del cambio archivado); esta suite cubre las 10 escenarios del
// spec de grupos con asserts de comportamiento, no solo de status.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearGrupo, crearDefinicion, fila, filas } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const NO_ENCONTRADO = { error: 'Grupo no encontrado' };
const EN_DEFINICION = { error: 'Cannot delete: group is referenced by an aporte definition' };
const CON_SOCIOS = { error: 'Cannot delete: group has associated socios' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Grupos — POST (creación)', () => {
  it('crea un grupo con descripcion y responde 201 con la lista completa', async () => {
    const { status, data } = await requestJson('/api/grupos', {
      method: 'POST',
      body: { nombre: 'Manzano A', descripcion: 'Bloque 1' },
    });

    expect(status).toBe(201);
    expect(Array.isArray(data)).toBe(true);
    const grupo = (data as { id: string; nombre: string; descripcion: string | null }[]).find((g) => g.nombre === 'Manzano A');
    expect(grupo).toMatchObject({ nombre: 'Manzano A', descripcion: 'Bloque 1' });
    expect(grupo?.id).toMatch(UUID_RE);
    // La fila quedó persistida con la descripcion enviada.
    expect(fila('SELECT descripcion FROM grupos WHERE id = ?', [grupo!.id])).toMatchObject({ descripcion: 'Bloque 1' });
  });

  it('rechaza POST sin nombre con 400', async () => {
    const { status, data } = await requestJson('/api/grupos', {
      method: 'POST',
      body: { descripcion: 'x' },
    });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'nombre is required' });
    // Nada se inserta.
    expect(filas('SELECT * FROM grupos')).toHaveLength(0);
  });

  it('crea un grupo sin descripcion con descripcion=null', async () => {
    const { status, data } = await requestJson('/api/grupos', {
      method: 'POST',
      body: { nombre: 'Manzano B' },
    });

    expect(status).toBe(201);
    const grupo = (data as { id: string; nombre: string; descripcion: string | null }[]).find((g) => g.nombre === 'Manzano B');
    expect(grupo).toMatchObject({ nombre: 'Manzano B', descripcion: null });
    expect(fila('SELECT descripcion FROM grupos WHERE id = ?', [grupo!.id])).toMatchObject({ descripcion: null });
  });
});

describe('Grupos — PUT (actualización)', () => {
  it('renombra un grupo y responde 200 con la lista completa', async () => {
    const g1 = await crearGrupo('Manzano A');

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'PUT',
      body: { nombre: 'Manzano A Norte' },
    });

    expect(status).toBe(200);
    const grupo = (data as { id: string; nombre: string }[]).find((g) => g.id === g1);
    expect(grupo?.nombre).toBe('Manzano A Norte');
    expect(fila('SELECT nombre FROM grupos WHERE id = ?', [g1])).toMatchObject({ nombre: 'Manzano A Norte' });
  });

  it('devuelve 404 al actualizar un grupo inexistente', async () => {
    const { status, data } = await requestJson('/api/grupos/fake-id', {
      method: 'PUT',
      body: { nombre: 'x' },
    });

    expect(status).toBe(404);
    expect(data).toEqual(NO_ENCONTRADO);
  });
});

describe('Grupos — DELETE (guard 409)', () => {
  it('rechaza DELETE de un grupo que es el primario de un socio (409)', async () => {
    const g1 = await crearGrupo('Manzano A');
    await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });

    expect(status).toBe(409);
    expect(data).toEqual(CON_SOCIOS);
    // El grupo permanece en el catálogo.
    const grupos = (await requestJson('/api/grupos')).data as { id: string }[];
    expect(grupos.some((g) => g.id === g1)).toBe(true);
  });

  it('rechaza DELETE de un grupo usado solo como adicional (socio_grupos) (409)', async () => {
    const g1 = await crearGrupo('Manzano B');
    await crearSocio({ grupoAdicionalIds: [g1], aporteIds: [] });

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });

    expect(status).toBe(409);
    expect(data).toEqual(CON_SOCIOS);
    // La membresía adicional sigue intacta y el grupo sigue en el catálogo.
    expect(filas('SELECT * FROM socio_grupos WHERE grupo_id = ?', [g1])).toHaveLength(1);
    const grupos = (await requestJson('/api/grupos')).data as { id: string }[];
    expect(grupos.some((g) => g.id === g1)).toBe(true);
  });

  it('rechaza DELETE de un grupo referenciado por una definición de aporte (409, D30)', async () => {
    const g1 = await crearGrupo('Manzano C');
    await crearDefinicion({ nombre: 'Fondo Guard', monto: 10, grupoIds: [g1] });

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });

    expect(status).toBe(409);
    expect(data).toEqual(EN_DEFINICION);
    // La join M:N queda intacta y el grupo permanece (fix del orphan-FK).
    expect(filas('SELECT * FROM aportes_definicion_grupos WHERE grupo_id = ?', [g1])).toHaveLength(1);
    const grupos = (await requestJson('/api/grupos')).data as { id: string }[];
    expect(grupos.some((g) => g.id === g1)).toBe(true);
  });

  it('elimina un grupo sin referencias y lo quita del catálogo (200)', async () => {
    const g1 = await crearGrupo('Manzano Libre');

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as { id: string }[]).some((g) => g.id === g1)).toBe(false);
    expect(fila('SELECT * FROM grupos WHERE id = ?', [g1])).toBeUndefined();
  });

  it('devuelve 404 al eliminar un grupo inexistente', async () => {
    const { status, data } = await requestJson('/api/grupos/fake-id', {
      method: 'DELETE',
    });

    expect(status).toBe(404);
    expect(data).toEqual(NO_ENCONTRADO);
  });
});
