-- Fix race condition (audit red-team R1) : POST /api/points/redeem faisait
-- un check-then-act pur — SELECT balance, comparaison JS, puis
-- UPDATE balance = <balance lu> - cost (valeur absolue recalculee cote
-- application, pas un decrement relatif SQL). 2 requetes concurrentes avec
-- le meme cout lisent toutes les deux le meme solde de depart (ex: 100),
-- passent toutes les deux le check (100>=60), et ecrivent TOUTES LES DEUX
-- balance=40 : double redemption d'un article (2 items obtenus) pour un
-- seul debit reel (lost update classique), le journal point_transactions
-- lui montre 2 lignes de -60 alors que le solde n'a baisse qu'une fois.
--
-- Fix : RPC atomique, l'UPDATE lui-meme porte la garde
-- (`WHERE balance >= p_cost`), verrouillage de ligne implicite Postgres —
-- la 2e requete concurrente attend le verrou de la 1re, relit le solde
-- DEJA DEBITE, et echoue naturellement si insuffisant. 0 lecture-puis-
-- ecriture cote application.
CREATE OR REPLACE FUNCTION akasha_ai.redeem_points(
  p_user_id uuid,
  p_cost integer,
  p_item_id text
)
RETURNS TABLE(new_balance integer, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = akasha_ai, pg_temp
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  -- Defense en profondeur : la fonction est SECURITY DEFINER (bypass RLS),
  -- donc elle doit revalider elle-meme l'ownership plutot que de faire
  -- confiance a l'appelant (meme si route.ts ne passe aujourd'hui que
  -- user.id issu de la session, jamais une valeur du body client).
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized for this user';
  END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN QUERY SELECT NULL::integer, false;
    RETURN;
  END IF;

  UPDATE akasha_ai.purama_points
  SET balance = balance - p_cost
  WHERE user_id = p_user_id AND balance >= p_cost
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::integer, false;
    RETURN;
  END IF;

  INSERT INTO akasha_ai.point_transactions (user_id, amount, type, source, description)
  VALUES (p_user_id, -p_cost, 'redeem', 'boutique', 'Achat boutique: ' || p_item_id);

  RETURN QUERY SELECT v_new_balance, true;
END;
$$;

REVOKE ALL ON FUNCTION akasha_ai.redeem_points(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION akasha_ai.redeem_points(uuid, integer, text) TO authenticated, service_role;
