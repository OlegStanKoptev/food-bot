const { Telegraf } = require('telegraf');
const Splitwise = require('splitwise');
const config = require("./configuration.json");
const splitwise_users = require('./splitwise_users.json');

const bot = new Telegraf(process.env.BOT_TOKEN);
const sw = Splitwise({
  consumerKey: process.env.CONSUMER_KEY,
  consumerSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN
})

bot.start((ctx) => ctx.reply('Привет! Теперь я буду иногда отправлять опросники, чтобы ты не забывал покушать (а то вы программисты такие, я знаю)'));
bot.help((ctx) => ctx.reply('Можешь попросить меня отправить опросник хочет ли кто-нибудь сегодня обедать командой /lunch, а также узнать кто что хочет заказать командой /order'));
bot.command('lunch', async (ctx) => await sendLunchPoll(ctx.chat.id));
bot.command('sergey', async (ctx) => await sendSergeyTag(ctx.chat.id));
bot.command('order', async (ctx) => await sendOrderPoll(ctx.chat.id));
bot.command('late_order', async (ctx) => await sendLateOrderPoll(ctx.chat.id));
bot.command('sirki', async (ctx) => await sendSirki(ctx.chat.id));
bot.command('eta', async (ctx) => await sendRawEta(ctx.chat.id, ctx.update.message.text));

module.exports.handler = async function (event) {
  const context = !!event.body ? JSON.parse(event.body) : event;
  const customCommand = context.details?.payload;
  if (!customCommand) {
    await bot.handleUpdate(context);
  } else {
    const etaKeyword = "eta: "
    const rawKeyword = "raw: "
    const chatId = config.use_test_chat ? config.test_chat : config.main_chat;
    if (customCommand == 'lunch') {
      const poll = await sendLunchPoll(chatId);
      await pinMessageSilently(chatId, poll.message_id);
    } else if (customCommand == 'order') {
      await sendOrderPoll(chatId);
    } else if (customCommand == 'late_order') {
      await sendLateOrderPoll(chatId);
    } else if (customCommand == 'sirki') {
      await sendSirki(chatId);
    } else if (customCommand == 'sergey') {
      await sendSergeyTag(chatId);
    } else if (customCommand.startsWith(etaKeyword)) {
      await sendEta(chatId, customCommand.substr(etaKeyword.length));
    } else if (customCommand.startsWith(rawKeyword)) {
      await sendMessage(chatId, customCommand.substr(rawKeyword.length));
    } else if (config.use_test_chat) {
      await sendMessage(chatId, customCommand);
    }
  }
  return { statusCode: 200, body: '' };
};

async function sendLunchPoll(chatId) {
  const { title, options } = config.lunch_poll;
  await bot.telegram.sendMessage(chatId, config.lunch_call);
  return await bot.telegram.sendPoll(chatId, title, options, { is_anonymous: false });
}

async function pinMessageSilently(chatId, messageId) {
  await bot.telegram.unpinAllChatMessages(chatId);
  return await bot.telegram.pinChatMessage(chatId, messageId, { disable_notification: true });
}

async function sendSergeyTag(chatId) {
  return await bot.telegram.sendMessage(chatId, config.sergey_tag);
}

async function sendOrderPoll(chatId) {
  const { title, options } = config.order_poll;
  await bot.telegram.sendPoll(chatId, title, options, { is_anonymous: false, allows_multiple_answers: true });
  const debter = await getBiggestDebter();
  if (!!debter) {
    await bot.telegram.sendMessage(chatId, 'Похоже что самый большой долг у ' + debter + '. Готовься заказывать :)');
  }
}

async function sendLateOrderPoll(chatId) {
  const { title, options } = config.late_order_poll;
  return await bot.telegram.sendPoll(chatId, title, options, { is_anonymous: false, allows_multiple_answers: true });
}

async function sendSirki(chatId) {
  return await bot.telegram.sendMessage(chatId, 'Сегодня день сырков! (захватите плиз Олегу со сгущенкой)');
}

async function sendRawEta(chatId, text) {
  const args = text.split(' ');
  if (args.length == 2) {
    const minutes = args[1];
    sendEta(chatId, minutes);
  } else {
    sendMessage(chatId, 'Неправильный формат сообщения');
  }
}

async function sendEta(chatId, minutes) {
  return await bot.telegram.sendMessage(chatId, 'Ожидаемое время прибытия доставки ' + getTimeMinutesIntoFuture(minutes));
}

async function sendMessage(chatId, payload) {
  return await bot.telegram.sendMessage(chatId, payload);
}

async function getBiggestDebter() {
  const group = await sw.getGroup({ id: process.env.SW_GROUP });
  const filtered_members = group.members
    .map(m => ({ ...m, ...splitwise_users.find(u => u.id == m.id) }))
    .filter(m => !m.ignore);
  const members = filtered_members.map(m => ({ ...m, balance: m.balance.find(e => e.currency_code == 'RSD').amount }));
  if (members.length == 0) { return }
  const biggestDebt = members.reduce((prev, curr) => Number(prev.balance) < Number(curr.balance) ? prev : curr);
  return biggestDebt.tg;
}

function getTimeMinutesIntoFuture(minutes) {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  now.setMinutes(now.getMinutes() + Number(minutes));
  const formattedTime = now.toLocaleTimeString(['ru-RU'], { hour: '2-digit', minute: '2-digit' });
  return formattedTime;
}
