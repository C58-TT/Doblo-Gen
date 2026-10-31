require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, SlashCommandBuilder, AttachmentBuilder,
  AuditLogEvent, MessageFlags,
} = require('discord.js');

// ================= AYARLAR =================
const LOG_CHANNEL_ID = '1565811037498777710';
const AD_CHANNEL_ID = '1565975157003264100';
const SERVER_NAME = 'DobloGen';
const COLOR = 0xf5b301;
const LOGO = new AttachmentBuilder(path.join(__dirname, 'logo.jpg'), { name: 'logo.jpg' });

// Rol isimleri (emoji'ler yok sayılır, küçük harfle yazılır)
const ROLE = {
  owner: 'owner', admin: 'admin', mod: 'moderatör', yetkili: 'yetkili', rehber: 'rehber', deneme: 'deneme rehber',
};
const TICKET_SEE = [ROLE.owner, ROLE.admin, ROLE.mod, ROLE.yetkili, ROLE.rehber]; // Deneme Rehber YOK
const CLAIM_ROLES = [ROLE.owner, ROLE.admin, ROLE.mod, ROLE.yetkili];             // sadece yetkililer sahiplenir
const BYPASS_ROLES = [ROLE.owner, ROLE.admin, ROLE.mod, ROLE.yetkili];            // korumalardan muaf
const ADMIN_ROLES = [ROLE.owner, ROLE.admin];

const TICKET_TYPES = {
  genel: { label: 'Genel Destek', desc: 'Genel soruların ve yardım talebin için tıkla.', emoji: '📘' },
  oyun: { label: 'Oyun İçi Sorun', desc: 'Hata, bug veya kayıp eşya bildirimi için tıkla.', emoji: '⛏️' },
  sikayet: { label: 'Oyuncu Şikayeti', desc: 'Kural ihlali yapan bir oyuncuyu bildirmek için tıkla.', emoji: '🗡️' },
  magaza: { label: 'Mağaza & Satın Alım', desc: 'Ödeme, teslimat ve ürün sorunları için tıkla.', emoji: '🪙' },
  itiraz: { label: 'Ceza İtirazı', desc: 'Ban, mute veya jail itirazı için tıkla.', emoji: '🔒' },
};

// ================= AYAR DOSYASI (güvenlik) =================
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const DEFAULTS = { spam: true, link: true, caps: true, davet: true, nuke: true, bot: true, kanalsil: true, kanalolustur: true };
const SEC_LABELS = {
  spam: 'Spam Koruması', link: 'Link Engel', caps: 'Caps Lock Koruması', davet: 'Davet Engel (.gg/…)',
  nuke: 'Nuke Koruması', bot: 'Bot Ekleme Koruması', kanalsil: 'Kanal Silme Koruması', kanalolustur: 'Kanal Oluşturma Koruması',
};
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel],
});

// ================= YARDIMCILAR =================
const clean = (n) => n.replace(/[^\p{L}\s]/gu, '').trim().toLowerCase();
const hasRole = (member, keys) => !!member && (
  member.id === member.guild.ownerId || member.roles.cache.some((r) => keys.includes(clean(r.name)))
);
const isOwner = (m) => m.id === m.guild.ownerId || m.roles.cache.some((r) => clean(r.name) === ROLE.owner);
const roleByKey = (guild, key) => guild.roles.cache.find((r) => clean(r.name) === key);

async function sendLog(guild, embed) {
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID) || await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}
const logEmbed = (title, desc) => new EmbedBuilder().setColor(COLOR).setTitle(title).setDescription(desc).setTimestamp();
const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });

// ================= KOMUTLAR =================
const P = PermissionFlagsBits;
const commands = [
  new SlashCommandBuilder().setName('ticket-kur').setDescription('Ticket panelini bu kanala gönderir.').setDefaultMemberPermissions(P.Administrator),

  new SlashCommandBuilder().setName('ban').setDescription('Oyuncuyu yasaklar.').setDefaultMemberPermissions(P.BanMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
    .addStringOption((o) => o.setName('sebeb').setDescription('Sebep').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Oyuncuyu atar.').setDefaultMemberPermissions(P.KickMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
    .addStringOption((o) => o.setName('sebeb').setDescription('Sebep').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Oyuncuyu susturur.').setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
    .addStringOption((o) => o.setName('sebeb').setDescription('Sebep').setRequired(true))
    .addIntegerOption((o) => o.setName('dakika').setDescription('Süre (dakika, varsayılan 60)').setMinValue(1).setMaxValue(40320)),
  new SlashCommandBuilder().setName('mute-aç').setDescription('Susturmayı kaldırır.').setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true)),

  new SlashCommandBuilder().setName('güvenlik').setDescription('Güvenlik ayarlarını gösterir/düzenler.').setDefaultMemberPermissions(P.ManageGuild),
  new SlashCommandBuilder().setName('sunucu-eşle').setDescription('Şuanlık devre dışı.').setDefaultMemberPermissions(P.Administrator),

  new SlashCommandBuilder().setName('bilgi').setDescription('Sunucu IP ve versiyon bilgisi.'),
  new SlashCommandBuilder().setName('medya-bilgi').setDescription('Medya rolü bilgisi.'),
  new SlashCommandBuilder().setName('sponsor-bilgi').setDescription('Sponsor rolü bilgisi.'),

  new SlashCommandBuilder().setName('yaz').setDescription('Bota istediğini yazdırır.').setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('mesaj').setDescription('Mesaj').setRequired(true)),
  new SlashCommandBuilder().setName('sunucu-ekle').setDescription('Reklam kanalına sunucu reklamı gönderir.').setDefaultMemberPermissions(P.Administrator)
    .addAttachmentOption((o) => o.setName('gorsel').setDescription('Sunucu görseli').setRequired(true))
    .addStringOption((o) => o.setName('yazi').setDescription('Reklam yazısı').setRequired(true))
    .addStringOption((o) => o.setName('link').setDescription('Sunucu davet linki').setRequired(true)),
].map((c) => c.toJSON());

client.once('ready', async () => {
  console.log(`${client.user.tag} hazır.`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) await guild.commands.set(commands);
  else await client.application.commands.set(commands);
});

// ================= TICKET =================
function ticketEmbed({ user, typeKey, status, claimer }) {
  const t = TICKET_TYPES[typeKey];
  return new EmbedBuilder().setColor(0x9b59ff)
    .setTitle(`${t.emoji} ${SERVER_NAME} Destek Talebi`)
    .setDescription(
      `**Kategori:** ${t.label}\n**Açılış:** <t:${Math.floor(Date.now() / 1000)}:f>\n\n` +
      `◆ **Oyuncu Bilgileri**\n\n💎 **Talep Sahibi:** <@${user.id}>\n📘 **Discord ID:** \`${user.id}\`\n\n` +
      `✅ **Durum:** \`${status}\`${claimer ? `\n🛡️ **Sahiplenen:** <@${claimer}>` : ''}\n\n` +
      `◆ **Bilgilendirme**\n\n➤ **Not:** Sorununu detaylıca yaz, ekran görüntüsü varsa ekle. Yetkililerimiz en kısa sürede dönüş yapacak.`)
    .setImage('attachment://logo.jpg')
    .setFooter({ text: `${SERVER_NAME} Minecraft Sunucusu` });
}
const ticketButtons = (claimed, called) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('t_claim').setLabel('Sahiplen').setEmoji('🛡️').setStyle(ButtonStyle.Success).setDisabled(claimed),
  new ButtonBuilder().setCustomId('t_call').setLabel('Yetkili Çağır').setEmoji('📢').setStyle(ButtonStyle.Primary).setDisabled(called),
  new ButtonBuilder().setCustomId('t_close').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger),
);
// Kanal topic'i: ticket|ownerId|typeKey|claimerId|called
const readTopic = (ch) => {
  const [, owner, type, claimer, called] = (ch.topic || '').split('|');
  return { owner, type, claimer: claimer || '', called: called === '1' };
};
const writeTopic = (ch, o) => ch.setTopic(`ticket|${o.owner}|${o.type}|${o.claimer || ''}|${o.called ? 1 : 0}`);
const isTicket = (ch) => (ch.topic || '').startsWith('ticket|');

async function createTicket(interaction, typeKey) {
  const { guild, user } = interaction;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const existing = guild.channels.cache.find((c) => isTicket(c) && readTopic(c).owner === user.id);
  if (existing) return interaction.editReply(`Zaten açık bir talebin var: ${existing}`);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
    { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] },
  ];
  for (const key of TICKET_SEE) {
    const r = roleByKey(guild, key);
    if (r) overwrites.push({ id: r.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] });
  }
  const deneme = roleByKey(guild, ROLE.deneme);
  if (deneme) overwrites.push({ id: deneme.id, deny: [P.ViewChannel] }); // en sonda: Deneme Rehber göremez

  const name = `${typeKey}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || `ticket-${user.id}`;
  const parent = interaction.channel.parentId || null;
  const ch = await guild.channels.create({
    name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites,
    topic: `ticket|${user.id}|${typeKey}||0`,
  });
  await ch.send({
    content: `<@${user.id}>`,
    embeds: [ticketEmbed({ user, typeKey, status: 'YETKİLİ BEKLENİYOR' })],
    components: [ticketButtons(false, false)],
    files: [LOGO],
  });
  await interaction.editReply(`Talebin açıldı: ${ch}`);
  sendLog(guild, logEmbed('🎫 Ticket Açıldı', `**Kanal:** ${ch}\n**Kullanıcı:** <@${user.id}>\n**Kategori:** ${TICKET_TYPES[typeKey].label}`));
}

async function handleTicketButton(i) {
  const ch = i.channel;
  if (!isTicket(ch)) return i.reply(eph('Bu bir ticket kanalı değil.'));
  const info = readTopic(ch);

  if (i.customId === 't_claim') {
    if (!hasRole(i.member, CLAIM_ROLES)) return i.reply(eph('Sadece yetkililer talebi sahiplenebilir.'));
    if (info.claimer) return i.reply(eph(`Bu talep zaten <@${info.claimer}> tarafından sahiplenildi.`));
    info.claimer = i.user.id;
    await writeTopic(ch, info);
    const owner = await client.users.fetch(info.owner);
    await i.update({
      embeds: [ticketEmbed({ user: owner, typeKey: info.type, status: 'SAHİPLENİLDİ', claimer: i.user.id })],
      components: [ticketButtons(true, info.called)],
    });
    ch.send(`🛡️ Bu talep <@${i.user.id}> tarafından sahiplenildi.`);
    return sendLog(i.guild, logEmbed('🛡️ Ticket Sahiplenildi', `**Kanal:** ${ch}\n**Yetkili:** <@${i.user.id}>`));
  }

  if (i.customId === 't_call') {
    if (info.called) return i.reply(eph('Yetkili çağırma hakkını zaten kullandın.'));
    if (i.user.id !== info.owner && !hasRole(i.member, TICKET_SEE)) return i.reply(eph('Bunu sadece talep sahibi kullanabilir.'));
    const role = roleByKey(i.guild, ROLE.yetkili);
    if (!role) return i.reply(eph('Yetkili rolü bulunamadı.'));
    info.called = true;
    await writeTopic(ch, info);
    await i.update({ components: [ticketButtons(!!info.claimer, true)] });
    return ch.send({ content: `📢 <@&${role.id}> — <@${i.user.id}> yetkili çağırıyor!`, allowedMentions: { roles: [role.id] } });
  }

  if (i.customId === 't_close') {
    if (i.user.id !== info.owner && !hasRole(i.member, TICKET_SEE)) return i.reply(eph('Bu talebi kapatamazsın.'));
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle(SERVER_NAME)
        .setDescription(`🔒 **DURUM:** Talep 5 saniye içinde kapatılıyor\n💎 **KAPATAN:** <@${i.user.id}>`)],
    });
    sendLog(i.guild, logEmbed('🔒 Ticket Kapatıldı', `**Kanal:** #${ch.name}\n**Sahibi:** <@${info.owner}>\n**Kapatan:** <@${i.user.id}>\n**Sahiplenen:** ${info.claimer ? `<@${info.claimer}>` : 'Yok'}`));
    setTimeout(() => ch.delete().catch(() => {}), 5000);
  }
}

// ================= GÜVENLİK PANELİ =================
function securityPanel() {
  const keys = Object.keys(SEC_LABELS);
  const embed = new EmbedBuilder().setColor(COLOR).setTitle('🛡️ Güvenlik Ayarları')
    .setDescription(keys.map((k) => `${settings[k] ? '🟢' : '🔴'} **${SEC_LABELS[k]}**`).join('\n') +
      '\n\n*Sadece Owner ve Admin düzenleyebilir.*');
  const rows = [];
  for (let n = 0; n < keys.length; n += 4) {
    rows.push(new ActionRowBuilder().addComponents(keys.slice(n, n + 4).map((k) =>
      new ButtonBuilder().setCustomId(`sec_${k}`).setLabel(SEC_LABELS[k].replace(' Koruması', '')).setStyle(settings[k] ? ButtonStyle.Success : ButtonStyle.Secondary))));
  }
  return { embeds: [embed], components: rows };
}

// ================= INTERACTION =================
client.on('interactionCreate', async (i) => {
  try {
    if (i.isStringSelectMenu() && i.customId === 'ticket_select') {
      const key = i.values[0];
      if (key === 'reset') return i.update({}); // seçimi sıfırla
      return createTicket(i, key);
    }
    if (i.isButton()) {
      if (i.customId.startsWith('t_')) return handleTicketButton(i);
      if (i.customId.startsWith('sec_')) {
        if (!hasRole(i.member, ADMIN_ROLES)) return i.reply(eph('Sadece Owner ve Admin düzenleyebilir.'));
        const k = i.customId.slice(4);
        settings[k] = !settings[k];
        saveSettings();
        sendLog(i.guild, logEmbed('🛡️ Güvenlik Değişti', `**${SEC_LABELS[k]}:** ${settings[k] ? 'Açık' : 'Kapalı'}\n**Yapan:** <@${i.user.id}>`));
        return i.update(securityPanel());
      }
      return;
    }
    if (!i.isChatInputCommand()) return;
    const { commandName: cmd } = i;

    if (cmd === 'ticket-kur') {
      const embed = new EmbedBuilder().setColor(0x9b59ff).setTitle(`🎫 ${SERVER_NAME} Destek Sistemi`)
        .setDescription('**Destek merkezine hoş geldin!**\n\nAşağıdaki menüden ihtiyacın olan talep türünü seç:\n\n' +
          Object.values(TICKET_TYPES).map((t) => `${t.emoji} **${t.label}** — ${t.desc.replace(' için tıkla.', '')}`).join('\n') +
          '\n\n*Yetkililerimiz en kısa sürede dönüş yapacak!*')
        .setThumbnail('attachment://logo.jpg').setFooter({ text: `${SERVER_NAME} Minecraft Sunucusu` });
      const menu = new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('📌 Ticket açmak için kategori seçiniz.')
        .addOptions([
          ...Object.entries(TICKET_TYPES).map(([v, t]) => ({ label: t.label, description: t.desc, value: v, emoji: t.emoji })),
          { label: 'Seçimi Sıfırla', description: 'Menüdeki seçimi sıfırlamana yarar.', value: 'reset', emoji: '🔄' },
        ]);
      await i.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], files: [LOGO] });
      return i.reply(eph('Ticket paneli gönderildi.'));
    }

    if (cmd === 'ban' || cmd === 'kick' || cmd === 'mute') {
      const target = await i.guild.members.fetch(i.options.getUser('kullanici').id).catch(() => null);
      const reason = i.options.getString('sebeb');
      if (!target) return i.reply(eph('Kullanıcı sunucuda bulunamadı.'));
      if (target.id === i.user.id) return i.reply(eph('Kendine işlem yapamazsın.'));
      if (target.roles.highest.position >= i.member.roles.highest.position && i.user.id !== i.guild.ownerId)
        return i.reply(eph('Bu kullanıcının rolü seninkinden yüksek veya eşit.'));
      let ok;
      if (cmd === 'ban') { if (!target.bannable) return i.reply(eph('Bu kullanıcıyı banlayamam.')); await target.ban({ reason: `${i.user.tag}: ${reason}` }); ok = 'banlandı'; }
      if (cmd === 'kick') { if (!target.kickable) return i.reply(eph('Bu kullanıcıyı atamam.')); await target.kick(`${i.user.tag}: ${reason}`); ok = 'atıldı'; }
      if (cmd === 'mute') {
        if (!target.moderatable) return i.reply(eph('Bu kullanıcıyı susturamam.'));
        const min = i.options.getInteger('dakika') || 60;
        await target.timeout(min * 60000, `${i.user.tag}: ${reason}`); ok = `${min} dakika susturuldu`;
      }
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`✅ <@${target.id}> **${ok}**.\n**Sebep:** ${reason}`)] });
      return sendLog(i.guild, logEmbed(`🔨 /${cmd}`, `**Kullanıcı:** <@${target.id}>\n**Yetkili:** <@${i.user.id}>\n**Sebep:** ${reason}`));
    }

    if (cmd === 'mute-aç') {
      const target = await i.guild.members.fetch(i.options.getUser('kullanici').id).catch(() => null);
      if (!target || !target.moderatable) return i.reply(eph('İşlem yapılamadı.'));
      await target.timeout(null);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`🔊 <@${target.id}> susturması kaldırıldı.`)] });
      return sendLog(i.guild, logEmbed('🔊 /mute-aç', `**Kullanıcı:** <@${target.id}>\n**Yetkili:** <@${i.user.id}>`));
    }

    if (cmd === 'güvenlik') return i.reply({ ...securityPanel(), flags: MessageFlags.Ephemeral });
    if (cmd === 'sunucu-eşle') return i.reply(eph('🚧 Bu komut şuanlık devre dışı.'));

    if (cmd === 'bilgi') {
      return i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`⛏️ ${SERVER_NAME} Sunucu Bilgisi`)
        .addFields({ name: '🌐 IP Adresi', value: 'Yakında', inline: true }, { name: '📦 Versiyon', value: 'Yakında', inline: true })] });
    }
    if (cmd === 'medya-bilgi') {
      return i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎥 Medya Bilgisi')
        .setDescription(`${SERVER_NAME} için içerik üretmek mi istiyorsun? Medya rolü başvuru şartları yakında burada olacak. Başvuru için ticket açabilirsin.`)] });
    }
    if (cmd === 'sponsor-bilgi') {
      return i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🤝 Sponsor Bilgisi')
        .setDescription(`${SERVER_NAME} sponsorluk detayları yakında burada olacak. Bilgi için ticket açabilirsin.`)] });
    }

    if (cmd === 'yaz') {
      if (!hasRole(i.member, ADMIN_ROLES)) return i.reply(eph('Sadece Owner ve Admin kullanabilir.'));
      await i.channel.send({ content: i.options.getString('mesaj'), allowedMentions: { parse: [] } });
      return i.reply(eph('Gönderildi.'));
    }

    if (cmd === 'sunucu-ekle') {
      if (!hasRole(i.member, ADMIN_ROLES)) return i.reply(eph('Sadece Owner ve Admin kullanabilir.'));
      const link = i.options.getString('link');
      if (!/^https?:\/\//i.test(link)) return i.reply(eph('Link http:// veya https:// ile başlamalı.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = await i.guild.channels.fetch(AD_CHANNEL_ID).catch(() => null);
      if (!ch) return i.editReply('Reklam kanalı bulunamadı.');
      const att = i.options.getAttachment('gorsel');
      const file = new AttachmentBuilder(att.url, { name: 'reklam.png' });
      await ch.send({
        embeds: [new EmbedBuilder().setColor(COLOR).setDescription(i.options.getString('yazi')).setImage('attachment://reklam.png')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Sunucuya Katıl').setEmoji('🚀').setStyle(ButtonStyle.Link).setURL(link))],
        files: [file],
      });
      await i.editReply('Reklam gönderildi.');
      return sendLog(i.guild, logEmbed('📣 Reklam Eklendi', `**Yapan:** <@${i.user.id}>\n**Link:** ${link}`));
    }
  } catch (e) {
    console.error(e);
    const msg = eph('Bir hata oluştu.');
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {}); else i.reply(msg).catch(() => {});
  }
});

// ================= MESAJ KORUMALARI + .nuke =================
const spamMap = new Map();
client.on('messageCreate', async (m) => {
  if (!m.guild || m.author.bot || !m.member) return;

  // .nuke — sadece Owner
  if (m.content.trim().toLowerCase() === '.nuke') {
    if (!isOwner(m.member)) {
      if (settings.nuke) { m.delete().catch(() => {}); sendLog(m.guild, logEmbed('💥 Nuke Denemesi', `<@${m.author.id}> .nuke kullanmayı denedi. (${m.channel})`)); }
      return;
    }
    const ch = m.channel, pos = ch.position;
    const clone = await ch.clone().catch(() => null);
    if (!clone) return m.reply('Kanal temizlenemedi.');
    await ch.delete().catch(() => {});
    await clone.setPosition(pos).catch(() => {});
    await clone.send('💥 Kanal Owner tarafından temizlendi.');
    return sendLog(m.guild, logEmbed('💥 Kanal Nuke', `**Kanal:** ${clone}\n**Owner:** <@${m.author.id}>`));
  }

  if (hasRole(m.member, BYPASS_ROLES) || m.member.permissions.has(P.Administrator)) return;
  const punish = async (why) => {
    await m.delete().catch(() => {});
    const w = await m.channel.send(`⚠️ <@${m.author.id}>, ${why}`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
  };

  if (settings.davet && /(discord\.gg|discord(app)?\.com\/invite|\.gg\/)/i.test(m.content)) {
    await punish('davet linki paylaşmak yasak.');
    return sendLog(m.guild, logEmbed('🔗 Davet Engellendi', `<@${m.author.id}> • ${m.channel}\n${m.content.slice(0, 300)}`));
  }
  if (settings.link && /(https?:\/\/|www\.)\S+/i.test(m.content)) {
    await punish('link paylaşmak yasak.');
    return sendLog(m.guild, logEmbed('🔗 Link Engellendi', `<@${m.author.id}> • ${m.channel}`));
  }
  if (settings.caps) {
    const letters = m.content.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 10 && (letters.replace(/[^\p{Lu}]/gu, '').length / letters.length) > 0.7) return punish('lütfen CAPS LOCK kullanma.');
  }
  if (settings.spam) {
    const now = Date.now();
    const arr = (spamMap.get(m.author.id) || []).filter((t) => now - t < 5000);
    arr.push(now);
    spamMap.set(m.author.id, arr);
    if (arr.length >= 6) {
      spamMap.delete(m.author.id);
      await m.member.timeout(5 * 60000, 'Spam').catch(() => {});
      await punish('spam yaptığın için 5 dakika susturuldun.');
      sendLog(m.guild, logEmbed('🚫 Spam', `<@${m.author.id}> 5 dk susturuldu. (${m.channel})`));
    }
  }
});

// ================= KORUMALAR (denetim kaydı) =================
async function executorOf(guild, type, targetId) {
  await new Promise((r) => setTimeout(r, 1000));
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  const e = logs?.entries.find((x) => (!targetId || x.targetId === targetId) && Date.now() - x.createdTimestamp < 10000);
  return e?.executorId ? guild.members.fetch(e.executorId).catch(() => null) : null;
}
const trusted = (member) => !member || member.id === client.user.id || isOwner(member);

client.on('guildMemberAdd', async (member) => {
  if (!settings.bot || !member.user.bot || member.id === client.user.id) return;
  const exec = await executorOf(member.guild, AuditLogEvent.BotAdd, member.id);
  if (exec && isOwner(exec)) return;
  await member.kick('Bot ekleme koruması').catch(() => {});
  if (exec && exec.id !== client.user.id && exec.kickable) await exec.kick('İzinsiz bot ekledi').catch(() => {});
  sendLog(member.guild, logEmbed('🤖 Bot Ekleme Engellendi', `**Bot:** ${member.user.tag}\n**Ekleyen:** ${exec ? `<@${exec.id}>` : 'Bilinmiyor'}`));
});

client.on('channelDelete', async (channel) => {
  if (!settings.kanalsil || !channel.guild || isTicket(channel)) return;
  const exec = await executorOf(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!exec || trusted(exec)) return;
  await channel.clone().catch(() => {});
  if (exec.kickable) await exec.kick('Kanal silme koruması').catch(() => {});
  sendLog(channel.guild, logEmbed('🗑️ Kanal Silme Engellendi', `**Kanal:** #${channel.name}\n**Silen:** <@${exec.id}> (atıldı, kanal geri oluşturuldu)`));
});

client.on('channelCreate', async (channel) => {
  if (!settings.kanalolustur || !channel.guild) return;
  const exec = await executorOf(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  if (!exec || trusted(exec)) return;
  await channel.delete('Kanal oluşturma koruması').catch(() => {});
  if (exec.kickable) await exec.kick('Kanal oluşturma koruması').catch(() => {});
  sendLog(channel.guild, logEmbed('➕ Kanal Oluşturma Engellendi', `**Kanal:** #${channel.name}\n**Oluşturan:** <@${exec.id}> (atıldı)`));
});

client.login(process.env.TOKEN);
