import { CATEGORY_LABEL } from '@/modules/leagues/domain/category';
import type { CommentaryContext, CommentaryTeam } from '../domain/types';

export const PROMPT_VERSION = 'v3';

function formatRecent(recent: Array<{ won: boolean; opponent: string }>): string {
  if (recent.length === 0) return 'Sin partidos previos en la liga.';
  return recent.map((r) => `${r.won ? '✓' : '✗'} vs ${r.opponent}`).join(' · ');
}

function rankLine(team: { rank: number | null; points: number }): string {
  if (team.rank === null) return '';
  return ` — clasificación: ${team.rank}º con ${team.points} pts.`;
}

function categoryChangeLine(team: CommentaryTeam): string {
  const change = team.recentCategoryChange;
  if (!change) return '';
  const direction = change.reason === 'PROMOTION' ? 'ascendió' : 'bajó';
  return `\n  Cambio reciente: ${direction} de ${CATEGORY_LABEL[change.fromCategory]} a ${CATEGORY_LABEL[change.toCategory]}.`;
}

function formatSets(sets: Array<{ gamesA: number; gamesB: number }>): string {
  return sets.map((s) => `${s.gamesA}-${s.gamesB}`).join(', ');
}

export function buildPrompt(ctx: CommentaryContext): string {
  const { type, league, teamA, teamB, result } = ctx;

  const teamAInfo = `Equipo A: "${teamA.name}"${rankLine(teamA)}\n  Últimos partidos: ${formatRecent(teamA.recent)}${categoryChangeLine(teamA)}`;
  const teamBInfo = `Equipo B: "${teamB.name}"${rankLine(teamB)}\n  Últimos partidos: ${formatRecent(teamB.recent)}${categoryChangeLine(teamB)}`;

  let resultBlock = '';
  if (type === 'RECAP' && result) {
    const winnerName =
      result.winnerTeam === 'A'
        ? teamA.name
        : result.winnerTeam === 'B'
          ? teamB.name
          : null;
    resultBlock = `\n- Resultado: ${formatSets(result.sets)}\n- Ganador: ${winnerName ?? 'empate'}`;
  }

  const instruction =
    type === 'PREVIEW'
      ? 'Escribe una previa con guasa amistosa: pinta el cruce, mete una broma sobre las rachas si las hay, sin spoilers (no sabemos quién ganará).'
      : 'Escribe la crónica con guasa amistosa: comenta el marcador, lanza un dardo cariñoso al perdedor, mete un guiño a la clasificación si es relevante.';

  return [
    'Eres un cronista de pádel con sentido del humor — irónico pero amable, nunca cruel.',
    'Escribe en español, 150-230 caracteres, 2-3 frases breves.',
    '',
    'CONTEXTO:',
    `- Liga: "${league.name}"`,
    `- ${teamAInfo}`,
    `- ${teamBInfo}${resultBlock}`,
    '',
    instruction,
    '',
    'REGLAS:',
    '- No inventes equipos, jugadores, marcadores ni hechos.',
    '- No incluyas datos personales más allá de los nombres de equipo.',
    '- Mantén el tono ligero — sin insultos ni temas sensibles.',
    '- Devuelve solo el texto del comentario, sin comillas ni encabezados.',
  ].join('\n');
}
