
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text UNIQUE,
  mode text NOT NULL CHECK (mode IN ('random','private')),
  board jsonb NOT NULL DEFAULT '[null,null,null,null,null,null,null,null,null]'::jsonb,
  player_x uuid,
  player_o uuid,
  current_turn text NOT NULL DEFAULT 'X' CHECK (current_turn IN ('X','O')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','aborted')),
  winner text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_status_mode ON public.games (status, mode, created_at);
CREATE INDEX idx_games_room_code ON public.games (room_code);

GRANT SELECT, INSERT, UPDATE ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_read_all" ON public.games FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "games_insert_all" ON public.games FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "games_update_all" ON public.games FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.games;

CREATE OR REPLACE FUNCTION public.games_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_games_touch BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_touch_updated_at();
