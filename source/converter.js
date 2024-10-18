const { command } = require('../lib');
const { STICKER_PACK } = require('../config');

command(
 {
  pattern: 'sticker ?(.*)',
  desc: 'Converts Image/Video to Sticker',
  type: 'converter',
 },
 async (message, match) => {
  const hasMedia = message.reply_message?.image || message.reply_message?.video;
  if (!hasMedia) return message.reply('_Reply with an Image/Video_');
  const content = await message.download(message.reply_message.data);
  if (!content.buffer) return message.reply('_Failed to convert media to sticker_');

  return message.send(content.buffer, {
   type: 'sticker',
   author: STICKER_PACK.split(';')[0],
   packname: STICKER_PACK.split(';')[1],
  });
 }
);
