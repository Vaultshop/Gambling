# GrowRoll Rain Discord Bot

Discord botas, kuris stebi [growroll.gg](https://growroll.gg/) ir:

1. **Įspėja kanale likus 1 min. (konfigūruojama) iki "rain" pradžios.**
2. Komanda `!topgame` — parodo šiuo metu aktualiausią/didžiausiu multiplier'iu
   pasižymintį žaidimą iš gyvų statymų sąrašo.

## Kodėl reikia headless naršyklės (Playwright)

GrowRoll yra JavaScript'u valdoma (Next.js) svetainė. Pagrindiniame HTML,
kurį gauna serveris atsakydamas į paprastą HTTP užklausą, **nėra** nei rain
laikmenčio, nei gyvų statymų lentelės — jie atsiranda tik naršyklei
įvykdžius JS ir prisijungus prie WebSocket. Todėl paprastas `axios + cheerio`
scraping'as negrąžins šitų duomenų. Šitas botas atidaro puslapį realioje
(headless) naršyklėje, palaukia kol viskas užsikrauna, ir tada nuskaito
matomą tekstą.

## 1. Diegimas

```bash
npm install
npx playwright install chromium   # atsisiunčia headless Chromium
cp .env.example .env
```

Užpildykite `.env`:
- `DISCORD_TOKEN` — jūsų boto tokenas iš https://discord.com/developers/applications
- `CHANNEL_ID` — kanalo ID, kuriame turi rašyti botas (Discord → Developer Mode → Copy ID)

## 2. Raskite tikslų "rain" bloko selektorių (svarbiausias žingsnis)

Kadangi negaliu pats atidaryti naršyklės jūsų vardu, paleiskite pagalbinį
skriptą, kuris išsaugos, ką "mato" headless naršyklė:

```bash
node inspect.js
```

Tai sukurs `rendered-text.txt` ir `rendered.html`, o terminale atspausdins
visas eilutes, kuriose paminėtas "rain" arba "lietus". Pažiūrėkite, kaip
tiksliai atrodo tekstas, pvz.:

```
Next rain in 04:32
```

Jei toks tekstas atsiranda — puiku, numatytasis regex jį suras automatiškai
(RAIN_KEYWORDS=rain,lietus + laiko formatas MM:SS). Jei ne (pvz., rain
lentelė matoma tik prisijungus prie paskyros arba yra kitokiame formate),
turėsite:

- Prisijungti naršyklėje, atidaryti **DevTools (F12) → Network → WS**
  skirtuką, rasti WebSocket ryšį ir pažiūrėti, kokias žinutes jis siunčia
  apie "rain" (dažniausiai JSON su `startsAt` / `nextRainAt` laiku). Tai
  **patikimiausias** būdas — galėtume rašyti tiesiai į tą socket'ą vietoj
  naršyklės scraping'o. Jei radę tokį endpoint'ą, atsiųskite man jo pavyzdį
  (URL + žinutės formatą), ir perrašysiu botą, kad naudotų jį tiesiogiai —
  bus greičiau ir stabiliau nei headless naršyklė.
- Arba paspausti dešiniu ant rain elemento → "Inspect" → nukopijuoti jo
  CSS klasę/`data-*` atributą ir įrašyti į `.env` kaip `RAIN_SELECTOR`,
  pvz.: `RAIN_SELECTOR=[data-testid="rain-countdown"]`

## 3. Jei rain lentelė matoma tik prisijungus

1. Prisijunkite prie growroll.gg naršyklėje.
2. Įsidiekite plėtinį "EditThisCookie" arba panašų ir eksportuokite
   cookies kaip JSON masyvą.
3. Įrašykite juos į `cookies.json` šalia `index.js` (kelią nurodo
   `COOKIES_PATH` `.env` faile).

⚠️ Cookies suteikia prieigą prie jūsų paskyros — laikykite failą saugiai,
niekur nekelkite jo į viešą repo.

## 4. Paleidimas

```bash
npm start
```

Botas iš karto patikrins puslapį, o vėliau — kas `POLL_INTERVAL_MS`
milisekundžių (numatyta 15 sek.). Kai iki rain liks ≤ `WARN_SECONDS_BEFORE`
sekundžių, į `CHANNEL_ID` kanalą bus išsiųstas pranešimas (vieną kartą per
konkretų rain įvykį, kad neužverstų kanalo).

## 5. `!topgame` komanda

Parašius kanale `!topgame`, botas atidarys puslapį, palauks kelias
sekundes, kol atvyks keli gyvi statymai, ir grąžins tą, kurio multiplier
(`x`) didžiausias. Jei rezultatai atrodo neteisingi arba tušti, greičiausiai
reikės pakoreguoti `TOP_GAME_ROW_SELECTOR` `.env` faile pagal tai, ką
matote `rendered.html` faile (ieškokite elemento, kuris apgaubia vieną
statymo eilutę — vartotojo vardą, žaidimą, multiplier, sumą).

## Pastabos

- Svetainė yra 18+ kriptovaliutų kazino — botas tik skaito viešai matomą
  informaciją ir nieko automatiškai nestatinėja.
- Jei GrowRoll pakeis savo puslapio struktūrą, selektorius/regex gali
  reikėti atnaujinti — tam ir skirtas `inspect.js`.
