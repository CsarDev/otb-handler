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
