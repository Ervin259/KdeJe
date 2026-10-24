# KdeJe

Evidencia neprítomností pre viac firiem – Next.js (Vercel) + Supabase. Prvý zákazník: Euro Data Distribution s.r.o.

## Roly

- **Superadmin** (tabuľka `platform_admins`) – zakladá firmy (`create_company`), mení stav predplatného (`set_company_status`), štátne sviatky a moduly firiem.
- **Admin firmy** – Nastavenia, Podklad pre mzdy, všetky záznamy vo firme.
- **Vedúci** (`employees.is_manager` + `manager_assignments`) – Prehľad a Schvaľovanie pre svojich ľudí, zápis za nich do uzávierky.
- **Zamestnanec** – vlastný kalendár a prehľad; bez e-mailu sa neprihlasuje a zapisuje za neho vedúci alebo admin.

## Čo je hotové

- Prihlásenie odkazom do e-mailu (Supabase Auth, bez verejnej registrácie)
- Hlavička a záložky podľa roly (zamestnanec / admin)
- Kalendár tímu a Môj kalendár – mesačná mriežka, čiastočné dni, poznámky, sviatky, GDPR „MIMO“
- Zapísať neprítomnosť; v zamknutom období sa automaticky vytvorí žiadosť s dôvodom
- Admin záložky Prehľad, Podklad pre mzdy, Nastavenia, Schvaľovanie – zatiaľ prázdne

## Databáza

1. Supabase → SQL Editor → spustiť `supabase/migrations/20261022000001_kdeje_schema.sql`
2. Potom `supabase/seed.sql` (najprv doplniť e-maily zamestnancov)
3. Migrácie v poradí: `20261023000001_migracia2.sql`, `20261024000001_migracia3.sql` (viac firiem, vedúci, superadmin)
4. Authentication → Sign In / Providers: Email zapnutý, „Allow new users to sign up“ vypnuté
5. Zamestnancov pozývať cez Authentication → Users → Invite user (účet sa prepojí podľa e-mailu)
6. Authentication → URL Configuration: Site URL = adresa na Verceli, Redirect URLs = `https://<adresa>/**`

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
