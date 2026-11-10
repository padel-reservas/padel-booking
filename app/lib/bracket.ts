// Torneo eliminación simple (noviembre 2026): tipos, rondas y dibujo del cuadro.

export const KO_TOURNAMENT_KEY = 'torneo-2026-11';
export const KO_TITLE = "Torneo Fall 26'";

export const KO_ROUNDS = [
  { round: 1, name: 'Octavos', window: 'lun 9/11 – dom 15/11' },
  { round: 2, name: 'Cuartos', window: 'lun 16/11 – dom 22/11' },
  { round: 3, name: 'Semis', window: 'lun 23/11 – dom 29/11' },
  { round: 4, name: 'Final', window: 'lun 30/11 – dom 6/12' },
] as const;

export type KoPair = {
  id: number;
  tournament_key: string;
  seed: number;
  player1_name: string;
  player2_name: string;
};

export type KoMatch = {
  id: number;
  tournament_key: string;
  round: number;
  slot: number;
  pair1_id: number | null;
  pair2_id: number | null;
  is_bye: boolean;
  set1_pair1: number | null;
  set1_pair2: number | null;
  set2_pair1: number | null;
  set2_pair2: number | null;
  set3_pair1: number | null;
  set3_pair2: number | null;
  winner_pair_id: number | null;
  walkover: boolean;
  status: 'pending' | 'played' | 'bye';
  played_at: string | null;
};

export function pairLabel(p: Pick<KoPair, 'player1_name' | 'player2_name'>) {
  return `${p.player1_name} / ${p.player2_name}`;
}

// Games de cada pareja por set, para mostrar al lado del nombre
export function setsFor(m: KoMatch, side: 1 | 2): number[] {
  const raw =
    side === 1
      ? [m.set1_pair1, m.set2_pair1, m.set3_pair1]
      : [m.set1_pair2, m.set2_pair2, m.set3_pair2];
  return raw.filter((v): v is number => v !== null && v !== undefined);
}

// ===== Imagen para compartir =====

export type BracketImageInput = {
  pairs: KoPair[];
  matches: KoMatch[];
};

const COLORS = {
  bg: '#ffffff',
  title: '#0f172a',
  sub: '#64748b',
  boxBg: '#f8fafc',
  boxBorder: '#cbd5e1',
  winnerBg: '#dcfce7',
  winnerText: '#166534',
  loserText: '#94a3b8',
  text: '#0f172a',
  line: '#94a3b8',
  accent: '#16a34a',
  champBg: '#fef9c3',
  champBorder: '#eab308',
};

export function drawBracketImage(canvas: HTMLCanvasElement, input: BracketImageInput) {
  const W = 1800;
  const H = 1180;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pairById = new Map(input.pairs.map((p) => [p.id, p]));
  const matchAt = (round: number, slot: number) =>
    input.matches.find((m) => m.round === round && m.slot === slot) || null;

  const font = (size: number, weight = 400) =>
    `${weight} ${size}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

  // Fondo y título
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, W, 10);

  ctx.fillStyle = COLORS.title;
  ctx.font = font(44, 800);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(KO_TITLE, 50, 78);
  ctx.fillStyle = COLORS.sub;
  ctx.font = font(24, 500);
  ctx.fillText('Eliminación simple · un partido por semana, de lunes a domingo', 50, 114);

  // Geometría
  const marginX = 50;
  const colW = 300;
  const gap = 50;
  const top = 200;
  const bottom = H - 40;
  const areaH = bottom - top;
  const boxH = 84;
  const lineH = boxH / 2;
  const colX = (i: number) => marginX + i * (colW + gap);
  const centerY = (round: number, slot: number) => {
    const count = 8 / 2 ** (round - 1);
    return top + ((slot + 0.5) * areaH) / count;
  };

  // Encabezados de ronda
  KO_ROUNDS.forEach((r, i) => {
    ctx.fillStyle = COLORS.title;
    ctx.font = font(26, 800);
    ctx.fillText(r.name, colX(i), 160);
    ctx.fillStyle = COLORS.sub;
    ctx.font = font(18, 500);
    ctx.fillText(r.window, colX(i), 184);
  });
  ctx.fillStyle = COLORS.title;
  ctx.font = font(26, 800);
  ctx.fillText('Campeones', colX(4), 160);

  const truncate = (text: string, maxW: number) => {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  const drawLine = (
    x: number,
    y: number,
    pairId: number | null,
    m: KoMatch | null,
    side: 1 | 2,
    placeholder: string
  ) => {
    const pair = pairId ? pairById.get(pairId) : null;
    const decided = !!m && m.status === 'played' && !!m.winner_pair_id;
    const isWinner = decided && pairId !== null && m!.winner_pair_id === pairId;
    const isLoser = decided && pairId !== null && !isWinner;

    if (isWinner) {
      ctx.fillStyle = COLORS.winnerBg;
      ctx.fillRect(x + 1, y + 1, colW - 2, lineH - 2);
    }

    // Seed
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = font(16, 700);
    ctx.fillStyle = COLORS.sub;
    ctx.fillText(pair ? String(pair.seed) : '', x + 10, y + lineH / 2);

    // Scores (a la derecha)
    let scoreText = '';
    if (m && m.status === 'played') {
      scoreText = m.walkover ? (isWinner ? 'W.O.' : '') : setsFor(m, side).join('  ');
    }
    ctx.font = font(19, 700);
    const scoreW = scoreText ? ctx.measureText(scoreText).width + 14 : 0;

    // Nombre
    ctx.font = font(19, isWinner ? 800 : 500);
    ctx.fillStyle = isWinner ? COLORS.winnerText : isLoser ? COLORS.loserText : pair ? COLORS.text : COLORS.sub;
    const label = pair ? pairLabel(pair) : placeholder;
    ctx.fillText(truncate(label, colW - 44 - scoreW), x + 36, y + lineH / 2);

    if (scoreText) {
      ctx.textAlign = 'right';
      ctx.font = font(19, 700);
      ctx.fillStyle = isWinner ? COLORS.winnerText : COLORS.loserText;
      ctx.fillText(scoreText, x + colW - 10, y + lineH / 2);
      ctx.textAlign = 'left';
    }
  };

  const drawBox = (round: number, slot: number) => {
    const m = matchAt(round, slot);
    const x = colX(round - 1);
    const cy = centerY(round, slot);
    const y = cy - boxH / 2;

    ctx.fillStyle = COLORS.boxBg;
    ctx.fillRect(x, y, colW, boxH);
    ctx.strokeStyle = COLORS.boxBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, colW, boxH);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + colW, cy);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (m && m.is_bye) {
      drawLine(x, y, m.pair1_id, null, 1, '');
      ctx.font = font(17, 500);
      ctx.fillStyle = COLORS.sub;
      ctx.textBaseline = 'middle';
      ctx.fillText('pasa directo', x + 36, y + lineH + lineH / 2);
      return;
    }

    drawLine(x, y, m?.pair1_id ?? null, m, 1, '—');
    drawLine(x, y + lineH, m?.pair2_id ?? null, m, 2, '—');
  };

  // Conectores
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  for (let round = 1; round <= 4; round++) {
    const count = 8 / 2 ** (round - 1);
    for (let slot = 0; slot < count; slot++) {
      const x1 = colX(round - 1) + colW;
      const y1 = centerY(round, slot);
      const xm = x1 + gap / 2;
      const nextY = round < 4 ? centerY(round + 1, Math.floor(slot / 2)) : centerY(4, 0);
      const x2 = colX(round);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(xm, y1);
      ctx.lineTo(xm, nextY);
      ctx.lineTo(x2, nextY);
      ctx.stroke();
    }
  }

  for (let round = 1; round <= 4; round++) {
    const count = 8 / 2 ** (round - 1);
    for (let slot = 0; slot < count; slot++) drawBox(round, slot);
  }

  // Campeones
  const final = matchAt(4, 0);
  const champ = final && final.status === 'played' && final.winner_pair_id ? pairById.get(final.winner_pair_id) : null;
  const cx = colX(4);
  const cy = centerY(4, 0);
  ctx.fillStyle = COLORS.champBg;
  ctx.fillRect(cx, cy - boxH / 2, colW, boxH);
  ctx.strokeStyle = COLORS.champBorder;
  ctx.lineWidth = 3;
  ctx.strokeRect(cx, cy - boxH / 2, colW, boxH);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.title;
  ctx.font = font(22, 800);
  ctx.fillText(champ ? truncate(pairLabel(champ), colW - 30) : '?', cx + 16, cy);
}
