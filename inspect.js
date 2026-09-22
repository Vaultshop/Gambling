/**
 * Pagalbinis skriptas: atidaro puslapį headless naršyklėje, palaukia,
 * kol JS/WebSocket viską užkraus, ir išveda visą matomą teksto turinį
 * bei HTML į failus, kad galėtumėte surasti tikslų "rain" bloko tekstą
 * arba CSS klasę ir įrašyti ją į .env (RAIN_SELECTOR / RAIN_KEYWORDS).
 *
 * Paleidimas:
 *   node inspect.js
 *
 * Rezultatas:
 *   rendered-text.txt  – viskas, ką matote ekrane, kaip grynas tekstas
 *   rendered.html      – pilnas po-JS HTML (grep'inkite "rain")
 */
require('dotenv').config();
const fs = require('fs');
const { loadRenderedPage, closeBrowser } = require('./scraper');

(async () => {
  const url = process.env.TARGET_URL || 'https://growroll.gg/';
  console.log(`Kraunu ${url} ...`);

  const { bodyText, html } = await loadRenderedPage(url);

  fs.writeFileSync('rendered-text.txt', bodyText, 'utf8');
  fs.writeFileSync('rendered.html', html, 'utf8');

  console.log('Išsaugota: rendered-text.txt ir rendered.html');
  console.log('\n--- Eilutės, kuriose paminėtas "rain" arba "lietus" ---');
  bodyText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /rain|lietus/i.test(l))
    .forEach((l) => console.log(' >', l));

  await closeBrowser();
  process.exit(0);
})();
