# Net11 — Panel de Admin de Liga: Diseño

## Objetivo

Separar el rol de **master admin** (gestión global de jornadas y jugadores) del nuevo rol de **league admin** (personalización completa de cada liga). El creador de una liga se convierte automáticamente en su admin y accede a un panel de configuración dentro de la PWA.

---

## Sistema de Roles

| Rol | Quién | Acceso |
|---|---|---|
| **Master Admin** | UID en `_config/admins` | `admin.html` — jornadas, catálogo de jugadores |
| **League Admin** | Creador de la liga (`adminUid`) | Tab ⚙️ en la PWA — configuración de su liga |
| **Miembro** | Resto de usuarios de la liga | Tabs normales (equipo, mercado, ranking, jornada) |

- Solo puede haber un league admin por liga.
- El rol no es transferible (por ahora).
- La comprobación es: `league.adminUid === user.uid`.

---

## Tab ⚙️ Liga

- Aparece en el menú principal **solo si** el usuario es `adminUid` de al menos una liga.
- Si es admin de varias ligas, se muestra un selector (igual que en Ranking).
- Se organiza en secciones colapsables.

### Secciones del panel

#### 1. General
- Nombre de la liga (editable en cualquier momento)
- Modo de puntuación (editable solo si no hay jornadas publicadas)
- Periódico fuente (visible/editable solo si modo = `cronistas`)

#### 2. Plantillas
- Alineaciones permitidas: lista de formaciones activables/desactivables (ej. 4-3-3, 4-4-2, 3-5-2…)

#### 3. Economía
- **Dinero inicial** por equipo (configurable antes de que empiece la liga)
- **Dinero por punto**: cada jornada, cada equipo ingresa `pts × moneyPerPoint`
- **Bonus jornada**: importe extra para el equipo con más puntos en la jornada
  - Activar/desactivar + importe configurable
  - En caso de empate: el bonus se reparte a partes iguales entre los empatados

#### 4. Mercado y Fichajes
- **Abrir/cerrar mercado**: toggle manual con fecha de apertura/cierre visible
- **Límite de jugadores robables por equipo por ventana**: máximo de jugadores que pueden salir de un equipo por cláusula en cada periodo de mercado (`maxStolenPerTeam`)

#### 5. Cláusulas
*(ver sección completa abajo)*

#### 6. Miembros
- Lista de miembros con opción de expulsar
- Regenerar código de invitación

---

## Sistema de Cláusulas

### Valor inicial

Al asignarse un jugador a un equipo (draft o fichaje):

```
clausula = Math.max(valorActual, precioCompra × (1 + pctModo))
```

La cláusula **nunca puede ser inferior al valor de mercado actual** del jugador.

### Modos de cláusula

Configurado por el league admin al crear la liga. No se puede cambiar una vez la liga ha empezado.

| Modo | Cálculo |
|---|---|
| `moderado` | precio de compra + 30% |
| `agresivo` | precio de compra + 50% |
| `real` | valor introducido manualmente por el master admin en el catálogo |

### Tras un traspaso vía cláusula

```
nuevaClausula = Math.max(valorActual, precioClausula × (1 + pctModo))
```

La cláusula **solo sube, nunca baja** (el mal rendimiento no la afecta).

### Sistema Anti-Robo (opcional)

Configurable al crear la liga. Si está activado:

- El propietario de un jugador puede subir manualmente su cláusula para protegerle
- **Coste**: un % del valor actual del jugador (ej. 75%), configurable por el admin
- **Límite**: número máximo de usos por equipo por temporada, configurable por el admin
- Puede activarse/desactivarse y configurarse desde la sección Cláusulas del panel

---

## Modelo de Datos (Firestore)

### `leagues/{code}` — campos nuevos

```
adminUid:           string

// Economía
startingMoney:      number
moneyPerPoint:      number
jornadaBonus:       number | null        // null = desactivado

// Plantillas
formations:         string[]             // ['4-3-3', '4-4-2', ...]

// Mercado
marketOpen:         boolean
maxStolenPerTeam:   number | null        // null = sin límite

// Cláusulas
clauseMode:         'moderado' | 'agresivo' | 'real'
antiRobo:           boolean
antiRoboFee:        number               // % del valor del jugador (ej. 75)
antiRoboLimit:      number | null        // usos por equipo por temporada; null = ilimitado
```

### `users/{uid}/leagueTeams/{code}` — campos nuevos

```
money:              number               // dinero actual del equipo
antiRoboUsed:       number              // usos de anti-robo gastados esta temporada
stolenThisWindow:   number              // jugadores robados esta ventana de mercado
```

### `players/{playerId}` — campo nuevo

```
clausula:           number              // cláusula actual del jugador en esta liga
```

*(almacenado en el contexto de la liga — pendiente de definir ubicación exacta según el modelo de mercado)*

---

## Flujo de creación de liga (cambios)

Al crear una liga, el formulario añade:

1. Modo de cláusula (`moderado` / `agresivo` / `real`)
2. Dinero inicial
3. Dinero por punto
4. Bonus jornada (importe, activar/desactivar)
5. Límite de robos por equipo por ventana
6. Sistema anti-robo (activar/desactivar → si activo: % coste + límite de usos)

El `adminUid` se asigna automáticamente al UID del creador.

---

## Flujo de publicación de jornada (cambios en master admin)

Al publicar una jornada, además de calcular `pts`:
1. Para cada equipo en la liga: `money += pts × moneyPerPoint`
2. Si `jornadaBonus` está activo: identificar equipo(s) con más pts → repartir bonus entre empatados
3. Resetear `stolenThisWindow` si el admin cierra la ventana de mercado
