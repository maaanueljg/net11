# Sección "Inicio" — Diseño

## Objetivo

Añadir una nueva pestaña "Inicio" que muestra un resumen automático de la actividad de la liga: resultados de la última jornada, mejor/peor equipo del mes, mejores jugadores de la jornada y jugadores libres destacados. Todo calculado automáticamente a partir de los datos existentes en Firestore.

## Arquitectura

Nuevo archivo `js/tabs/inicio.js` con `export async function render(wrap, ctx)`. Al abrirse la pestaña, lanza en paralelo una lectura de la jornada actual y los `leagueTeams` de todos los miembros. Con esos datos construye 4 tarjetas. Sin suscripciones en tiempo real — los datos se cargan al abrir la pestaña y se refrescan al volver a ella (cada `render` hace nuevas lecturas).

Los datos de jugadores provienen del array local `PLAYERS` (ya disponible en `js/players.js`) y de `calcPoints` (ya en `js/scoring.js`).

---

## Datos leídos

```js
const [jornadaSnap, ...teamSnaps] = await Promise.all([
  getDoc(doc(db, 'jornadas', String(currentJornada))),
  ...league.members.map(uid =>
    getDoc(doc(db, 'users', uid, 'leagueTeams', league.code))
  )
]);
```

- `jornadaSnap` → `{ players: { [pid]: stats } }` o null si no publicada
- `teamSnaps[i]` → `{ team: [], bench: [], totalPts, monthlyPts: { 'YYYY-MM': N }, ... }`
- `scoringMode` → `league.scoringMode || 'base'` (ya disponible en `ctx.league`)

---

## Las 4 tarjetas

### 🏟️ Última jornada

- Top 3 equipos ordenados por puntos en la jornada actual
- Puntos calculados sumando `calcPoints(jornadaDoc.players[pid], player.pos, scoringMode)` para cada jugador del equipo
- Muestra: medalla (🥇🥈🥉), nombre del equipo, puntos
- Si la jornada no está publicada: mensaje "Jornada pendiente de publicar"

### 📆 Equipo del mes

- Mes actual: `new Date().toISOString().slice(0, 7)` → `'YYYY-MM'`
- Mejor equipo: el que tiene mayor `monthlyPts['YYYY-MM']` (si > 0)
- Peor equipo: el que tiene menor `monthlyPts['YYYY-MM']` (si > 0, y si hay más de 1 equipo con puntos). En caso de empate en último, se toma el primero en orden alfabético de nombre de equipo.
- Si nadie tiene puntos mensuales aún: tarjeta no se renderiza
- Muestra: nombre del equipo y puntos del mes para mejor y peor

### ⚽ Mejores jugadores de la jornada

- Top 5 jugadores del catálogo completo (`PLAYERS`) ordenados por `calcPoints(jornadaDoc.players[pid] || {}, player.pos, scoringMode)`
- Solo si la jornada está publicada
- Muestra: emoji, nombre, posición (badge coloreado), puntos
- Jugadores con 0 puntos o negativos se excluyen del top 5

### 🔍 Libres destacados

- Jugadores libres = no presentes en ningún `team` ni `bench` de ningún miembro de la liga
- Top 3 libres por `calcPoints` en la última jornada (misma fuente que tarjeta anterior)
- Si la jornada no está publicada: top 3 libres por `player.val` (valor de mercado)
- Muestra: emoji, nombre, posición, puntos de la jornada (o valor si no hay jornada), precio formateado

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `js/tabs/inicio.js` | Nuevo archivo — toda la lógica de la pestaña |
| `js/app.js` | Import + ruta `'inicio'` en `renderCurrentTab` |
| `index.html` | Botón de nav "🏠 Inicio" como primera pestaña |

## Archivos no afectados

- `js/players.js`, `js/scoring.js`, `js/firebase.js` — solo lectura, sin modificar
- `js/state.js`, `js/leagues.js` — sin cambios
- Firestore — sin nuevas escrituras, solo lecturas

---

## Estados vacíos / Edge cases

- Sin liga: mensaje "Únete a una liga para ver el resumen"
- Sin jornada publicada: tarjetas de jornada muestran aviso; "Libres destacados" usa valor de mercado
- Liga con 1 solo miembro: tarjeta "Equipo del mes" muestra solo el mejor (sin peor)
- Nadie con puntos mensuales: tarjeta "Equipo del mes" no se renderiza
