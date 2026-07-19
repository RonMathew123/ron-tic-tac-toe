import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensurePlayerId } from "@/lib/player-id";
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
  | { kind: "join"; code: string; preferredToken: "X" | "O" | "random" }
  | { kind: "rejoin"; gameId: string; asToken: Player };

function pickToken(pref: "X" | "O" | "random"): "X" | "O" {
  if (pref === "random") return Math.random() < 0.5 ? "X" : "O";
  return pref;
}

export function useOnlineGame(opts: Options) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myToken, setMyToken] = useState<Player | null>(null);
  const [rematch, setRematch] = useState<{ iWant: boolean; theyWant: boolean }>({ iWant: false, theyWant: false });
  const [nextGameId, setNextGameId] = useState<string | null>(null);
  const playerId = useRef<string>("");
  const gameIdRef = useRef<string | null>(null);
  const createdByMeRef = useRef<boolean>(false);
  const statusRef = useRef<GameRow["status"] | null>(null);
  const didInit = useRef(false);
  const rematchChannelRef = useRef<RealtimeChannel | null>(null);
  const createdRematchRef = useRef(false);

  async function tryJoinRandom(pid: string): Promise<GameRow | null> {
    const { data: waiting, error: sErr } = await supabase
      .from("games").select("*")
      .eq("mode", "random").eq("status", "waiting")
      .or("player_x.is.null,player_o.is.null")
      .order("created_at", { ascending: true }).limit(5);
    if (sErr) throw sErr;
    for (const raw of waiting ?? []) {
      const g = raw as GameRow;
      if (g.player_x === pid || g.player_o === pid) continue;
      const missing: Player = g.player_x ? "O" : "X";
      const patch = missing === "X"
        ? { player_x: pid, status: "active" as const }
        : { player_o: pid, status: "active" as const };
      const q = supabase.from("games").update(patch).eq("id", g.id).eq("status", "waiting");
      const scoped = missing === "X" ? q.is("player_x", null) : q.is("player_o", null);
      const { data: updated, error: uErr } = await scoped.select().maybeSingle();
      if (uErr) continue;
      if (updated) {
        setMyToken(missing);
        return updated as GameRow;
      }
    }
    return null;
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    let cancelled = false;
    (async () => {
      try {
        playerId.current = await ensurePlayerId();
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
          statusRef.current = updated.status as GameRow["status"];
        } else if (opts.kind === "rejoin") {
          // Load an existing game (used for rematches). If we're the joiner
          // (asToken='O'), claim the empty seat and activate.
          const { data, error } = await supabase
            .from("games").select("*").eq("id", opts.gameId).maybeSingle();
          if (error) throw error;
          if (!data) { setError("Rematch game missing"); return; }
          let row = data as GameRow;
          const alreadySeated =
            (opts.asToken === "X" && row.player_x === playerId.current) ||
            (opts.asToken === "O" && row.player_o === playerId.current);
          if (!alreadySeated && row.status === "waiting") {
            const patch = opts.asToken === "X"
              ? { player_x: playerId.current, status: "active" as const }
              : { player_o: playerId.current, status: "active" as const };
            const q = supabase.from("games").update(patch).eq("id", row.id).eq("status", "waiting");
            const scoped = opts.asToken === "X" ? q.is("player_x", null) : q.is("player_o", null);
            const { data: updated, error: uErr } = await scoped.select().maybeSingle();
            if (uErr) throw uErr;
            if (updated) row = updated as GameRow;
          }
          if (cancelled) return;
          setMyToken(opts.asToken);
          setGame(row);
          gameIdRef.current = row.id;
          statusRef.current = row.status;
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
          statusRef.current = data.status as GameRow["status"];
        } else {
          let joined = await tryJoinRandom(playerId.current);
          if (!joined) {
            await new Promise((r) => setTimeout(r, 250));
            joined = await tryJoinRandom(playerId.current);
          }
          if (cancelled) return;
          if (joined) {
            setGame(joined);
            gameIdRef.current = joined.id;
            statusRef.current = joined.status as GameRow["status"];
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
            statusRef.current = data.status as GameRow["status"];
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { statusRef.current = game?.status ?? null; }, [game?.status]);

  useEffect(() => {
    const cleanupWaiting = () => {
      const id = gameIdRef.current;
      if (!id) return;
      if (!createdByMeRef.current) return;
      if (statusRef.current !== "waiting") return;
      void supabase.from("games").update({ status: "aborted" }).eq("id", id).eq("status", "waiting");
    };
    window.addEventListener("beforeunload", cleanupWaiting);
    return () => {
      window.removeEventListener("beforeunload", cleanupWaiting);
      cleanupWaiting();
    };
  }, []);

  // Realtime game row subscription
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

  // Rematch broadcast channel — only active while the match is finished.
  useEffect(() => {
    if (!game?.id || game.status !== "finished" || !myToken) return;
    createdRematchRef.current = false;
    setRematch({ iWant: false, theyWant: false });
    setNextGameId(null);
    const ch = supabase.channel(`rematch:${game.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "want" }, ({ payload }) => {
      if (payload?.token && payload.token !== myToken) {
        setRematch((s) => ({ ...s, theyWant: true }));
      }
    });
    ch.on("broadcast", { event: "newGame" }, ({ payload }) => {
      if (payload?.id) setNextGameId(payload.id as string);
    });
    ch.subscribe();
    rematchChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      rematchChannelRef.current = null;
    };
  }, [game?.id, game?.status, myToken]);

  // When both players want a rematch, X provisions the new game and broadcasts it.
  useEffect(() => {
    if (!game || game.status !== "finished") return;
    if (!rematch.iWant || !rematch.theyWant) return;
    if (myToken !== "X") return;
    if (nextGameId || createdRematchRef.current) return;
    createdRematchRef.current = true;
    (async () => {
      try {
        const code = makeRoomCode();
        const { data, error } = await supabase.from("games").insert({
          mode: "private" as const,
          room_code: code,
          player_x: playerId.current,
          player_o: null,
          status: "waiting" as const,
        }).select().single();
        if (error || !data) { createdRematchRef.current = false; return; }
        setNextGameId(data.id);
        await rematchChannelRef.current?.send({
          type: "broadcast", event: "newGame",
          payload: { id: data.id, code: data.room_code },
        });
      } catch {
        createdRematchRef.current = false;
      }
    })();
  }, [rematch, myToken, nextGameId, game]);

  const play = useCallback(async (index: number) => {
    const g = game;
    if (!g || !myToken) return;
    if (g.status !== "active") return;
    if (g.current_turn !== myToken) return;
    if (g.board[index]) return;
    const newBoard = g.board.slice();
    newBoard[index] = myToken;
    const { getWinner, isDraw } = await import("@/lib/game-logic");
    const w = getWinner(newBoard);
    const draw = !w && isDraw(newBoard);
    const patch: Partial<GameRow> = {
      board: newBoard,
      current_turn: myToken === "X" ? "O" : "X",
      status: w || draw ? "finished" : "active",
      winner: w ?? (draw ? "draw" : null),
    };
    setGame({ ...g, ...patch } as GameRow);
    await supabase.from("games").update(patch).eq("id", g.id);
  }, [game, myToken]);

  const abort = useCallback(async () => {
    const id = gameIdRef.current;
    if (!id) return;
    await supabase.from("games").update({ status: "aborted" }).eq("id", id);
  }, []);

  const requestRematch = useCallback(async () => {
    if (!game || !myToken || game.status !== "finished") return;
    if (rematch.iWant) return;
    setRematch((s) => ({ ...s, iWant: true }));
    await rematchChannelRef.current?.send({
      type: "broadcast", event: "want", payload: { token: myToken },
    });
  }, [game, myToken, rematch.iWant]);

  return {
    game, myToken, error, play, abort,
    requestRematch, rematch, nextGameId,
    playerId: playerId.current,
  };
}
