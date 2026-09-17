const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ChannelType, PermissionFlagsBits, SlashCommandBuilder, REST, Routes
} = require('discord.js');

// ========== TOKENAS (saugus: ima iš env ARBA token.txt) ==========
let token = process.env.TOKEN || '';
if (!token) {
  try { token = fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim(); } catch (e) {}
}
if (!token) {
  console.log('❌ Nėra tokeno: įdėk token.txt failą šalia index.js ARBA nustatyk TOKEN env (Render).');
  process.exit(1);
}

// ========== KONFIGŪRACIJA ==========
const config = {
  ownerId: '',
  adminRoleId: null,
  ticketCategoryId: null,
  brand: 'Ticket',
  swedbank: { name: 'Tavo Vardas', account: 'LT00 0000 0000 0000 0000' },
  paypal: 'https://paypal.me/TAVO_PAYPAL'
};

// ========== DB ==========
const DB_FILE = path.join(__dirname, 'tickets.json');
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : { tickets: {} };
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const isAdmin = (i) =>
  i.user.id === config.ownerId ||
  (config.adminRoleId && i.member?.roles?.cache.has(config.adminRoleId)) ||
  i.member?.permissions?.has(PermissionFlagsBits.Administrator);

const SPALVOS = {
  'Raudona': '#ed4245', 'Zalia': '#57f287', 'Melyna': '#5865f2', 'Geltona': '#fee75c',
  'Oranzine': '#f26522', 'Violetine': '#9b59b6', 'Rozine': '#eb459e', 'Balta': '#ffffff', 'Juoda': '#000000'
};

const PANEL_BUTTONS = [
  { id: 'atidaryti', emoji: '🎟️', label: 'Atidaryti' },
  { id: 'klausti',   emoji: '❓', label: 'Klausti' },
  { id: 'pagalba',   emoji: '🆘', label: 'Pagalba' },
];

const QUICK = {
  sveikinimas: { color: '#57f287', title: '👋 Pasisveikinimas', text: 'Sveiki! Ačiū, kad kreipėtės į **' + config.brand + '** pagalbą. Kuo galime padėti?' },
  refund:      { color: '#57f287', title: '💸 Refund', text: 'Refund patvirtintas — pinigai bus grąžinti per kelias darbo dienas.' },
  refund_ne:   { color: '#ed4245', title: '🚫 Refund negalimas', text: 'Atsiprašome, pagal taisykles pinigai negali būti grąžinti.' },
  preke:       { color: '#5865f2', title: '📦 Prekės siuntimas', text: 'Jūsų prekė paruošta — informaciją rasite žemiau.' },
  swedbank:    { color: '#f26522', title: '🏦 Swedbank sąskaita', text: 'Perveskite pinigus į šią sąskaitą ir prisegkite pavedimo paveikslėlį:', code: true },
  paypal:      { color: '#5865f2', title: '🅿️ PayPal', text: 'Apmokėkite per PayPal:', link: true },
  staff:       { color: '#fee75c', title: '⏰ Staff atsakys', text: 'Staff kuo greičiau bandys atsakyti į jūsų ticket. Prašome palaukti ir netaginti.' },
};

function panelEmbed() {
  return new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle('🎟️ ' + config.brand)
    .setDescription('Paspausk mygtuką pagal poreikį:\n\n🎟️ **Atidaryti** — atidaryti ticket\n❓ **Klausti** — turiu klausimą\n🆘 **Pagalba** — man reikia pagalbos\n\n> Ticket kanalas bus **privatus** — matysi tik tu ir staff.');
}
function panelRow() {
  return [new ActionRowBuilder().addComponents(
    PANEL_BUTTONS.map(b => new ButtonBuilder().setCustomId('t_open:' + b.id).setLabel(b.label).setEmoji(b.emoji).setStyle(ButtonStyle.Primary))
  )];
}

function ticketRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('t_claim').setLabel('Claim').setEmoji('🧑‍💼').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('t_send').setLabel('Siųsti prekę').setEmoji('📦').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('t_close').setLabel('Uždaryti').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('t_quick').setPlaceholder('📩 Greitos žinutės (tik staff)').addOptions(
        { label: 'Refund negalimas', value: 'refund_ne', emoji: '🚫' },
        { label: 'Refund', value: 'refund', emoji: '💸' },
        { label: 'Pasisveikinimas', value: 'sveikinimas', emoji: '👋' },
        { label: 'Prekės siuntimas', value: 'preke', emoji: '📦' },
        { label: 'Swedbank sąskaita', value: 'swedbank', emoji: '🏦' },
        { label: 'PayPal', value: 'paypal', emoji: '🅿️' },
        { label: 'Staff atsakys kuo greičiau', value: 'staff', emoji: '⏰' }
      )
    )
  ];
}

async function createTicket(i, catLabel, catEmoji) {
  const existing = Object.entries(db.tickets).find(([ch, t]) => t.userId === i.user.id && t.status === 'open');
  if (existing) return i.editReply({ content: '❌ Jau turi atidarytą ticket: <#' + existing[0] + '>' });

  const channel = await i.guild.channels.create({
    name: 'tk-' + i.user.username.toLowerCase().replace(/[^a-z0-9]/g, ''),
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId || undefined,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] },
      ...(config.adminRoleId ? [{ id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] }] : [])
    ]
  });

  db.tickets[channel.id] = { userId: i.user.id, category: catLabel, status: 'open', claimedBy: null };
  saveDB();

  const embed = new EmbedBuilder()
    .setColor('#57f287')
    .setTitle(catEmoji + ' ' + config.brand + ' — ' + catLabel)
    .setDescription('Sveikas, <@' + i.user.id + '>!\n\nTavo ticket atidarytas. Staff kuo greičiau atsakys.\n> ❌ Ticket uždaryti gali **tik staff**.')
    .setFooter({ text: config.brand + ' • Support' })
    .setTimestamp();

  await channel.send({ content: '<@' + i.user.id + '>', embeds: [embed], components: ticketRow() });
  return i.editReply({ content: '✅ Ticket atidarytas: <#' + channel.id + '>' });
}

async function sendProduct(channel, data, image) {
  const t = db.tickets[channel.id];
  const embed = new EmbedBuilder()
    .setColor('#57f287')
    .setTitle('📦 Tavo prekė')
    .setDescription('```\n' + data.info + '\n```' + (data.note ? '\n' + data.note : ''))
    .setFooter({ text: config.brand + ' • Support' })
    .setTimestamp();
  if (image) embed.setImage(image);
  await channel.send({ content: t ? '<@' + t.userId + '>' : undefined, embeds: [embed] });
}

client.once('ready', async () => {
  console.log('✅ Prisijungta kaip ' + client.user.tag);
  const commands = [
    new SlashCommandBuilder().setName('text').setDescription('📝 Siųsti žinutę per botą (tik admin)')
      .addStringOption(o => o.setName('tekstas').setDescription('Žinutės tekstas').setRequired(true))
      .addAttachmentOption(o => o.setName('foto').setDescription('Paveikslėlis').setRequired(false))
      .addStringOption(o => o.setName('spalva').setDescription('Žinutės spalva').setRequired(true)
        .addChoices(...Object.keys(SPALVOS).map(k => ({ name: k, value: k })))),
    new SlashCommandBuilder().setName('panel').setDescription('🎟️ Išsiųsti ticket panelę (tik admin)')
  ].map(c => c.toJSON());
  await new REST({ version: '10' }).setToken(token).put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Komandos užregistruotos');
});

client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (!isAdmin(i)) return i.reply({ content: '❌ Tik admin!', ephemeral: true });
      if (i.commandName === 'text') {
        const tekstas = i.options.getString('tekstas');
        const foto = i.options.getAttachment('foto');
        const spalva = SPALVOS[i.options.getString('spalva')] || '#5865f2';
        const embed = new EmbedBuilder().setColor(spalva).setDescription(tekstas);
        if (foto) embed.setImage(foto.url);
        return i.reply({ embeds: [embed] });
      }
      if (i.commandName === 'panel') return i.reply({ embeds: [panelEmbed()], components: panelRow() });
    }

    if (i.isButton()) {
      if (i.customId.startsWith('t_open:')) {
        await i.deferReply({ ephemeral: true });
        const b = PANEL_BUTTONS.find(x => i.customId === 't_open:' + x.id);
        return createTicket(i, b.label, b.emoji);
      }
      const t = db.tickets[i.channelId];
      if (!t) return i.reply({ content: '❌ Čia ne ticket.', ephemeral: true });
      if (i.customId === 't_close') {
        if (!isAdmin(i)) return i.reply({ content: '❌ Tik staff gali uždaryti ticket!', ephemeral: true });
        t.status = 'closed'; saveDB();
        await i.channel.permissionOverwrites.edit(t.userId, { ViewChannel: false });
        await i.reply({ content: '🔒 Ticket uždarytas. Kanalas ištrinamas po 10 s.' });
        setTimeout(() => i.channel.delete().catch(() => {}), 10000);
        return;
      }
      if (!isAdmin(i)) return i.reply({ content: '❌ Tik staff!', ephemeral: true });
      if (i.customId === 't_claim') {
        t.claimedBy = i.user.id; saveDB();
        return i.reply({ content: '🧑‍ <@' + i.user.id + '> pasiėmė ticket.' });
      }
      if (i.customId === 't_send') {
        const modal = new ModalBuilder().setCustomId('m_product').setTitle('📦 Siųsti prekę');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Pagrindinis tekstas (kopijuojamas)').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Papildoma žinutė (nebūtina)').setStyle(TextInputStyle.Paragraph).setRequired(false))
        );
        return i.showModal(modal);
      }
    }

    if (i.isStringSelectMenu() && i.customId === 't_quick') {
      if (!isAdmin(i)) return i.reply({ content: '❌ Tik staff!', ephemeral: true });
      const q = QUICK[i.values[0]];
      let desc = q.text;
      if (q.code) desc += '\n```\n' + config.swedbank.account + '\n```\nGavėjas: ' + config.swedbank.name;
      if (q.link) desc += '\n' + config.paypal;
      return i.reply({ embeds: [new EmbedBuilder().setColor(q.color).setTitle(q.title).setDescription(desc)] });
    }

    if (i.isModalSubmit() && i.customId === 'm_product') {
      const data = { info: i.fields.getTextInputValue('info'), note: i.fields.getTextInputValue('note'), adminId: i.user.id };
      await i.reply({ content: '📸 Per **60 sek.** prisegk paveikslėlį šiame kanale arba parašyk `praleisti`.' });
      const channel = i.channel;
      channel.awaitMessages({ filter: m => m.author.id === data.adminId, max: 1, time: 60000 })
        .then(col => {
          const m = col.first();
          let image = null;
          if (m) { if (m.attachments.size) image = m.attachments.first().url; m.delete().catch(() => {}); }
          return sendProduct(channel, data, image);
        })
        .catch(() => sendProduct(channel, data, null));
    }
  } catch (e) {
    console.error(e);
    const msg = { content: '❌ Klaida: ' + e.message, ephemeral: true };
    if (i.deferred || i.replied) i.editReply(msg).catch(() => {}); else i.reply(msg).catch(() => {});
  }
});

client.login(token);
