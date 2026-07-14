import { motion } from "framer-motion";
import { NeonButton } from "./NeonButton";
import { Cpu, Users, Globe, KeyRound } from "lucide-react";

export type Mode = "local" | "bot" | "random" | "private";

interface Props { onSelect: (m: Mode) => void }

const modes: { id: Mode; title: string; desc: string; icon: React.ReactNode; variant: "cyan"|"magenta" }[] = [
  { id: "local",   title: "Local 1v1",     desc: "Two players, one device",       icon: <Users className="w-5 h-5" />,    variant: "cyan" },
  { id: "bot",     title: "Vs Bot",        desc: "Easy · Intermediate · Impossible", icon: <Cpu className="w-5 h-5" />,      variant: "magenta" },
  { id: "random",  title: "Random Match",  desc: "Auto-match online rival",       icon: <Globe className="w-5 h-5" />,    variant: "cyan" },
  { id: "private", title: "Private Room",  desc: "Host or join with a code",      icon: <KeyRound className="w-5 h-5" />, variant: "magenta" },
];

export function GameMenu({ onSelect }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl glass-panel rounded-2xl p-8 sm:p-10"
    >
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-6xl font-display font-black">
          <span className="neon-text-cyan">TIC</span>
          <span className="mx-2 text-foreground/40">/</span>
          <span className="neon-text-magenta">TAC</span>
          <span className="mx-2 text-foreground/40">/</span>
          <span className="neon-text-cyan">TOE</span>
        </h1>
        <p className="mt-3 text-muted-foreground uppercase tracking-[0.3em] text-xs">Neon Grid Protocol v2.0</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((m) => (
          <motion.button
            key={m.id}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(m.id)}
            className={`text-left p-5 rounded-xl glass-panel glitch-hover transition-all ${
              m.variant === "cyan" ? "hover:neon-border-cyan" : "hover:neon-border-magenta"
            }`}
          >
            <div className={`flex items-center gap-2 font-display uppercase tracking-wider ${
              m.variant === "cyan" ? "neon-text-cyan" : "neon-text-magenta"
            }`}>
              {m.icon}<span>{m.title}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{m.desc}</p>
          </motion.button>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground/70">
        Choose your protocol. All online matches sync in real time.
      </p>
    </motion.div>
  );
}
