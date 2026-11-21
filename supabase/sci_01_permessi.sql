-- Pagina S.C.I. (Sistema di Comunicazione Interattivo): permesso 'sci'.
-- Già applicata al database; qui solo per archivio. Idempotente: si può rieseguire.
-- Testo ricavato da pg_policies (novembre 2026).

-- Bot: collegati e storico invii
drop policy if exists bot_chat_lettura on public.bot_chat;
create policy bot_chat_lettura on public.bot_chat for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

drop policy if exists bot_invii_lettura on public.bot_invii;
create policy bot_invii_lettura on public.bot_invii for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

-- Fotosegnalazioni del bot
drop policy if exists lettura on public.evento_segnalazioni;
create policy lettura on public.evento_segnalazioni for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

drop policy if exists modifica on public.evento_segnalazioni;
create policy modifica on public.evento_segnalazioni for update to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])))
  with check ((select ho_uno_di('{eventi,sci}'::text[])));

drop policy if exists eliminazione on public.evento_segnalazioni;
create policy eliminazione on public.evento_segnalazioni for delete to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

-- Eventi (lettura, per filtri e assegnazione)
drop policy if exists lettura on public.eventi;
create policy lettura on public.eventi for select to authenticated
  using ((select ho_uno_di('{eventi,sci}'::text[])));

-- Richieste dei volontari (tabella segnalazioni)
drop policy if exists lettura on public.segnalazioni;
create policy lettura on public.segnalazioni for select to authenticated
  using (((select ho_uno_di('{gestione_segnalazioni,sci}'::text[])) or (volontario_id = (select mio_volontario_id()))));

drop policy if exists gestione on public.segnalazioni;
create policy gestione on public.segnalazioni for update to authenticated
  using ((select ho_uno_di('{gestione_segnalazioni,sci}'::text[])))
  with check ((select ho_uno_di('{gestione_segnalazioni,sci}'::text[])));

-- File del bucket privato segnalazioni
drop policy if exists segnalazioni_lettura on storage.objects;
create policy segnalazioni_lettura on storage.objects for select to authenticated
  using (((bucket_id = 'segnalazioni'::text) and ((select ho_uno_di('{gestione_segnalazioni,sci}'::text[])) or (owner = (select auth.uid())))));

-- Volontari: lettura anche con 'sci'
drop policy if exists lettura on public.volontari;
create policy lettura on public.volontari for select to authenticated
  using (((select ho_uno_di(array['volontari','modifica_volontari','visite','formazione','db','accessi','interventi','postazioni','documenti','impostazioni','statistiche','dotazioni','pianicarico','gestione_segnalazioni','convocazioni','convocazioni_gestione','eventi','sci']::text[]))
          or (id = (select mio_volontario_id()))));

-- Chi aveva già 'eventi' (non master) riceve anche 'sci'
update public.staff
   set permessi = coalesce(permessi, '{}'::jsonb) || '{"sci": true}'::jsonb
 where tipo_accesso <> 'master'
   and (permessi->>'eventi') = 'true'
   and (permessi->>'sci') is distinct from 'true';
