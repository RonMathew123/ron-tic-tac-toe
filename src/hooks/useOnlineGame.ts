import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerId } from "@/lib/player-id";
import { makeRoomCode, type Board, type Player } from "@/lib/game-logic";

export interface GameRow {
  id: string;
  room_code: string | null;
  mode: "random" | "private";
  board: Board;
  player_x: string | null;
  player_o: string | null;
  current_turn: Player;
  status: "waiting" | "active" | "finished" | "aborted";
  winner: string | null;
}

type Options =
  | { kind: "random"; preferredToken: "X" | "O" | "random" }
  | { kind: "host"; preferredToken: "X" | "O" | "random" }
  | { kind: "join"; code: string; preferredToken: "X" | "O" | "random" };

function pickToken(pref: "X" | "O" | "random"): "X" | "O" {
  if (pref === "random") return Math.random() < 0.5 ? "X" : "O";
  return pref;
}

export function useOnlineGame(opts: Options) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myToken, setMyToken] = useState<Player | null>(null);
  const playerId = useRef<string>("");
  const gameIdRef = useRef<string | null>(null);

  // init
  useEffect(() => {
    playerId.current = getPlayerId();
    let cancelled = false;
    (async () => {
      try {
        if (opts.kind === "join") {
          const { data, error } = await supabase
            .from("games").select("*").eq("room_code", opts.code).limit(1).maybeSingle();
          if (error) throw error;
          if (!data) { setError("Room not found"); return; }
          if (data.status !== "waiting") { setError("Room is not available"); return; }
          const missing: Player = data.player_x ? "O" : "X";
          const patch = missing === "X"
            ? { player_x: playerId.current, status: "active" as const }
            : { player_o: playerId.current, status: "active" as const };
          const { data: updated, error: uErr } = await supabase
            .from("games").update(patch).eq("id", data.id).select().single();
          if (uErr) throw uErr;
          if (cancelled) return;
          setMyToken(missing);
          setGame(updated as GameRow);
          gameIdRef.current = updated.id;
        } else if (opts.kind === "host") {
          const token = pickToken(opts.preferredToken);
          const code = makeRoomCode();
          const row = {
            mode: "private" as const,
            room_code: code,
            player_x: token === "X" ? playerId.current : null,
            player_o: token === "O" ? playerId.current : null,
            status: "waiting" as const,
          };
          const { data, error } = await supabase.from("games").insert(row).select().single();
          if (error) throw error;
          if (cancelled) return;
          setMyToken(token);
          setGame(data as GameRow);
          gameIdRef.current = data.id;
        } else {
          // random matchmaking: try to find a waiting random game we're not in
          const { data: waiting } = await supabase
            .from("games").select("*")
            .eq("mode", "random").eq("status", "waiting")
            .neq("player_x", playerId.current).neq("player_o", playerId.current)
            .order("created_at", { ascending: true }).limit(1);
          if (waiting && waiting.length > 0) {
            const g = waiting[0] as GameRow;
            const missing: Player = g.player_x ? "O" : "X";
            const patch = missing === "X"
              ? { player_x: playerId.current, status: "active" as const }
              : { player_o: playerId.current, status: "active" as const };
            const { data: updated, error: uErr } = await supabase
              .from("games").update(patch).eq("id", g.id).eq("status","waiting").select().single();
            if (uErr) throw uErr;
            if (cancelled) return;
            setMyToken(missing);
            setGame(updated as GameRow);
            gameIdRef.current = updated.id;
          } else {
            const token = pickToken(opts.preferredToken);
            const row = {
              mode: "random" as const,
              player_x: token === "X" ? playerId.current : null,
              player_o: token === "O" ? playerId.current : null,
              status: "waiting" as const,
            };
            const { data, error } = await supabase.from("games").insert(row).select().single();
            if (error) throw error;
            if (cancelled) return;
            setMyToken(token);
            setGame(data as GameRow);
            gameIdRef.current = data.id;
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime subscription
  useEffect(() => {
    if (!game?.id) return;
    const channel = supabase
      .channel(`game:${game.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => { setGame(payload.new as GameRow); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id]);

  const play = useCallback(async (index: number) => {
    const g = game;
    if (!g || !myToken) return;
    if (g.status !== "active") return;
    if (g.current_turn !== myToken) return;
    if (g.board[index]) return;
    const newBoard = g.board.slice();
    newBoard[index] = myToken;
    // check outcome client side
    const { getWinner, isDraw } = await import("@/lib/game-logic");
    const w = getWinner(newBoard);
    const draw = !w && isDraw(newBoard);
    const patch: Partial<GameRow> = {
      board: newBoard,
      current_turn: myToken === "X" ? "O" : "X",
      status: w || draw ? "finished" : "active",
      winner: w ?? (draw ? "draw" : null),
    };
    setGame({ ...g, ...patch } as GameRow); // optimistic
    await supabase.from("games").update(patch).eq("id", g.id);
  }, [game, myToken]);

  const abort = useCallback(async () => {
    const id = gameIdRef.current;
    if (!id) return;
    await supabase.from("games").update({ status: "aborted" }).eq("id", id);
  }, []);

  return { game, myToken, error, play, abort, playerId: playerId.current };
}
