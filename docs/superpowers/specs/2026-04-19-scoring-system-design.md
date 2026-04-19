# Net11 — Sistema de Puntuación: Diseño

## Objetivo

Definir los tres modos de puntuación de Net11 y cómo conviven en el sistema. Cada liga elige su modo al crearse y no puede cambiarlo posteriormente.

---

## Modos de puntuación

| Modo | Descripción | Estado |
|---|---|---|
| `base` | Puntos por eventos objetivos (goles, asistencias, tarjetas…) | Implementar |
| `cronistas` | Picas de periodistas + eventos objetivos | Implementar |
| `puras` | Estadísticas brutas vía API externa | Stub (futuro) |

---

## Modo Base

### Tabla de puntuación

| Evento | POR | DEF | MED | DEL |
|---|---|---|---|---|
| Gol | 6 | 6 | 5 | 4 |
| Asistencia (provoca gol) | 3 | 3 | 3 | 3 |
| Asistencia (ocasión manifiesta) | 1 | 1 | 1 | 1 |
| Portería a cero (>60 min) | 4 | 3 | 2 | 1 |
| Penalti parado | 5 | — | — | — |
| Penalti provocado | 2 | 2 | 2 | 2 |
| Penalti fallado | -2 | -2 | -2 | -2 |
| Tarjeta amarilla | -1 | -1 | -1 | -1 |
| Segunda amarilla (= roja) | -2 | -2 | -2 | -2 |
| Roja directa | -5 | -5 | -5 | -5 |
| Goles recibidos (cada 2) | -2 | -2 | -1 | -1 |
| Paradas/tiros/regates/llegadas (cada 2) | +1 | +1 | +1 | +1 |
| Balones perdidos (cada N) | -1 | -1 | -1 | -1 |

### Umbral de balones perdidos por posición

| POR | DEF | MED | DEL |
|---|---|---|---|
| Cada 12 | Cada 12 | Cada 10 | Cada 8 |

### Notas
- La portería a cero requiere >60 minutos jugados.
- La segunda amarilla suma las dos penalizaciones (-1 por cada amarilla = -2 total). No se aplica penalización adicional de roja.
- Los bonus de +1 se calculan por cada 2 acciones positivas acumuladas (no por tipo, sino en total).

---

## Modo Cronistas

### Concepto

Combina una nota subjetiva de periodistas reales (en picas, escala 1-4) con estadísticas objetivas. El periódico fuente es configurable por liga.

### Escala de picas

| Picas | Puntos |
|---|---|
| ♣ (1) | 1 |
| ♣♣ (2) | 2 |
| ♣♣♣ (3) | 3 |
| ♣♣♣♣ (4) | 4 |

### Estadísticas objetivas aplicadas

Se aplican sobre los puntos de picas los siguientes eventos del Sistema Base:
- Goles
- Asistencias (gol y ocasión manifiesta)
- Tarjetas (amarilla, segunda amarilla, roja directa)
- Penaltis (parado, provocado, fallado)

**No se aplican** en modo Cronistas:
- Portería a cero (cubierta por la nota subjetiva)
- Balones perdidos (cubierto por la nota subjetiva)
- Bonus de paradas/tiros/regates/llegadas (cubierto por la nota subjetiva)

### Periódico fuente

- Configurado por el admin al crear la liga (ej. Marca, AS, L'Équipe, etc.)
- El admin de la app introduce las picas manualmente desde ese periódico al publicar cada jornada.
- El periódico fuente es visible en el panel admin al publicar.

---

## Modo Puras (stub)

Reservado para integración futura con una API de datos de fútbol. Al seleccionar este modo, la liga funciona normalmente pero el admin ve un mensaje "Próximamente" al intentar publicar una jornada. Los puntos permanecen en 0 hasta que se implemente la API.

---

## Arquitectura

### Modelo de datos (Firestore)

**leagues/{leagueCode}**
```
scoringMode:   'base' | 'cronistas' | 'puras'
newspaper:     string | null   // solo si scoringMode === 'cronistas'
```

**jornadas/{jornadaId}**
```
published:     boolean
date:          ISO string
players: {
  [playerId]: {
    // Modo base
    goals:         number
    assists:       number
    assistChance:  number
    cleanSheet:    boolean
    minutesPlayed: number
    penaltySaved:  number
    penaltyWon:    number
    penaltyMissed: number
    yellowCards:   number
    doubleYellow:  boolean
    redCard:       boolean
    goalsAgainst:  number
    positiveActions: number   // paradas + tiros + regates + llegadas
    lostBalls:     number

    // Modo cronistas (adicional)
    picas:         1 | 2 | 3 | 4 | null

    // Calculado al publicar
    pts:           number
  }
}
```

### Función de cálculo de puntos

`calcPoints(playerData, position, scoringMode)` → number

Ejecutada en el cliente (admin panel) al publicar, almacena el resultado en `pts` dentro del documento de jornada. El ranking y la tab Jornada leen directamente `pts`.

---

## Flujo de admin

### Creación de liga
1. Usuario introduce nombre + competición + **modo de puntuación**
2. Si selecciona Cronistas → campo adicional para el periódico fuente
3. El modo queda fijado y no se puede cambiar

### Publicación de jornada

**Modo Base:**
- Tabla de jugadores con inputs por evento (goles, asistencias, tarjetas, minutos, etc.)
- Botón "Publicar jornada" → calcula `pts` y actualiza `totalPts` de cada equipo

**Modo Cronistas:**
- Misma tabla + columna extra con selector de picas (1-4) por jugador
- Periódico fuente visible en cabecera del panel
- Botón "Publicar jornada" → misma lógica

**Modo Puras:**
- Mensaje "Próximamente — Integración con API en desarrollo"
