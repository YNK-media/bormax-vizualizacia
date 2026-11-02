# Vizualizácia farby okien – Bormax

Lead-magnet mikrostránka pre klienta Bormax (okná a dvere DRUTEX). Zákazník nahrá fotku domu, vyberie 1–3 farby rámov a do 60 minút dostane e-mailom AI vizualizácie.

Live: https://vizualizacia.bormax.sk (GitHub Pages z vetvy `main`, vlastná doména cez `CNAME`).

## Ako to funguje

1. `index.html` – statická stránka. Fotku zmenší v prehliadači (max 1600 px, JPEG) a spolu s výberom farieb a e-mailom ju odošle ako JSON do Apps Scriptu (skrytý formulár → iframe, rovnaký princíp ako brief na ugc.ynk.media).
2. `apps-script/Code.gs` – beží v Google účte YNK. `doPost` uloží fotku na Drive (`BORMAX - Claude/Vizualizator okien/prijate`), nastaví zdieľanie „ktokoľvek s odkazom" a zapíše riadok do tabuľky „Bormax vizualizátor – odpovede" (list `Odpovede`).
3. Naplánovaná úloha Claude (každú hodinu) spracuje nové riadky: Higgsfield (Nano Banana 2.1) vygeneruje vizualizácie, zapíše JSON do `hotove/` a vytvorí subscribera v MailerLite (skupina „Bormax - vizualizácia okien").
4. `saveResults()` v Apps Scripte každých 10 min stiahne hotové obrázky z JSON na Drive.
5. MailerLite automatizácia pošle e-mail s vizualizáciami a o 2 dni follow-up.

## Meranie

- Google tag GA4 **G-B6J2PGZ8C5** (vlastníctvo BORMAX, rovnaký stream ako www.bormax.sk) – `page_view` a po potvrdenom odoslaní (`showDone`) udalosť **`generate_lead`** (value 1 EUR, `form_name: vizualizacia_okien`). Udalosť je kľúčová a importuje sa do Google Ads ako primárna konverzia „bormax.sk (web) generate_lead“.
- Meta Pixel **1546389223098777** – `PageView` a po odoslaní **`Lead`** (value 1 EUR) pre Meta kampaň vizualizácie.
- Lead sa meria len raz a iba keď Apps Script vráti `{"ok":true}` (alebo sa načíta záložný iframe), nie pri chybe.

## Nasadenie Apps Scriptu

1. script.google.com → projekt „Projekt bez mena" (alebo nový) → vložiť `apps-script/Code.gs`.
2. Spustiť `setupTriggers()` a autorizovať (Drive, Sheets, UrlFetch).
3. Nasadiť → Nové nasadenie → Webová aplikácia → Spustiť ako: **ja**, Prístup: **ktokoľvek** → skopírovať URL.
4. URL vložiť do `index.html` do konštanty `APPS_SCRIPT_URL`, commitnúť.

## Súbory

- `index.html` – stránka
- `assets/vzorky/*.jpg` – 12 vzoriek dekorov DRUTEX (reálne fólie z drutex.eu)
- `apps-script/Code.gs` – backend
- `CNAME` – vlastná doména

## Dáta a GDPR

Prevádzkovateľ údajov: Bormax. YNK media spracúva v jeho mene (hosting stránky, Drive, MailerLite, Higgsfield). Fotky sa uchovávajú najviac 90 dní (mazanie robí Bormax/YNK ručne alebo cez trigger po dohode). Na GitHube nie sú žiadne osobné údaje – iba statická stránka.
