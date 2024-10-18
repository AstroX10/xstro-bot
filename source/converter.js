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
  if (!hasMedia) return message.reply('_Reply an Image/Video_');
  const content = await message.download(message.reply_message.data);
  return message.send(content.buffer, {
   type: 'sticker',
   author: STICKER_PACK.split(';')[0],
   packname: STICKER_PACK.split(';')[1],
  });
 }
);

command(
 {
  pattern: 'take ?(.*)',
  desc: 'Saves Stickers to be Yours',
  type: 'converter',
 },
 async (message, match) => {
  const isStickerMedia = message.reply_message?.sticker;
  if (!isStickerMedia) return message.reply('_Reply A Sticker!_');
  const newSticker = await message.download(message.reply_message.data);
  return message.send(newSticker.buffer, {
   // type: 'sticker',
   author: STICKER_PACK.split(';')[0],
   packname: STICKER_PACK.split(';')[1],
  });
 }
);
