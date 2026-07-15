import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid } from "./Grid";
import { NeonButton } from "./NeonButton";
import { AbortButton } from "./AbortButton";
import {
  emptyBoard, getWinner, isDraw, botMove,
  type Board, type Player, type Difficulty,
} from "@/lib/game-logic";
import type { Mode } from "./GameMenu";
import type { PreGameConfig } from "./PreGameLobby";
import { useOnlineGame } from "@/hooks/useOnlineGame";
import { Copy, Check } from "lucide-react";

interface Props {
  mode: Mode;
  config: PreGameConfig;
  onExit: () => void;
}

export function GameScreen(props: Props) {
  if (props.mode === "local") return <LocalGame {...props} />;
  if (props.mode === "bot") return <BotGame {...props} />;
  return <OnlineGame {...props} />;
}

function StatusBar({ text, tone = "cyan" }: { text: string; tone?: "cyan" | "magenta" | "muted" }) {
  return (
    <div className={`text-center font-display uppercase tracking-[0.3em] text-sm sm:text-base ${
      tone === "cyan" ? "neon-text-cyan" : tone === "magenta" ? "neon-text-magenta" : "text-muted-foreground"
    }`}>{text}</div>
  );
}

function ResultOverlay({ text, tone, onExit, onReplay }: { text: string; tone: "cyan"|"magenta"|"muted"; onExit: () => void; onReplay?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-md rounded-2xl z-10"
    >
      <div className="text-center space-y-6 p-6">
        <motion.h3
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 15 }}
          className={`text-4xl sm:text-6xl font-display font-black ${
            tone === "cyan" ? "neon-text-cyan" : tone === "magenta" ? "neon-text-magenta" : "text-foreground"
          }`}
        >{text}</motion.h3>
        <div className="flex flex-wrap justify-center gap-3">
          {onReplay && <NeonButton variant="cyan" onClick={onReplay}>Play Again</NeonButton>}
          <NeonButton variant="ghost" onClick={onExit}>Main Menu</NeonButton>
        </div>
      </div>
    </motion.div>
  );
}

function GameShell({ children, onAbort }: { children: React.ReactNode; onAbort?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className="relative w-full max-w-xl glass-panel rounded-2xl p-6 sm:p-8"
    >
      {onAbort && <AbortButton onAbort={onAbort} />}
      {children}
    </motion.div>
  );
}

/* -------- LOCAL 1v1 -------- */
function LocalGame({ onExit }: Props) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<Player>("X");
  const winner = getWinner(board);
  const draw = !winner && isDraw(board);
  const finished = !!winner || draw;

  const play = (i: number) => {
    if (finished || board[i]) return;
    const nb = board.slice(); nb[i] = turn;
    setBoard(nb);
    setTurn(turn === "X" ? "O" : "X");
  };
  const reset = () => { setBoard(emptyBoard()); setTurn("X"); };

  return (
    <GameShell>
      <StatusBar
        text={finished ? (winner ? `Player ${winner} Wins` : "Draw") : `Player ${turn}'s Turn`}
        tone={turn === "X" ? "cyan" : "magenta"}
      />
      <div className="my-6 relative">
        <Grid board={board} onPlay={play} disabled={finished} />
        <AnimatePresence>
          {finished && (
            <ResultOverlay
              text={winner ? `${winner} Wins` : "Draw"}
              tone={winner === "X" ? "cyan" : winner === "O" ? "magenta" : "muted"}
              onExit={onExit}
              onReplay={reset}
            />
          )}
        </AnimatePresence>
      </div>
      <div className="flex justify-between">
        <NeonButton variant="ghost" onClick={onExit}>Menu</NeonButton>
        <NeonButton variant="cyan" onClick={reset}>Reset</NeonButton>
      </div>
    </GameShell>
  );
}

/* -------- BOT -------- */
function BotGame({ config, onExit }: Props) {
  const human: Player = useMemo(
    () => (config.token === "random" ? (Math.random() < 0.5 ? "X" : "O") : (config.token as Player)),
    [config.token]
  );
  const bot: Player = human === "X" ? "O" : "X";
  const diff: Difficulty = config.difficulty ?? "intermediate";

  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<Player>("X");
  const [aborted, setAborted] = useState(false);
  const winner = getWinner(board);
  const draw = !winner && isDraw(board);
  const finished = !!winner || draw || aborted;

  useEffect(() => {
    if (finished) return;
    if (turn === bot) {
      const t = setTimeout(() => {
        const i = botMove(board, bot, diff);
        const nb = board.slice(); nb[i] = bot;
        setBoard(nb); setTurn(human);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [turn, board, bot, human, diff, finished]);

  const play = (i: number) => {
    if (finished || board[i] || turn !== human) return;
    const nb = board.slice(); nb[i] = human;
    setBoard(nb); setTurn(bot);
  };
  const reset = () => { setBoard(emptyBoard()); setTurn("X"); setAborted(false); };

  const resultText = aborted ? "Aborted" : winner === human ? "You Win" : winner === bot ? "Bot Wins" : "Draw";
  const resultTone: "cyan"|"magenta"|"muted" = aborted ? "muted"
    : winner === human ? (human === "X" ? "cyan" : "magenta")
    : winner === bot ? (bot === "X" ? "cyan" : "magenta") : "muted";

  return (
    <GameShell onAbort={() => setAborted(true)}>
      <StatusBar
        text={finished ? resultText : (turn === human ? "Your Turn" : "Bot Thinking...")}
        tone={turn === "X" ? "cyan" : "magenta"}
      />
      <p className="text-center text-xs uppercase tracking-widest text-muted-foreground mt-1">
        You: {human} · Bot: {bot} · {diff}
      </p>
      <div className="my-6 relative">
        <Grid board={board} onPlay={play} disabled={finished || turn !== human} hint={human} />
        <AnimatePresence>
          {finished && (
            <ResultOverlay text={resultText} tone={resultTone} onExit={onExit} onReplay={reset} />
          )}
        </AnimatePresence>
      </div>
      <div className="flex justify-between">
        <NeonButton variant="ghost" onClick={onExit}>Menu</NeonButton>
        <NeonButton variant="cyan" onClick={reset}>Reset</NeonButton>
      </div>
    </GameShell>
  );
}

/* -------- ONLINE -------- */
function OnlineGame(props: Props) {
  const [rematchKey, setRematchKey] = useState(0);
  return <OnlineGameInner key={rematchKey} {...props} onReplay={() => setRematchKey((k) => k + 1)} />;
}

function OnlineGameInner({ mode, config, onExit, onReplay }: Props & { onReplay: () => void }) {
  const kind = mode === "random" ? "random" : config.action === "join" ? "join" : "host";
  const { game, myToken, error, play, abort } = useOnlineGame(
    kind === "join"
      ? { kind: "join", code: config.code ?? "", preferredToken: config.token }
      : { kind: kind as "random"|"host", preferredToken: config.token }
  );
  const [copied, setCopied] = useState(false);

  const doAbort = async () => { await abort(); onExit(); };

  if (error) {
    return (
      <GameShell>
        <div className="text-center space-y-4">
          <p className="neon-text-magenta font-display uppercase tracking-widest">{error}</p>
          <NeonButton variant="ghost" onClick={onExit}>Back to Menu</NeonButton>
        </div>
      </GameShell>
    );
  }
  if (!game || !myToken) {
    return (
      <GameShell>
        <StatusBar text="Connecting..." tone="cyan" />
        <div className="my-8 flex justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-[color:var(--neon-cyan)] border-t-transparent animate-spin" />
        </div>
      </GameShell>
    );
  }

  if (game.status === "waiting") {
    return (
      <GameShell onAbort={doAbort}>
        <StatusBar text="Waiting For Opponent" tone="cyan" />
        {game.room_code && (
          <div className="mt-6 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Room Code</p>
            <button
              onClick={async () => { await navigator.clipboard.writeText(game.room_code!); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
              className="inline-flex items-center gap-3 font-display text-5xl tracking-[0.5em] neon-text-cyan neon-border-cyan px-6 py-4 rounded-xl"
            >
              {game.room_code}
              {copied ? <Check className="w-5 h-5"/> : <Copy className="w-5 h-5"/>}
            </button>
            <p className="mt-3 text-sm text-muted-foreground">Share this code with a friend to start.</p>
          </div>
        )}
        {!game.room_code && (
          <div className="my-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-[color:var(--neon-magenta)] border-t-transparent animate-spin" />
            <p className="mt-4 text-sm text-muted-foreground">Searching the neon grid...</p>
          </div>
        )}
        <div className="mt-6 text-center text-xs text-muted-foreground">You are playing as <span className={myToken==="X"?"neon-text-cyan":"neon-text-magenta"}>{myToken}</span></div>
      </GameShell>
    );
  }

  if (game.status === "aborted") {
    return (
      <GameShell>
        <ResultOverlay text="Match Aborted" tone="muted" onExit={onExit} />
        <div className="my-6 relative">
          <Grid board={game.board} onPlay={()=>{}} disabled />
        </div>
      </GameShell>
    );
  }

  const finished = game.status === "finished";
  const won = finished && game.winner === myToken;
  const lost = finished && game.winner && game.winner !== "draw" && game.winner !== myToken;
  const drawn = finished && game.winner === "draw";
  const myTurn = game.current_turn === myToken;

  return (
    <GameShell onAbort={doAbort}>
      <StatusBar
        text={finished
          ? (won ? "You Win" : lost ? "You Lose" : "Draw")
          : (myTurn ? "Your Turn" : "Opponent's Turn")}
        tone={game.current_turn === "X" ? "cyan" : "magenta"}
      />
      <p className="text-center text-xs uppercase tracking-widest text-muted-foreground mt-1">
        You: <span className={myToken==="X"?"neon-text-cyan":"neon-text-magenta"}>{myToken}</span>
        {game.room_code && <> · Room {game.room_code}</>}
      </p>
      <div className="my-6 relative">
        <Grid board={game.board} onPlay={play} disabled={!myTurn || finished} hint={myToken} />
        <AnimatePresence>
          {finished && (
            <ResultOverlay
              text={won ? "Victory" : lost ? "Defeat" : drawn ? "Draw" : "Match Over"}
              tone={won ? (myToken === "X" ? "cyan" : "magenta") : lost ? "magenta" : "muted"}
              onExit={onExit}
            />
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  );
}
