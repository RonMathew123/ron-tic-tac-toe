import { motion, AnimatePresence } from "framer-motion";
import type { Board, Cell as CellType } from "@/lib/game-logic";
import { getWinningLine } from "@/lib/game-logic";
import { cn } from "@/lib/utils";

interface GridProps {
  board: Board;
  onPlay: (i: number) => void;
  disabled?: boolean;
  hint?: "X" | "O";
}

export function Grid({ board, onPlay, disabled, hint }: GridProps) {
  const winLine = getWinningLine(board);
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-[min(80vw,28rem)] grid-cols-3 gap-3 p-2 scanlines">
      {board.map((cell, i) => {
        const isWin = winLine?.includes(i);
        const clickable = !disabled && !cell;
        return (
          <motion.button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onPlay(i)}
            whileHover={clickable ? { scale: 1.03 } : undefined}
            whileTap={clickable ? { scale: 0.96 } : undefined}
            className={cn(
              "grid-cell relative flex items-center justify-center rounded-xl text-6xl sm:text-7xl font-display font-bold select-none",
              clickable && "grid-cell-hover cursor-pointer",
              !clickable && !cell && "opacity-70",
              isWin && (cell === "X" ? "neon-border-cyan" : "neon-border-magenta"),
            )}
            aria-label={`Cell ${i + 1}${cell ? `, ${cell}` : ", empty"}`}
          >
            <AnimatePresence mode="wait">
              {cell && (
                <motion.span
                  key={cell + i}
                  initial={{ scale: 0.2, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className={cn(cell === "X" ? "token-x" : "token-o")}
                >
                  {cell}
                </motion.span>
              )}
              {!cell && hint && clickable && (
                <span
                  className={cn(
                    "opacity-0 transition-opacity duration-200 group-hover:opacity-20 pointer-events-none",
                    hint === "X" ? "text-[color:var(--neon-cyan)]" : "text-[color:var(--neon-magenta)]",
                  )}
                >
                  {hint}
                </span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
