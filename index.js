// DISCORD BOT ULTRA+ – LIVE PANEL + STATUSY + ACCEPT/DECLINE + ROLE ID

const { 
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes, SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const LEADER_ROLE_ID = '1486319448938774593';
const DB_FILE = './tasks.json';
const PANEL_FILE = './panel.json';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ===== DB =====
function loadTasks() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveTasks(tasks) {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
}

function savePanel(data) {
  fs.writeFileSync(PANEL_FILE, JSON.stringify(data));
}
function loadPanel() {
  if (!fs.existsSync(PANEL_FILE)) return null;
  return JSON.parse(fs.readFileSync(PANEL_FILE));
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('reset_week').setDescription('Reset tygodnia (admin)'),
  new SlashCommandBuilder().setName('addtask').setDescription('Dodaj task'),
  new SlashCommandBuilder().setName('panel').setDescription('Utwórz panel'),
  new SlashCommandBuilder()
    .setName('accept')
    .setDescription('Akceptuj task')
    .addStringOption(o=>o.setName('id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('decline')
    .setDescription('Odrzuć task')
    .addStringOption(o=>o.setName('id').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
})();

client.on('ready', () => console.log('✅ Bot działa'));

// ===== PANEL UPDATE =====
async function updatePanel(client) {
  const panel = loadPanel();
  if (!panel) return;

  const channel = await client.channels.fetch(panel.channelId);
  const message = await channel.messages.fetch(panel.messageId);

  const tasks = loadTasks();

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const percent = total ? ((done / total)*100).toFixed(1) : 0;

  const list = tasks.map(t => {
    let icon = '❌';
    if (t.status === 'progress') icon = '⏳';
    if (t.status === 'done') icon = '✅';
    return `${icon} ${t.id} | ${t.name}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📊 Papas Family – Live Panel')
    .setDescription(`Progress: **${percent}%**`)
    .addFields({ name: '📋 Zadania', value: list || 'Brak' })
    .setColor(0x00ffcc)
    .setTimestamp();

  message.edit({ embeds: [embed] });
}

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {

    // ADD TASK MODAL
    if (interaction.commandName === 'addtask') {
      const modal = new ModalBuilder()
        .setCustomId('addTask')
        .setTitle('Nowe zadanie');

      const id = new TextInputBuilder().setCustomId('id').setLabel('ID').setStyle(TextInputStyle.Short);
      const name = new TextInputBuilder().setCustomId('name').setLabel('Nazwa').setStyle(TextInputStyle.Short);
      const reward = new TextInputBuilder().setCustomId('reward').setLabel('Premia').setStyle(TextInputStyle.Short);
      const desc = new TextInputBuilder().setCustomId('desc').setLabel('Opis').setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(id),
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(reward),
        new ActionRowBuilder().addComponents(desc)
      );

      return interaction.showModal(modal);
    }

    // CREATE PANEL
    // RESET WEEK
    if (interaction.commandName === 'reset_week') {
      if (!interaction.member.roles.cache.has(LEADER_ROLE_ID)) {
        return interaction.reply({ content: '❌ Brak roli', ephemeral: true });
      }

      saveTasks([]);
      updatePanel(client);

      return interaction.reply('🔄 Tydzień został zresetowany ręcznie');
    }

    if (interaction.commandName === 'panel') {
      const embed = new EmbedBuilder().setTitle('📊 Panel startowy');
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

      savePanel({ channelId: msg.channel.id, messageId: msg.id });
      updatePanel(client);
    }

    // ACCEPT
    if (interaction.commandName === 'accept') {
      if (!interaction.member.roles.cache.has(LEADER_ROLE_ID)) {
        return interaction.reply({ content: '❌ Brak roli', ephemeral: true });
      }

      const id = interaction.options.getString('id');
      let tasks = loadTasks();
      const task = tasks.find(t => t.id == id);
      if (!task) return interaction.reply('❌ Nie ma taska');

      task.status = 'done';
      saveTasks(tasks);

      updatePanel(client);

      return interaction.reply(`✅ Zadanie ukończone!\nGratulacje, udało wam się ukończyć to zadanie.\nWasza Premia zwiększyła się o $${task.reward}!\n📌 ${task.name}\n👤 ${interaction.user.tag}`);
    }

    // DECLINE
    if (interaction.commandName === 'decline') {
      const modal = new ModalBuilder()
        .setCustomId(`decline_${interaction.options.getString('id')}`)
        .setTitle('Powód odrzucenia');

      const reason = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Dlaczego odrzucono?')
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return interaction.showModal(modal);
    }
  }

  // MODAL SUBMIT
  if (interaction.isModalSubmit()) {

    // ADD TASK SAVE
    if (interaction.customId === 'addTask') {
      const tasks = loadTasks();

      tasks.push({
        id: interaction.fields.getTextInputValue('id'),
        name: interaction.fields.getTextInputValue('name'),
        reward: parseInt(interaction.fields.getTextInputValue('reward')),
        desc: interaction.fields.getTextInputValue('desc'),
        status: 'not'
      });

      saveTasks(tasks);
      updatePanel(client);

      return interaction.reply('✅ Dodano task');
    }

    // DECLINE SAVE
    if (interaction.customId.startsWith('decline_')) {
      const id = interaction.customId.split('_')[1];
      const reason = interaction.fields.getTextInputValue('reason');

      let tasks = loadTasks();
      const task = tasks.find(t => t.id == id);

      if (task) task.status = 'not';
      saveTasks(tasks);
      updatePanel(client);

      return interaction.reply(`❌ Zadanie odrzucone!\n📌 ${task.name}\n📝 Powód: ${reason}`);
    }
  }
});

client.login(TOKEN);
