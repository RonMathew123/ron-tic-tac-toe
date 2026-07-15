
-- Tighten policies on public.games so writes require a real identity that
-- matches one of the two player seats. Reads stay open (needed for realtime
-- and random matchmaking discovery).

DROP POLICY IF EXISTS games_insert_guarded ON public.games;
DROP POLICY IF EXISTS games_update_guarded ON public.games;

-- INSERT: caller must be authenticated (anonymous sessions count) and must
-- occupy exactly one seat with their own uid.
CREATE POLICY games_insert_owner ON public.games
FOR INSERT
TO anon, authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND status = 'waiting'
  AND current_turn = 'X'
  AND winner IS NULL
  AND mode IN ('random','private')
  AND board = '[null, null, null, null, null, null, null, null, null]'::jsonb
  AND ((player_x IS NULL) <> (player_o IS NULL))
  AND (
    (player_x = auth.uid() AND player_o IS NULL)
    OR (player_o = auth.uid() AND player_x IS NULL)
  )
);

-- UPDATE: caller must be an existing participant, OR they may claim the still
-- empty seat of a waiting random game (public matchmaking). Post-update, the
-- caller must be sitting in one of the two seats.
CREATE POLICY games_update_participant ON public.games
FOR UPDATE
TO anon, authenticated
USING (
  auth.uid() IS NOT NULL
  AND status IN ('waiting','active')
  AND (
    auth.uid() = player_x
    OR auth.uid() = player_o
    OR (
      status = 'waiting'
      AND mode = 'random'
      AND (player_x IS NULL OR player_o IS NULL)
    )
  )
)
WITH CHECK (
  status IN ('waiting','active','finished','aborted')
  AND (auth.uid() = player_x OR auth.uid() = player_o)
);
