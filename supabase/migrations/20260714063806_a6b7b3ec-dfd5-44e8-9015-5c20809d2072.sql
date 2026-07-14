
-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS games_insert_all ON public.games;
DROP POLICY IF EXISTS games_update_all ON public.games;
DROP POLICY IF EXISTS games_read_all ON public.games;

-- Guard trigger: enforce invariants on INSERT and UPDATE
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only allow creating a fresh, waiting game
    IF NEW.status <> 'waiting' THEN
      RAISE EXCEPTION 'New games must start in waiting status';
    END IF;
    IF NEW.current_turn <> 'X' THEN
      RAISE EXCEPTION 'New games must start with X to move';
    END IF;
    IF NEW.winner IS NOT NULL THEN
      RAISE EXCEPTION 'New games cannot have a winner';
    END IF;
    IF NEW.board <> '[null,null,null,null,null,null,null,null,null]'::jsonb THEN
      RAISE EXCEPTION 'New games must start with an empty board';
    END IF;
    IF NEW.mode NOT IN ('random','private') THEN
      RAISE EXCEPTION 'Invalid mode';
    END IF;
    -- Exactly one player slot filled at creation
    IF (NEW.player_x IS NULL AND NEW.player_o IS NULL)
       OR (NEW.player_x IS NOT NULL AND NEW.player_o IS NOT NULL) THEN
      RAISE EXCEPTION 'Creator must occupy exactly one player slot';
    END IF;
    -- Private rooms need a code; random rooms must not have one
    IF NEW.mode = 'private' AND (NEW.room_code IS NULL OR length(NEW.room_code) <> 4) THEN
      RAISE EXCEPTION 'Private games require a 4-character room code';
    END IF;
    IF NEW.mode = 'random' AND NEW.room_code IS NOT NULL THEN
      RAISE EXCEPTION 'Random games must not have a room code';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable identity/config fields
    IF NEW.mode IS DISTINCT FROM OLD.mode THEN
      RAISE EXCEPTION 'mode is immutable';
    END IF;
    IF NEW.room_code IS DISTINCT FROM OLD.room_code THEN
      RAISE EXCEPTION 'room_code is immutable';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'created_at is immutable';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'id is immutable';
    END IF;

    -- No changes allowed once the game is over
    IF OLD.status IN ('finished','aborted') THEN
      RAISE EXCEPTION 'Game is already %', OLD.status;
    END IF;

    -- Player slots may only be filled once (never changed or cleared)
    IF OLD.player_x IS NOT NULL AND NEW.player_x IS DISTINCT FROM OLD.player_x THEN
      RAISE EXCEPTION 'player_x cannot be changed once set';
    END IF;
    IF OLD.player_o IS NOT NULL AND NEW.player_o IS DISTINCT FROM OLD.player_o THEN
      RAISE EXCEPTION 'player_o cannot be changed once set';
    END IF;
    -- The two players must remain distinct
    IF NEW.player_x IS NOT NULL AND NEW.player_o IS NOT NULL
       AND NEW.player_x = NEW.player_o THEN
      RAISE EXCEPTION 'A single player cannot occupy both slots';
    END IF;

    -- Case A: the second player is joining (status waiting -> active)
    IF OLD.status = 'waiting' THEN
      IF NEW.status NOT IN ('waiting','active','aborted') THEN
        RAISE EXCEPTION 'Invalid status transition from waiting';
      END IF;
      -- Board and turn must stay untouched while waiting
      IF NEW.board <> OLD.board THEN
        RAISE EXCEPTION 'Board cannot change before game is active';
      END IF;
      IF NEW.current_turn <> OLD.current_turn THEN
        RAISE EXCEPTION 'Turn cannot change before game is active';
      END IF;
      IF NEW.winner IS NOT NULL AND NEW.status <> 'aborted' THEN
        RAISE EXCEPTION 'No winner allowed before game is active';
      END IF;
      -- Going to active requires both players present
      IF NEW.status = 'active' AND (NEW.player_x IS NULL OR NEW.player_o IS NULL) THEN
        RAISE EXCEPTION 'Cannot activate without two players';
      END IF;
      RETURN NEW;
    END IF;

    -- Case B: active game -> a move, finish, or abort
    IF OLD.status = 'active' THEN
      IF NEW.status = 'aborted' THEN
        RETURN NEW; -- allow abort
      END IF;
      IF NEW.status NOT IN ('active','finished') THEN
        RAISE EXCEPTION 'Invalid status transition from active';
      END IF;

      -- Exactly one cell must change, from null to OLD.current_turn
      FOR i IN 0..8 LOOP
        old_cell := (OLD.board -> i)::text;
        new_cell := (NEW.board -> i)::text;
        IF old_cell IS DISTINCT FROM new_cell THEN
          diff_count := diff_count + 1;
          changed_index := i;
          IF old_cell <> 'null' THEN
            RAISE EXCEPTION 'Cannot overwrite an occupied cell';
          END IF;
          IF new_cell <> ('"' || OLD.current_turn || '"') THEN
            RAISE EXCEPTION 'Move must match current_turn';
          END IF;
        END IF;
      END LOOP;

      IF diff_count <> 1 THEN
        RAISE EXCEPTION 'A move must change exactly one cell';
      END IF;

      -- Turn must flip to the other player (unless game just finished with no further turn needed;
      -- we still require the flip because the app always writes it)
      expected_turn := CASE OLD.current_turn WHEN 'X' THEN 'O' ELSE 'X' END;
      IF NEW.current_turn <> expected_turn THEN
        RAISE EXCEPTION 'current_turn must alternate';
      END IF;

      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Unexpected update on status %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_guard_ins ON public.games;
DROP TRIGGER IF EXISTS games_guard_upd ON public.games;
CREATE TRIGGER games_guard_ins BEFORE INSERT ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.games_guard();
CREATE TRIGGER games_guard_upd BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.games_guard();

-- Recreate policies with non-trivial checks (defense in depth on top of the trigger)
CREATE POLICY games_insert_guarded ON public.games
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'waiting'
    AND current_turn = 'X'
    AND winner IS NULL
    AND mode IN ('random','private')
    AND ((player_x IS NULL) <> (player_o IS NULL))
    AND board = '[null,null,null,null,null,null,null,null,null]'::jsonb
  );

CREATE POLICY games_update_guarded ON public.games
  FOR UPDATE TO anon, authenticated
  USING (status IN ('waiting','active'))
  WITH CHECK (status IN ('waiting','active','finished','aborted'));

-- SELECT stays open so both anonymous participants and the realtime channel
-- can observe game state. player_x / player_o hold client-generated random
-- UUIDs from localStorage, not authenticated user identities or PII.
CREATE POLICY games_select_open ON public.games
  FOR SELECT TO anon, authenticated
  USING (true);
