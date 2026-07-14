import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { GameMenu, type Mode } from "@/components/game/GameMenu";
import { PreGameLobby, type PreGameConfig } from "@/components/game/PreGameLobby";
import { GameScreen } from "@/components/game/GameScreen";

export const Route = createFileRoute("/")({
  component: Index,
});

type Screen =
  | { name: "menu" }
  | { name: "lobby"; mode: Mode }
  | { name: "game"; mode: Mode; config: PreGameConfig };

function Index() {
  const [screen, setScreen] = useState<Screen>({ name: "menu" });

  return (
    <main className="min-h-dvh w-full grid place-items-center px-4 py-8 sm:py-12">
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
    </main>
  );
}
