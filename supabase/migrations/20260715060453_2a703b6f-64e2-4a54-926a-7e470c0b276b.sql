DROP POLICY IF EXISTS games_update_participant ON public.games;
CREATE POLICY games_update_participant ON public.games
FOR UPDATE TO anon, authenticated
USING (
  auth.uid() IS NOT NULL
  AND status IN ('waiting','active')
  AND (
    auth.uid() = player_x
    OR auth.uid() = player_o
    OR (status = 'waiting' AND (player_x IS NULL OR player_o IS NULL))
  )
)
WITH CHECK (
  status IN ('waiting','active','finished','aborted')
  AND (auth.uid() = player_x OR auth.uid() = player_o)
);