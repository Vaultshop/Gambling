require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { findNextRain, findTopGame, closeBrowser } = require('./scraper');

const {
  DISCORD_TOKEN,
  CHANNEL_ID,
  TARGET_URL = 'https://growroll.gg/',
  WARN_SECONDS_BEFORE = '60',
  POLL_INTERVAL_MS = '15000',
} = process.env;

if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error('Trūksta DISCORD_TOKEN arba CHANNEL_ID faile .env — sukurkite jį pagal .env.example');
  process.exit(1);
}

const warnSeconds = parseInt(WARN_SECONDS_BEFORE, 10);
const pollMs = parseInt(POLL_INTERVAL_MS, 10);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Prevents sending the same warning / start message multiple times
// while the countdown is still inside the warning window.
let lastWarnedForSecond = null; // rounded target we've already warned about
let lastSeenRaw = null;

async function checkRain() {
  try {
    const result = await findNextRain(TARGET_URL);

    if (!result || result.secondsRemaining == null) {
      console.log('[rain] Nieko nerasta šį kartą (tikrinama toliau)...');
      return;
    }

    const { raw, secondsRemaining } = result;
    console.log(`[rain] Rasta: "${raw}" -> liko ${secondsRemaining}s`);

    // Fire the warning once per detected countdown target.
    if (secondsRemaining <= warnSeconds && lastWarnedForSecond !== raw) {
      lastWarnedForSecond = raw;

      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle('🌧️ Rain prasideda greitai!')
          .setDescription(
            `Liko maždaug **${secondsRemaining} sek.** iki kito rain įvykio GrowRoll svetainėje.`
          )
          .setURL(TARGET_URL)
          .setColor(0x3ba7ff)
          .setTimestamp(new Date());
        await channel.send({ embeds: [embed] });
      }
    }

    // Reset the "already warned" lock once a new countdown line appears
    // (i.e. the site moved on to a different/next rain).
    if (raw !== lastSeenRaw) {
      lastSeenRaw = raw;
      if (secondsRemaining > warnSeconds) {
        lastWarnedForSecond = null;
      }
    }
  } catch (err) {
    console.error('[rain] Klaida tikrinant puslapį:', err.message);
  }
}

client.once('ready', () => {
  console.log(`Prisijungta kaip ${client.user.tag}`);
  checkRain(); // patikrinam iškart paleidus
  setInterval(checkRain, pollMs);
});

// Simple text command: !topgame -> current highest-multiplier live bet
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() !== '!topgame') return;

  const thinking = await message.reply('Ieškau aktualiausio žaidimo su didžiausiais laimėjimais...');

  try {
    const top = await findTopGame(TARGET_URL);
    if (!top) {
      await thinking.edit('Šiuo metu nepavyko rasti gyvų statymų duomenų (galbūt reikia pritaikyti TOP_GAME_ROW_SELECTOR .env faile).');
      return;
    }
    await thinking.edit(`🎰 Šiuo metu aktualiausias: **${top.raw}** (multiplier ~${top.multiplier}x)`);
  } catch (err) {
    console.error(err);
    await thinking.edit('Įvyko klaida bandant gauti duomenis.');
  }
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
