
-- Constrain winner values
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_winner_valid;
UPDATE public.games SET winner = NULL WHERE winner IS NOT NULL AND winner NOT IN ('X','O','draw');
ALTER TABLE public.games ADD CONSTRAINT games_winner_valid CHECK (winner IS NULL OR winner IN ('X','O','draw'));

-- Recompute the true winner from a jsonb board and enforce it in the guard trigger
CREATE OR REPLACE FUNCTION public.games_compute_winner(b jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  lines int[][] := ARRAY[
    ARRAY[0,1,2],ARRAY[3,4,5],ARRAY[6,7,8],
    ARRAY[0,3,6],ARRAY[1,4,7],ARRAY[2,5,8],
    ARRAY[0,4,8],ARRAY[2,4,6]
  ];
  ln int[];
  a text; c1 text; c2 text;
  filled int := 0;
  i int;
BEGIN
  FOREACH ln SLICE 1 IN ARRAY lines LOOP
    a  := b ->> ln[1];
    c1 := b ->> ln[2];
    c2 := b ->> ln[3];
    IF a IS NOT NULL AND a = c1 AND a = c2 THEN
      RETURN a;
    END IF;
  END LOOP;
  FOR i IN 0..8 LOOP
    IF (b ->> i) IS NOT NULL THEN filled := filled + 1; END IF;
  END LOOP;
  IF filled = 9 THEN RETURN 'draw'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.games_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  diff_count int := 0;
  i int;
  old_cell text;
  new_cell text;
  changed_index int := -1;
  expected_turn text;
  true_winner text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'waiting' THEN RAISE EXCEPTION 'New games must start in waiting status'; END IF;
    IF NEW.current_turn <> 'X' THEN RAISE EXCEPTION 'New games must start with X to move'; END IF;
    IF NEW.winner IS NOT NULL THEN RAISE EXCEPTION 'New games cannot have a winner'; END IF;
    IF NEW.board <> '[null,null,null,null,null,null,null,null,null]'::jsonb THEN
      RAISE EXCEPTION 'New games must start with an empty board';
    END IF;
    IF NEW.mode NOT IN ('random','private') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
    IF (NEW.player_x IS NULL AND NEW.player_o IS NULL)
       OR (NEW.player_x IS NOT NULL AND NEW.player_o IS NOT NULL) THEN
      RAISE EXCEPTION 'Creator must occupy exactly one player slot';
    END IF;
    IF NEW.mode = 'private' AND (NEW.room_code IS NULL OR length(NEW.room_code) <> 4) THEN
      RAISE EXCEPTION 'Private games require a 4-character room code';
    END IF;
    IF NEW.mode = 'random' AND NEW.room_code IS NOT NULL THEN
      RAISE EXCEPTION 'Random games must not have a room code';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.mode IS DISTINCT FROM OLD.mode THEN RAISE EXCEPTION 'mode is immutable'; END IF;
    IF NEW.room_code IS DISTINCT FROM OLD.room_code THEN RAISE EXCEPTION 'room_code is immutable'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;

    IF OLD.status IN ('finished','aborted') THEN
      RAISE EXCEPTION 'Game is already %', OLD.status;
    END IF;

    IF OLD.player_x IS NOT NULL AND NEW.player_x IS DISTINCT FROM OLD.player_x THEN
      RAISE EXCEPTION 'player_x cannot be changed once set';
    END IF;
    IF OLD.player_o IS NOT NULL AND NEW.player_o IS DISTINCT FROM OLD.player_o THEN
      RAISE EXCEPTION 'player_o cannot be changed once set';
    END IF;
    IF NEW.player_x IS NOT NULL AND NEW.player_o IS NOT NULL
       AND NEW.player_x = NEW.player_o THEN
      RAISE EXCEPTION 'A single player cannot occupy both slots';
    END IF;

    IF OLD.status = 'waiting' THEN
      IF NEW.status NOT IN ('waiting','active','aborted') THEN
        RAISE EXCEPTION 'Invalid status transition from waiting';
      END IF;
      IF NEW.board <> OLD.board THEN RAISE EXCEPTION 'Board cannot change before game is active'; END IF;
      IF NEW.current_turn <> OLD.current_turn THEN RAISE EXCEPTION 'Turn cannot change before game is active'; END IF;
      IF NEW.winner IS NOT NULL AND NEW.status <> 'aborted' THEN
        RAISE EXCEPTION 'No winner allowed before game is active';
      END IF;
      IF NEW.status = 'active' AND (NEW.player_x IS NULL OR NEW.player_o IS NULL) THEN
        RAISE EXCEPTION 'Cannot activate without two players';
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.status = 'active' THEN
      IF NEW.status = 'aborted' THEN
        -- Do not allow silent board/winner rewrites while aborting.
        IF NEW.board <> OLD.board THEN RAISE EXCEPTION 'Board cannot change on abort'; END IF;
        IF NEW.current_turn <> OLD.current_turn THEN RAISE EXCEPTION 'Turn cannot change on abort'; END IF;
        IF NEW.winner IS NOT NULL THEN RAISE EXCEPTION 'Aborted games have no winner'; END IF;
        RETURN NEW;
      END IF;
      IF NEW.status NOT IN ('active','finished') THEN
        RAISE EXCEPTION 'Invalid status transition from active';
      END IF;

      FOR i IN 0..8 LOOP
        old_cell := (OLD.board -> i)::text;
        new_cell := (NEW.board -> i)::text;
        IF old_cell IS DISTINCT FROM new_cell THEN
          diff_count := diff_count + 1;
          changed_index := i;
          IF old_cell <> 'null' THEN RAISE EXCEPTION 'Cannot overwrite an occupied cell'; END IF;
          IF new_cell <> ('"' || OLD.current_turn || '"') THEN
            RAISE EXCEPTION 'Move must match current_turn';
          END IF;
        END IF;
      END LOOP;

      IF diff_count <> 1 THEN RAISE EXCEPTION 'A move must change exactly one cell'; END IF;

      expected_turn := CASE OLD.current_turn WHEN 'X' THEN 'O' ELSE 'X' END;
      IF NEW.current_turn <> expected_turn THEN
        RAISE EXCEPTION 'current_turn must alternate';
      END IF;

      -- Recompute real outcome from the new board and reject any mismatch.
      true_winner := public.games_compute_winner(NEW.board);

      IF NEW.status = 'finished' THEN
        IF true_winner IS NULL THEN
          RAISE EXCEPTION 'Cannot finish: board has no winner and is not full';
        END IF;
        IF NEW.winner IS DISTINCT FROM true_winner THEN
          RAISE EXCEPTION 'winner does not match board state';
        END IF;
      ELSE
        -- Still active: must not claim a winner, and board must not already be decided.
        IF NEW.winner IS NOT NULL THEN
          RAISE EXCEPTION 'Cannot set winner while status is active';
        END IF;
        IF true_winner IS NOT NULL THEN
          RAISE EXCEPTION 'Game is decided; status must be finished';
        END IF;
      END IF;

      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Unexpected update on status %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
