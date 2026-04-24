# Mejoras en "Mi Equipo" — Diseño

## Objetivo

Añadir dos mejoras de UX a la pestaña "Mi Equipo":
1. **Filtros por posición** en la sección "Plantilla Completa"
2. **Jugadores arrastrables** en el campo (puramente visual, sin afectar la lógica de formación)

## Arquitectura

Todos los cambios se concentran en `js/tabs/equipo.js`. No se modifican Firestore, `state.js`, `players.js` ni ninguna otra capa. Las posiciones arrastrables se persisten en `localStorage`; los filtros son estado local en memoria.

---

## Feature 1 — Filtros por posición en la plantilla

### Comportamiento

- Encima de la sección "Plantilla Completa" aparece una barra de chips: **Todos · POR · DEF · MED · DEL**
- "Todos" está activo por defecto al cargar la pestaña
- Al pulsar un chip, solo se muestran las tarjetas de jugadores de esa posición (tanto los del once como los del banquillo)
- El chip activo usa la clase CSS `filter-chip active-all` existente; los demás usan solo `filter-chip`

### Implementación

- Variable local `activeFilter` inicializada a `'todos'`
- Función `renderPlantilla(filter)` que limpia y re-renderiza las tarjetas según el filtro
- La barra de chips llama a `renderPlantilla` al cambiar chip
- Sin coste de red: todo se resuelve con los datos ya cargados en memoria

---

## Feature 2 — Jugadores arrastrables en el campo

### Comportamiento

- El campo (`pitch-grid`) pasa de CSS Grid a `position: relative` con cada slot en `position: absolute; left: X%; top: Y%`
- La posición inicial de cada slot se calcula a partir de su `c` (columna) y `r` (fila) de la formación, traducidos a porcentaje del contenedor
- **Todos los slots son arrastrables** (con jugador y vacíos)
- **Distinción tap vs. arrastre**: al hacer `pointerdown`, se espera ~150ms y se mide si hay movimiento:
  - Si hay movimiento → modo arrastre: `pointermove` actualiza `left/top` en tiempo real, `pointerup` guarda en localStorage
  - Si no hay movimiento (tap) → acción del slot:
    - **Slot con jugador**: menú con dos opciones — **Vender** (devuelve dinero, elimina jugador) y **Al banquillo** (mueve al array `bench` sin coste)
    - **Slot vacío**: comportamiento actual (ir al mercado o elegir del banquillo)
- Un botón "↺ Resetear posiciones" en el campo borra las posiciones guardadas y vuelve a las posiciones por defecto de la formación

### Persistencia

- Clave localStorage: `net11_pos_{uid}_{leagueCode}_{formation}`
- Valor: `{ [slotIdx]: { x: number, y: number } }` donde `x` e `y` son porcentajes (0–100) respecto al contenedor del campo
- Al cambiar de formación se cargan las posiciones guardadas para esa formación (o las por defecto si no hay)
- Al resetear se elimina la clave del localStorage

### Menú de opciones (slot con jugador)

- Un `div` flotante con posición absoluta junto al slot, que aparece al hacer tap sobre un slot ocupado
- Contiene dos botones: "🔴 Vender" y "🪑 Banquillo"
- Se cierra al pulsar en cualquier otro punto del campo o al elegir una opción
- Solo puede haber un menú abierto a la vez

### Cálculo de posición inicial desde la formación

```
maxCol = Math.max(...slots.map(s => s.c))
maxRow = Math.max(...slots.map(s => s.r))

x% = maxCol > 1 ? ((slot.c - 1) / (maxCol - 1)) * 85 + 7.5 : 50
y% = maxRow > 1 ? ((maxRow - slot.r) / (maxRow - 1)) * 80 + 10 : 50
// margen lateral 7.5%, margen vertical 10%
// guarda contra división por cero si todos los slots comparten columna/fila
```

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `js/tabs/equipo.js` | Todos los cambios de esta feature |

## Archivos no afectados

- `js/state.js` — sin cambios (bench ya existe)
- `js/players.js` — sin cambios
- Firebase / Firestore — sin cambios
- `index.html` — sin cambios
- CSS — sin cambios (usa clases existentes + estilos inline)
