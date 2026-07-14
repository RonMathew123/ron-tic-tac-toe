import { useState } from "react";
import { motion } from "framer-motion";
import { NeonButton } from "./NeonButton";
import type { Mode } from "./GameMenu";
import type { Difficulty } from "@/lib/game-logic";
import { ArrowLeft } from "lucide-react";

export interface PreGameConfig {
  token: "X" | "O" | "random";
  difficulty?: Difficulty;
  action?: "host" | "join";
  code?: string;
}

interface Props {
  mode: Mode;
  onStart: (cfg: PreGameConfig) => void;
  onBack: () => void;
}

export function PreGameLobby({ mode, onStart, onBack }: Props) {
  const [token, setToken] = useState<"X" | "O" | "random">("random");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [action, setAction] = useState<"host" | "join">("host");
  const [code, setCode] = useState("");

  const title =
    mode === "bot" ? "Vs Bot" :
    mode === "random" ? "Random Match" :
    mode === "private" ? "Private Room" : "Local";

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
      className="w-full max-w-lg glass-panel rounded-2xl p-8"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm uppercase tracking-widest">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h2 className="text-2xl font-display uppercase tracking-widest neon-text-cyan mb-6">{title}</h2>

      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your Token</p>
          <div className="grid grid-cols-3 gap-2">
            {(["X", "O", "random"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setToken(t)}
                className={`py-3 rounded-lg font-display text-xl transition-all ${
                  token === t
                    ? t === "X" ? "neon-border-cyan neon-text-cyan"
                      : t === "O" ? "neon-border-magenta neon-text-magenta"
                      : "neon-border-cyan neon-text-cyan"
                    : "border border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "random" ? "?" : t}
              </button>
            ))}
          </div>
        </div>

        {mode === "bot" && (
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Difficulty</p>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "intermediate", "impossible"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-lg text-xs uppercase tracking-widest transition-all ${
                    difficulty === d
                      ? "neon-border-magenta neon-text-magenta"
                      : "border border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "private" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAction("host")}
                className={`py-2 rounded-lg text-sm uppercase tracking-widest ${
                  action === "host" ? "neon-border-cyan neon-text-cyan" : "border border-border/40 text-muted-foreground"
                }`}
              >Host</button>
              <button
                onClick={() => setAction("join")}
                className={`py-2 rounded-lg text-sm uppercase tracking-widest ${
                  action === "join" ? "neon-border-magenta neon-text-magenta" : "border border-border/40 text-muted-foreground"
                }`}
              >Join</button>
            </div>
            {action === "join" && (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="ROOM"
                maxLength={4}
                className="w-full text-center font-display text-3xl tracking-[0.5em] py-3 bg-[oklch(0.16_0.02_280_/_0.7)] rounded-lg neon-border-cyan neon-text-cyan outline-none uppercase"
              />
            )}
          </div>
        )}

        <NeonButton
          variant="cyan"
          onClick={() => onStart({ token, difficulty, action, code })}
          className="w-full"
          disabled={mode === "private" && action === "join" && code.length !== 4}
        >
          {mode === "random" ? "Find Match" :
           mode === "private" ? (action === "host" ? "Create Room" : "Join Room") :
           "Start Match"}
        </NeonButton>
      </div>
    </motion.div>
  );
}
