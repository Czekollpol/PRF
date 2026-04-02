const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, REST, Routes, SlashCommandBuilder, ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const LEADER_ROLE_ID = '1486319448938774593';

const DB_FILE = './tasks.json';
const PANEL_FILE = './panel.json';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

/* ===== DB ===== */
function loadTasks() { if(!fs.existsSync(DB_FILE)) return []; return JSON.parse(fs.readFileSync(DB_FILE)); }
function saveTasks(tasks){ fs.writeFileSync(DB_FILE, JSON.stringify(tasks,null,2)); }
function savePanel(data){ fs.writeFileSync(PANEL_FILE, JSON.stringify(data)); }
function loadPanel(){ if(!fs.existsSync(PANEL_FILE)) return null; return JSON.parse(fs.readFileSync(PANEL_FILE)); }

/* ===== COMMANDS ===== */
const commands = [
  new SlashCommandBuilder().setName('addtask').setDescription('Dodaj nowe zadanie'),
  new SlashCommandBuilder().setName('panel').setDescription('Utwórz panel'),
  new SlashCommandBuilder().setName('accept').setDescription('Akceptuj task')
    .addStringOption(o=>o.setName('id').setDescription('ID taska').setRequired(true)),
  new SlashCommandBuilder().setName('decline').setDescription('Odrzuć task')
    .addStringOption(o=>o.setName('id').setDescription('ID taska').setRequired(true)),
  new SlashCommandBuilder().setName('reset_week').setDescription('Reset tygodnia')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async()=>{ await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands}); })();

/* ===== READY ===== */
client.on('ready',()=>console.log(`✅ Bot działa jako ${client.user.tag}`));

/* ===== PANEL ===== */
async function updatePanel() {
  const panel = loadPanel();
  if(!panel) return;
  const channel = await client.channels.fetch(panel.channelId);
  const message = await channel.messages.fetch(panel.messageId);

  const tasks = loadTasks();
  const total = tasks.length;
  const done = tasks.filter(t=>t.status==='done').length;
  const percent = total?((done/total)*100).toFixed(1):0;

  const list = tasks.map(t=>{
    let icon='❌'; if(t.status==='progress') icon='⏳'; if(t.status==='done') icon='✅';
    return `${icon} ${t.id} | ${t.name}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📊 Week Tasks')
    .setDescription(`Postęp: **${percent}%**`)
    .addFields({name:'📋 Zadania',value:list||'Brak'})
    .setColor(0x00ffcc)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('status_not').setLabel('❌ Nie rozpoczęte').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('status_progress').setLabel('⏳ W trakcie').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('status_done').setLabel('✅ Wykonane').setStyle(ButtonStyle.Success)
  );

  message.edit({embeds:[embed],components:[row]});
}

/* ===== INTERACTIONS ===== */
client.on('interactionCreate', async interaction=>{
  if(interaction.isChatInputCommand()){

    /* ADD TASK MODAL */
    if(interaction.commandName==='addtask'){
      const modal = new ModalBuilder().setCustomId('addTask').setTitle('Dodaj zadanie');
      const id=new TextInputBuilder().setCustomId('id').setLabel('ID zadania').setStyle(TextInputStyle.Short);
      const name=new TextInputBuilder().setCustomId('name').setLabel('Nazwa').setStyle(TextInputStyle.Short);
      const reward=new TextInputBuilder().setCustomId('reward').setLabel('Premia').setStyle(TextInputStyle.Short);
      const desc=new TextInputBuilder().setCustomId('desc').setLabel('Opis').setStyle(TextInputStyle.Paragraph);
      modal.addComponents(
        new ActionRowBuilder().addComponents(id),
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(reward),
        new ActionRowBuilder().addComponents(desc)
      );
      return interaction.showModal(modal);
    }

    /* CREATE PANEL */
    if(interaction.commandName==='panel'){
      const embed = new EmbedBuilder().setTitle('📊 Week Tasks');
      const msg = await interaction.reply({embeds:[embed],fetchReply:true});
      savePanel({channelId:msg.channel.id,messageId:msg.id});
      updatePanel();
    }

    /* ACCEPT TASK */
    if(interaction.commandName==='accept'){
      if(!interaction.member.roles.cache.has(LEADER_ROLE_ID)) 
        return interaction.reply({content:'❌ Brak roli',ephemeral:true});
      const id = interaction.options.getString('id');
      const tasks = loadTasks();
      const task = tasks.find(t=>t.id==id);
      if(!task) return interaction.reply('❌ Nie ma taska');
      task.status='done';
      saveTasks(tasks);
      updatePanel();
      const embed = new EmbedBuilder()
        .setTitle('✅ Zadanie ukończone!')
        .addFields(
          {name:'📌 Nazwa',value:task.name},
          {name:'💵 Premia',value:`$${task.reward}`},
          {name:'👤 Akceptował',value:interaction.user.tag}
        )
        .setColor(0x00ff00)
        .setTimestamp();
      return interaction.reply({embeds:[embed]});
    }

    /* DECLINE TASK */
    if(interaction.commandName==='decline'){
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

    /* RESET WEEK */
    if(interaction.commandName==='reset_week'){
      if(!interaction.member.roles.cache.has(LEADER_ROLE_ID)) 
        return interaction.reply({content:'❌ Brak roli',ephemeral:true});
      saveTasks([]);
      updatePanel();
      return interaction.reply('🔄 Tydzień został zresetowany');
    }

  } // END slash

  /* MODAL SUBMIT */
  if(interaction.isModalSubmit()){
    if(interaction.customId==='addTask'){
      const tasks = loadTasks();
      const newTask = {
        id: interaction.fields.getTextInputValue('id'),
        name: interaction.fields.getTextInputValue('name'),
        reward: parseInt(interaction.fields.getTextInputValue('reward')),
        desc: interaction.fields.getTextInputValue('desc'),
        status: 'not'
      };
      tasks.push(newTask);
      saveTasks(tasks);
      updatePanel();

      const channel = interaction.channel;
      const thread = await channel.threads.create({
        name:`Task-${newTask.id} | ${newTask.name}`,
        autoArchiveDuration: 60,
        reason:'Nowe zadanie'
      });

      const embed = new EmbedBuilder()
        .setTitle(`📌 Task #${newTask.id}`)
        .addFields(
          {name:'Nazwa',value:newTask.name},
          {name:'Bonus',value:`$${newTask.reward}`},
          {name:'Opis',value:newTask.desc}
        )
        .setColor(0x00ffff)
        .setTimestamp();

      thread.send({embeds:[embed]});
      return interaction.reply({content:'✅ Dodano zadanie i utworzono wątek',ephemeral:true});
    }

    if(interaction.customId.startsWith('decline_')){
      const id = interaction.customId.split('_')[1];
      const reason = interaction.fields.getTextInputValue('reason');
      const tasks = loadTasks();
      const task = tasks.find(t=>t.id==id);
      if(task) task.status='not';
      saveTasks(tasks);
      updatePanel();
      const embed = new EmbedBuilder()
        .setTitle('❌ Zadanie odrzucone!')
        .addFields(
          {name:'📌 Nazwa',value:task?.name||'Nieznane'},
          {name:'📝 Powód',value:reason}
        )
        .setColor(0xff0000)
        .setTimestamp();
      return interaction.reply({embeds:[embed]});
    }
  }

  /* BUTTONS STATUS */
  if(interaction.isButton()){
    if(!interaction.member.roles.cache.has(LEADER_ROLE_ID)) 
      return interaction.reply({content:'❌ Tylko lider może zmieniać status',ephemeral:true});
    const tasks = loadTasks();
    const statusMap = {'status_not':'not','status_progress':'progress','status_done':'done'};
    const taskStatus = statusMap[interaction.customId];
    if(tasks.length>0){
      tasks[tasks.length-1].status = taskStatus;
      saveTasks(tasks);
      updatePanel();
      return interaction.reply({content:`Status zmieniony na ${interaction.customId}`,ephemeral:true});
    }
  }

});

/* ===== LOGIN & KEEPALIVE RAILWAY ===== */
client.login(TOKEN);
setInterval(()=>{},1000*60*5);
  }
});

client.login(TOKEN);
