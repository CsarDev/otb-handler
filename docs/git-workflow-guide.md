# Guía Interactiva: Flujo de Branches y PRs en OTB Handler

> ¿Por qué hay varias ramas `feat/*` y varios PRs en GitHub? ¿Cuál es el flujo correcto?
> Esta guía te lleva paso a paso. Empezá por el **Diagrama**, después seguí el **Decisor**.

---

## 1. El Diagrama (¿cómo se conecta todo?)

```
main  (producción / releases — SOLO lo verificado)
  │
  │  merge --no-ff  (release)
  ▼
dev   (integración — TODAS las features conviven acá)
  │
  │  merge / squash PR
  ▼
feat/nombre-corto   (una feature, una rama, un PR)
```

```
HISTORIAL ACTUAL (2026-07-30):

b88c600  scaffold inicial
  8fdbb4d  CI workflow                       ← main
     e790bf7  bug fixes base
       52d3080  01-foundation                ← (era) feat/mejoras-integrales-otb-01
         2c04947  02-api-integrity           ← (era) feat/mejoras-integrales-otb-02
            fc23b64  03-transactions         ← (era) feat/mejoras-integrales-otb-03
              9435956  04-reports            ← (era) feat/mejoras-integrales-otb-04
                ... mejoras-integrales archive
                  2e85968  ux-avanzado tasks
                    455646d  schema montoPagado...
                      22b3640  multas bulk...
                        9ad296f  tabs crear/listar
                          74bb534  nx config  ← dev (TODAS las features integradas)
```

**Resumen de lo que pasó:** cada feature (mejoras-integrales y ux-avanzado) nació como
rama `feat/*`, y las partes internas de mejoras-integrales se partieron en 4 ramas
encadenadas (01 → 02 → 03 → 04) con su PR por eslabón. Por eso había 6 ramas `feat/*`
y 4 PRs. Hoy TODO eso está consolidado en `dev`, y las ramas/PRs intermedios se cerraron
y borraron.

---

## 2. Decisor: ¿Qué hago con una rama o PR que veo?

```
¿La rama es dev o main?
├─ SÍ → es sagrada, no la borres. Trabajá SIEMPRE desde una feat.
└─ NO (es feat/*) → ¿Su contenido ya está en dev?
    ├─ SÍ → BORRÁ: local + remota, y cerrá su PR si está abierto.
    └─ NO → ¿La estás usando ahora?
        ├─ SÍ → seguí trabajando en ella.
        └─ NO → mergeá a dev con PR, después borrá.

¿El PR apunta a main?
├─ SÍ → MAL. Debería apuntar a dev (main solo recibe releases).
└─ NO → ¿Apunta a otra feat/*? → Es PR encadenado (stack).
        → ¿Apunta a dev? → Correcto, así se integra.
```

### Regla de oro
> **Cada feature = 1 rama `feat/*` + 1 PR → `dev`.**
> Las ramas encadenadas (`-01`, `-02`...) son para features MUY grandes, no para el día a día.

---

## 3. Flujo Paso a Paso (checklist interactivo)

### A. Empezar una feature nueva
```bash
[ ] git checkout dev && git pull
[ ] git checkout -b feat/mi-feature
[ ] trabajar... commitear en pasos lógicos
[ ] git push -u origin feat/mi-feature
```

### B. Abrir el PR
```bash
[ ] gh pr create --base dev --title "feat: mi feature" --body "qué hace + cómo probar"
[ ] revisar diff, correr checks
```

### C. Integrar a dev
```bash
[ ] gh pr merge --base dev --squash --delete-branch
```
> `--squash` mantiene dev limpio: 1 feature = 1 commit en dev.

### D. Release a main (SOLO cuando dev está verificado)
```bash
[ ] git checkout dev && git pull
[ ] correr typecheck + tests (nx run-many -t typecheck,test)
[ ] git checkout main && git pull
[ ] git merge --no-ff dev -m "release: vX.Y.Z"
[ ] git tag vX.Y.Z && git push origin main --tags
```

### E. Limpieza de ramas viejas
```bash
[ ] git branch -a | grep feat          # ver qué hay
[ ] git push origin --delete feat/xyz  # borrar remota
[ ] git branch -D feat/xyz             # borrar local
[ ] gh pr close N                      # cerrar PR huérfano si existe
```

---

## 4. Por qué HAY ramas y PRs (explicación del estado real)

| Qué ves | Por qué existe | Qué hacer |
|---------|---------------|-----------|
| `main` | Rama de producción, última versión estable | No tocar, solo releases |
| `dev` | Integración de TODAS las features | Es tu rama de trabajo base |
| `feat/*` | Una por feature (a veces encadenadas -01,-02...) | Trabajar + PR → dev, luego borrar |
| PR → `main` | Tracker de un ciclo grande | Cerrar / re-apuntar a dev |
| PR → `feat/*` | PR encadenado de un stack grande | Mergear al eslabón siguiente, o cerrar |

**Lo que quedó del historial:** los PRs #1–#3 eran los eslabones del stack
`mejoras-integrales` (tracker, api-integrity, transactions). Quedaron abiertos porque
se integró todo por cadena y nunca se cerraron formalmente. El PR #4 (reports) sí se
mergeó. Hoy están cerrados y sus ramas borradas — el contenido vive en `dev`.

---

## 5. Anti-patrones (NO hagas esto)

- ❌ PR apuntando a `main` en el día a día
- ❌ Commitear directo a `dev` (todo entra por PR)
- ❌ Ramas feat huérfanas que ya se mergearon (borrarlas)
- ❌ PRs encadenados para features chicas (un solo PR alcanza)
- ❌ `git push --force` a `dev` o `main`

---

## 6. Trucos rápidos

```bash
# Ver si una rama ya está en dev
git merge-base --is-ancestor feat/x dev && echo "YA está en dev" || echo "falta integrar"

# Ver ramas mergeadas en dev (candidatas a borrar)
git branch -r --merged dev | grep feat

# Abrir el PR de la rama actual
gh pr create --base dev --fill
```

---

## 7. PRs huérfanos: qué son y qué hacer

**PR huérfano** = PR abierto cuyo contenido YA está integrado en su rama base.
GitHub no lo cierra solo porque la integración no pasó por un merge de ese PR exacto.

### Cómo detectarlo (en 10 segundos)

```bash
# Lista todos los PRs abiertos con su rama
gh pr list --state open

# ¿La rama del PR ya está en dev? Si el comando no falla → huérfano
git merge-base --is-ancestor feat/xyz dev && echo "HUÉRFANO: ya está en dev" || echo "ok, falta integrar"
```

### Qué hacer

```
PR abierto → ¿su rama es ancestro de dev?
├─ SÍ → HUÉRFANO → cerrar con comentario, borrar rama:
│       gh pr close N --comment "integrado en dev"
│       git push origin --delete feat/xyz && git branch -D feat/xyz
└─ NO → PR legítimo → seguí el flujo normal (sección 3)
```

> Un PR huérfano NO se deja abierto. Se cierra — el historial queda en el tab `Closed`.
> Solo se queda abierto si realmente falta integrar.

---

## 8. Cómo evitar PRs huérfanos + mejoras + automatización

### Reglas que previenen el problema (costo cero)

| Regla | Efecto |
|-------|--------|
| Cada feature = 1 rama + 1 PR → `dev` | Elimina las cadenas que generan huérfanos |
| Integrar SIEMPRE con `gh pr merge --squash --delete-branch` | GitHub cierra y borra solo |
| NUNCA integrar por fuera del PR (ni merge manual ni push directo a dev) | Evita que el contenido llegue sin que GitHub lo sepa |
| Si usás cadenas: mergear los PRs en orden #1→#2→#3... | GitHub cierra cada PR al mergearse a su base |

### Mejoras de proceso (recomendadas)

1. **Proteger `dev` y `main`** en GitHub → Settings → Branches → *Add rule*:
   - Requerir PR + 1 aprobación antes de mergear
   - Requerir que CI pase (`ci` workflow)
   - Prohibir push directo (solo merge por PR)
   - Activar *Auto-delete head branches* (borra la rama al mergear)

2. **Checklist obligatorio en el PR template** — sección "¿Esto está integrado?" para
   detectar huérfanos antes de abrir.

3. **Regla de review:** antes de abrir un PR, correr
   `git merge-base --is-ancestor HEAD dev` — si ya está en dev, no abrís el PR.

### Automatización real (GitHub Actions)

Podemos agregar un workflow que corre periódicamente y:

1. **Detecta PRs huérfanos** (rama ya en dev) → los cierra solo con comentario.
2. **Borra ramas `feat/*` remota** que ya estén integradas en `dev`.
3. **Cierra PRs viejos sin actividad** (stale, ej: 30 días sin cambios) como recordatorio.

Ejemplo de workflow (`.github/workflows/pr-hygiene.yml`):

```yaml
name: PR Hygiene
on:
  schedule:
    - cron: '0 6 * * *'      # todos los días 06:00 UTC
  workflow_dispatch:          # o manual desde Actions

jobs:
  hygiene:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Close orphan PRs (branch already in dev)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for pr in $(gh pr list --state open --json number,headRefName -q '.[] | "\(.number) \(.headRefName)"'); do
            num=$(echo "$pr" | cut -d' ' -f1); head=$(echo "$pr" | cut -d' ' -f2)
            if git merge-base --is-ancestor "origin/$head" origin/dev 2>/dev/null; then
              gh pr close "$num" --comment "🤖 Huérfano: su rama ya está integrada en dev. Se cierra automáticamente."
              git push origin --delete "$head" || true
            fi
          done
      - name: Delete merged feat branches
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for head in $(git branch -r --merged origin/dev | grep 'origin/feat/' | sed 's|origin/||'); do
            git push origin --delete "$head" || true
          done
```

> Ojo: esta automatización borra y cierra — hay que configurarla bien ANTES de activarla,
> y testear en una rama de prueba. En `workflow_dispatch` podés correrla manualmente.

### Plan de implementación propuesto

```
[ ] 1. Agregar este workflow de hygiene (o el script equivalente local)
[ ] 2. Proteger dev y main (branch protection rules)
[ ] 3. Testear el workflow en modo manual (workflow_dispatch)
[ ] 4. Dejarlo en cron diario
[ ] 5. (Opcional) Alias local: gh-pull = chequear huérfano + abrir PR
```
