const PTS_GOALS        = { POR: 6, DEF: 6, MED: 5, DEL: 4 };
const PTS_CLEAN_SHEET  = { POR: 4, DEF: 3, MED: 2, DEL: 1 };
const PTS_GOALS_AGAINST = { POR: -2, DEF: -2, MED: -1, DEL: -1 };
const LOST_BALLS_THRESH = { POR: 12, DEF: 12, MED: 10, DEL: 8 };

/**
 * Calcula los puntos de un jugador para una jornada.
 * @param {Object} s    - Estadísticas brutas del jugador
 * @param {string} pos  - 'POR'|'DEF'|'MED'|'DEL'
 * @param {string} mode - 'base'|'cronistas'|'puras'
 * @returns {number}
 */
export function calcPoints(s, pos, mode) {
  if (!s) return 0;
  if (!['base', 'cronistas', 'puras'].includes(mode)) { console.warn(`calcPoints: modo desconocido '${mode}'`); return 0; }
  if (!['POR', 'DEF', 'MED', 'DEL'].includes(pos))   { console.warn(`calcPoints: posición desconocida '${pos}'`); return 0; }
  if (mode === 'puras') return 0; // stub: modo Puras pendiente de integración con API
  let pts = 0;

  // Picas (solo modo cronistas)
  if (mode === 'cronistas') pts += (s.picas || 0);

  // Goles
  pts += (s.goals || 0) * (PTS_GOALS[pos] || 0);

  // Asistencias
  pts += (s.assists || 0) * 3;
  pts += (s.assistChance || 0);

  // Portería a cero (solo modo base, requiere >60 min)
  if (mode === 'base' && s.cleanSheet && (s.minutesPlayed || 0) > 60) {
    pts += PTS_CLEAN_SHEET[pos] || 0;
  }

  // Penaltis
  if (pos === 'POR') pts += (s.penaltySaved || 0) * 5;
  pts += (s.penaltyWon || 0) * 2;
  pts -= (s.penaltyMissed || 0) * 2;

  // doubleYellow y redCard son mutuamente excluyentes (garantizado por el formulario admin)
  // Tarjetas
  // doubleYellow: segunda amarilla => -2 total (dos amarillas)
  // yellowCards: 0 o 1 (amarilla simple) => -1
  // redCard: roja directa => -5
  if (s.doubleYellow) {
    pts -= 2;
  } else {
    pts -= (s.yellowCards || 0) * 1;
  }
  if (s.redCard) pts -= 5;

  // Goles recibidos (cada 2)
  pts += Math.floor((s.goalsAgainst || 0) / 2) * (PTS_GOALS_AGAINST[pos] || 0);

  // Acciones positivas y balones perdidos (solo modo base)
  if (mode === 'base') {
    pts += Math.floor((s.positiveActions || 0) / 2);
    const threshold = LOST_BALLS_THRESH[pos] || 10;
    pts -= Math.floor((s.lostBalls || 0) / threshold);
  }

  return pts;
}
