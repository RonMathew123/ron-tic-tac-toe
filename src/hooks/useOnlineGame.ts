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
  const createdByMeRef = useRef<boolean>(false);
  const statusRef = useRef<GameRow["status"] | null>(null);
  const didInit = useRef(false);

  // Try to claim an existing waiting random game. Returns the joined row or null
  // if none was available / all candidates were claimed by others first.
  async function tryJoinRandom(pid: string): Promise<GameRow | null> {
    // A joinable random game must have exactly one empty slot. `neq` on a NULL
    // column filters the row out, so instead ask for "one slot is null".
    const { data: waiting, error: sErr } = await supabase
      .from("games").select("*")
      .eq("mode", "random").eq("status", "waiting")
      .or("player_x.is.null,player_o.is.null")
      .order("created_at", { ascending: true }).limit(5);
    if (sErr) throw sErr;
    for (const raw of waiting ?? []) {
      const g = raw as GameRow;
      // Skip a stale row I created myself.
      if (g.player_x === pid || g.player_o === pid) continue;
      const missing: Player = g.player_x ? "O" : "X";
      // Guard the update on the slot still being empty so the loser of a race
      // gets 0 rows back instead of tripping the DB guard.
      const patch = missing === "X"
        ? { player_x: pid, status: "active" as const }
        : { player_o: pid, status: "active" as const };
      const q = supabase.from("games").update(patch).eq("id", g.id).eq("status", "waiting");
      const scoped = missing === "X" ? q.is("player_x", null) : q.is("player_o", null);
      const { data: updated, error: uErr } = await scoped.select().maybeSingle();
      if (uErr) continue; // race lost or guard fired — try the next candidate
      if (updated) {
        setMyToken(missing);
        return updated as GameRow;
      }
    }
    return null;
  }

  // init
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
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
          const q = supabase.from("games").update(patch).eq("id", data.id).eq("status", "waiting");
          const scoped = missing === "X" ? q.is("player_x", null) : q.is("player_o", null);
          const { data: updated, error: uErr } = await scoped.select().maybeSingle();
          if (uErr) throw uErr;
          if (!updated) { setError("Room was just taken"); return; }
          if (cancelled) return;
          setMyToken(missing);
          setGame(updated as GameRow);
          gameIdRef.current = updated.id;
          statusRef.current = updated.status;
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
          createdByMeRef.current = true;
          setMyToken(token);
          setGame(data as GameRow);
          gameIdRef.current = data.id;
          statusRef.current = data.status;
        } else {
          // random matchmaking
          let joined = await tryJoinRandom(playerId.current);
          if (!joined) {
            // brief retry to reduce the "two clicks at once" collision
            await new Promise((r) => setTimeout(r, 250));
            joined = await tryJoinRandom(playerId.current);
          }
          if (cancelled) return;
          if (joined) {
            setGame(joined);
            gameIdRef.current = joined.id;
            statusRef.current = joined.status;
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
            createdByMeRef.current = true;
            setMyToken(token);
            setGame(data as GameRow);
            gameIdRef.current = data.id;
            statusRef.current = data.status;
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep status ref in sync for the unmount cleanup
  useEffect(() => { statusRef.current = game?.status ?? null; }, [game?.status]);

  // If I created a waiting room and then navigate away, mark it aborted so it
  // doesn't linger in matchmaking.
  useEffect(() => {
    const cleanupWaiting = () => {
      const id = gameIdRef.current;
      if (!id) return;
      if (!createdByMeRef.current) return;
      if (statusRef.current !== "waiting") return;
      // fire-and-forget
      void supabase.from("games").update({ status: "aborted" }).eq("id", id).eq("status", "waiting");
    };
    window.addEventListener("beforeunload", cleanupWaiting);
    return () => {
      window.removeEventListener("beforeunload", cleanupWaiting);
      cleanupWaiting();
    };
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
