# KdeJe

Evidencia neprítomností pre Euro Data Distribution s.r.o. – Next.js (Vercel) + Supabase.

## Čo je hotové

- Prihlásenie odkazom do e-mailu (Supabase Auth, bez verejnej registrácie)
- Hlavička a záložky podľa roly (zamestnanec / admin)
- Kalendár tímu a Môj kalendár – mesačná mriežka, čiastočné dni, poznámky, sviatky, GDPR „MIMO“
- Zapísať neprítomnosť; v zamknutom období sa automaticky vytvorí žiadosť s dôvodom
- Admin záložky Prehľad, Podklad pre mzdy, Nastavenia, Schvaľovanie – zatiaľ prázdne

## Databáza

1. Supabase → SQL Editor → spustiť `supabase/migrations/20261022000001_kdeje_schema.sql`
2. Potom `supabase/seed.sql` (najprv doplniť e-maily zamestnancov)
3. Authentication → Sign In / Providers: Email zapnutý, „Allow new users to sign up“ vypnuté
4. Zamestnancov pozývať cez Authentication → Users → Invite user (účet sa prepojí podľa e-mailu)
5. Authentication → URL Configuration: Site URL = adresa na Verceli, Redirect URLs = `https://<adresa>/**`

## Premenné prostredia

Pozri `.env.example`. Vo Verceli: Settings → Environment Variables.

| Premenná | Kde ju nájdete |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |

Kľúč `service_role` do aplikácie nepatrí.

## Lokálny vývoj

```bash
cp .env.example .env.local   # doplniť hodnoty
npm install
npm run dev                  # http://localhost:3000
```

Pre lokálne prihlásenie pridajte v Supabase do Redirect URLs aj `http://localhost:3000/**`.
