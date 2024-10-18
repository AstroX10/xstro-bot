const { command } = require('../lib');
const { STICKER_PACK } = require('../config');
command(
 {
  pattern: 'sticker ?(.*)',
  desc: 'Converts Image/Video to Sticker',
  type: 'converter',
 },
 async (message) => {
  if (!message.reply_message?.image || !message.reply_message?.video) return message.reply('_Reply Image/Video_');
  const content = await message.download(message.reply_message.data);
  return message.send(content.buffer, { type: 'sticker', author: STICKER_PACK.split(';')[0], packname: STICKER_PACK.split(';')[1] });
 }
);
