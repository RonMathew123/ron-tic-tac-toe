export type Cell = "X" | "O" | null;
export type Board = Cell[];
export type Player = "X" | "O";

export const emptyBoard = (): Board => Array(9).fill(null);

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function getWinningLine(board: Board): [number, number, number] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

export function getWinner(board: Board): Player | null {
  const line = getWinningLine(board);
  return line ? (board[line[0]] as Player) : null;
}

export function isDraw(board: Board): boolean {
  return !getWinner(board) && board.every(Boolean);
}

export function availableMoves(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (!board[i]) out.push(i);
  return out;
}

/* --- Bot difficulties --- */
export function botEasy(board: Board): number {
  const m = availableMoves(board);
  return m[Math.floor(Math.random() * m.length)];
}

export function botIntermediate(board: Board, bot: Player): number {
  const human: Player = bot === "X" ? "O" : "X";
  const moves = availableMoves(board);
  // 1. Win if possible
  for (const i of moves) {
    const b = board.slice(); b[i] = bot;
    if (getWinner(b) === bot) return i;
  }
  // 2. Block immediate threat
  for (const i of moves) {
    const b = board.slice(); b[i] = human;
    if (getWinner(b) === human) return i;
  }
  // 3. Prefer center, then corners, then edges
  const priority = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  for (const i of priority) if (moves.includes(i)) return i;
  return moves[0];
}

export function botImpossible(board: Board, bot: Player): number {
  const human: Player = bot === "X" ? "O" : "X";
  const minimax = (b: Board, isMax: boolean): { score: number; move: number } => {
    const w = getWinner(b);
    if (w === bot) return { score: 10, move: -1 };
    if (w === human) return { score: -10, move: -1 };
    if (isDraw(b)) return { score: 0, move: -1 };
    const moves = availableMoves(b);
    let best = { score: isMax ? -Infinity : Infinity, move: moves[0] };
    for (const i of moves) {
      const nb = b.slice(); nb[i] = isMax ? bot : human;
      const { score } = minimax(nb, !isMax);
      if (isMax ? score > best.score : score < best.score) best = { score, move: i };
    }
    return best;
  };
  return minimax(board, true).move;
}

export type Difficulty = "easy" | "intermediate" | "impossible";
export function botMove(board: Board, bot: Player, diff: Difficulty): number {
  if (diff === "easy") return botEasy(board);
  if (diff === "intermediate") return botIntermediate(board, bot);
  return botImpossible(board, bot);
}

export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
