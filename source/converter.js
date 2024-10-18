const { command } = require('../lib');
const { getBuffer } = require('../utils');
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
  if (!newSticker.buffer) return message.reply('_Failed to download sticker_');

  return message.send(newSticker.buffer, {
   type: 'sticker',
   author: STICKER_PACK.split(';')[0],
   packname: STICKER_PACK.split(';')[1],
  });
 }
);

command(
 {
  pattern: 'image',
  desc: 'Converts Sticker/Video to Images',
  type: 'converter',
 },
 async (message, match) => {
  const res = message.reply_message?.video || message.reply_message?.sticker || (match.includes('http') && match);

  if (!res) return message.reply('_Reply to a Sticker/Video or provide a valid URL!_');

  let contentBuffer;
  if (message.reply_message?.video || message.reply_message?.sticker) contentBuffer = await message.download(message.reply_message.data);
  if (match.includes('http')) {
   contentBuffer = await getBuffer(match);
   if (!contentBuffer) return message.reply('_Failed to process the media or URL_');
   return await message.send(contentBuffer, { type: 'image' });
  }
 }
);
