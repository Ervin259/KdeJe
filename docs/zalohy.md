# Zálohy KdeJe

Obchodné podmienky sľubujú **dennú zálohu databázy s uchovaním 30 dní**. Splniť to treba skôr, než podmienky začnú platiť pre platiacich zákazníkov.

## Dve vrstvy

| | Čo | Kde | Ako dlho |
|---|---|---|---|
| 1 | Denné zálohy Supabase | v Supabase | 7 dní (plán Pro) |
| 2 | Vlastná šifrovaná záloha | Synology NAS | 30 dní (nastaviteľné) |

Vrstva 1 je v Supabase súčasťou plateného plánu Pro. Na bezplatnom pláne zálohy nie sú. Vrstva 2 chráni aj pred výpadkom alebo zrušením účtu v Supabase.

**GitHub na zálohy dát nepoužívať** – sú v nich osobné údaje zamestnancov zákazníkov. Repozitár je na kód, nie na dáta.

## Nastavenie na Synology

1. **Container Manager** – nainštalovať z Centra balíkov (ak ešte nie je).
2. **Priečinok** – napríklad zdieľaný priečinok `zalohy`, v ňom `kdeje`. Prístup len pre admina NAS.
3. **Pripojenie k databáze** – Supabase → Project Settings → Database → Connection string → *Session pooler* (URI). Heslo k databáze je v tom istom mieste (Reset database password, ak ho nepoznáš).
4. **Súbor s tajomstvami** `/volume1/zalohy/kdeje/.kdeje-zaloha.env`:
   ```sh
   DB_URL='postgresql://postgres.xxxxxxxx:HESLO_K_DB@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
   HESLO='dlhé-náhodné-heslo-na-šifrovanie-záloh'
   ```
   Potom cez SSH: `chmod 600 /volume1/zalohy/kdeje/.kdeje-zaloha.env`.
   **Heslo na šifrovanie si ulož aj inde** (správca hesiel) – bez neho sa záloha nedá otvoriť.
5. **Skript** `scripts/zaloha-synology.sh` z repozitára skopíruj do `/volume1/zalohy/kdeje/`.
6. **Ovládací panel → Plánovač úloh → Vytvoriť → Plánovaná úloha → Skript definovaný používateľom**
   - Používateľ: `root` (kvôli Dockeru)
   - Plán: denne, napríklad 02:30
   - Nastavenia úlohy → Spustiť príkaz: `sh /volume1/zalohy/kdeje/zaloha-synology.sh`
   - Zapnúť odosielanie výsledku e-mailom „len pri chybe“.
7. Úlohu raz spusti ručne (Spustiť) a skontroluj, že v priečinku pribudol súbor `kdeje-RRRR-MM-DD_HHMM.sql.gz.enc`.

## Obnova (vyskúšať aspoň raz)

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:'HESLO' -in kdeje-2026-11-01_0230.sql.gz.enc | gunzip > kdeje.sql
```

`kdeje.sql` sa dá nahrať do nového projektu Supabase (SQL Editor alebo `psql`). Pri obnove do existujúceho projektu treba najprv rozhodnúť, či sa prepisuje celá databáza, alebo sa z nej len vyberajú údaje jednej firmy.

## Export pre zákazníkov

Každý admin firmy si môže kedykoľvek stiahnuť svoje dáta: **Nastavenia → Firma → Údaje o firme → Export dát** (zamestnanci, záznamy dochádzky, dovolenky v CSV).
