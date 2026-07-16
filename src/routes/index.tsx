import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GameMenu, type Mode } from "@/components/game/GameMenu";
import { PreGameLobby, type PreGameConfig } from "@/components/game/PreGameLobby";
import { GameScreen } from "@/components/game/GameScreen";
import { Info } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Screen =
  | { name: "menu" }
  | { name: "lobby"; mode: Mode }
  | { name: "game"; mode: Mode; config: PreGameConfig };

function Index() {
  const [screen, setScreen] = useState<Screen>({ name: "menu" });

  const [showAbout, setShowAbout] = useState(false);

  return (
    <main className="min-h-dvh w-full grid place-items-center px-4 py-8 sm:py-12 relative">
      <AnimatePresence mode="wait">
        {screen.name === "menu" && (
          <div key="menu" className="w-full flex justify-center">
            <GameMenu
              onSelect={(m) => {
                if (m === "local") setScreen({ name: "game", mode: "local", config: { token: "X" } });
                else setScreen({ name: "lobby", mode: m });
              }}
            />
          </div>
        )}
        {screen.name === "lobby" && (
          <div key={`lobby-${screen.mode}`} className="w-full flex justify-center">
            <PreGameLobby
              mode={screen.mode}
              onBack={() => setScreen({ name: "menu" })}
              onStart={(config) => setScreen({ name: "game", mode: screen.mode, config })}
            />
          </div>
        )}
        {screen.name === "game" && (
          <div key={`game-${screen.mode}`} className="w-full flex justify-center">
            <GameScreen
              mode={screen.mode}
              config={screen.config}
              onExit={() => setScreen({ name: "menu" })}
            />
          </div>
        )}
      </AnimatePresence>

      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
        onMouseEnter={() => setShowAbout(true)}
        onMouseLeave={() => setShowAbout(false)}
      >
        <AnimatePresence>
          {showAbout && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              className="glass-panel rounded-lg px-4 py-3 text-sm font-medium text-foreground shadow-lg"
            >
              Created by Ron Mathew
            </motion.div>
          )}
        </AnimatePresence>
        <button
          aria-label="About"
          className="flex items-center justify-center w-10 h-10 rounded-full glass-panel text-foreground hover:text-neon-cyan transition-colors"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>
    </main>
  );
}
