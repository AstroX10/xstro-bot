const { getBuffer, writeExifWebp } = require('../utils');
const config = require('../config');
const FileType = require('file-type');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const { generateWAMessageFromContent, getDevice, proto, downloadContentFromMessage, jidDecode } = require('baileys');

class Handler {
 constructor(client, data) {
  this.client = client;
  this._patch(data);
 }

 _patch(data) {
  this.data = data;
  this.user = this.decodeJid(this.client.user.id);
  this.key = data.key;
  this.isGroup = data.isGroup;
  this.id = data.key.id;
  this.jid = data.key.remoteJid;
  this.pushName = data.pushName;
  this.participant = this.decodeJid(data.sender);
  this.participantNumber = this.participant?.split('@')[0];
  this.sudo = this._isSudo(this.participantNumber);
  this.fromMe = data.key.fromMe;
  this.timestamp = data.messageTimestamp?.low || data.messageTimestamp;
  this.isBaileys = this.id.startsWith('BAE5') || this.id.length === 16;
  this.text = data.body || '';
  this.isOwner = this.fromMe || this.sudo;

  if (this.isGroup) this._processGroupData(data);
  if (data.message) this._processMessageContent(data);
 }

 _isSudo(participantNumber) {
  return Array.isArray(config.SUDO) ? config.SUDO.includes(participantNumber) : (config.SUDO || '').split(',').includes(participantNumber);
 }

 _processGroupData(data) {
  this.groupId = this.jid;
  this.groupName = data.groupName || null;
  this.groupMetadata = data.groupMetadata || null;
  this.groupParticipants = this.groupMetadata?.participants || [];
  this.groupAdmins = this.groupParticipants.filter((p) => p.admin).map((p) => p.id);
  this.isGroupAdmin = this.groupAdmins.includes(this.participant);
 }

 _processMessageContent(data) {
  const messageType = Object.keys(data.message)[0];
  this.type = messageType.replace('Message', '').toLowerCase();
  this.message = data.message[messageType];
  this.body = data.body || '';
  const contextInfo = this.message?.contextInfo;
  this.mention = contextInfo?.mentionedJid || [];

  const mediaTypes = {
   image: 'image',
   video: 'video',
   audio: 'audio',
   document: 'document',
   sticker: 'sticker',
  };

  this.mediaType = mediaTypes[this.type] || 'text';
  this.mediaUrl = this.message?.url || null;
  this.fileSize = this.message?.fileLength || null;
  this.caption = this.message?.caption || null;
  this.mimetype = this.message?.mimetype || null;

  if (data.quoted) this._processQuotedMessage(data.quoted);
 }

 _processQuotedMessage(quoted) {
  const quotedKey = quoted.key;
  const quotedMessage = quoted.message;
  const quotedContextInfo = quotedMessage?.extendedTextMessage?.contextInfo || quotedMessage?.contextInfo || {};
  const senderJID = quoted.sender;

  this.reply_message = {
   key: quotedKey,
   jid: quotedKey.remoteJid,
   type: quoted.type || 'extendedTextMessage',
   id: quotedKey.id,
   sender: senderJID,
   mention: quotedContextInfo.mentionedJid || [],
   fromMe: quotedKey.fromMe,
   isOwner: quotedKey.remoteJid === this.sudo || quotedKey.fromMe,
   contextInfo: quotedContextInfo || {},
   mediaType: this._getMediaType(quotedMessage),
   mediaUrl: this._getMediaUrl(quotedMessage),
   fileSize: this._getFileSize(quotedMessage),
   caption: this._getCaption(quotedMessage),
   isViewOnce: Boolean(quotedMessage?.viewOnceMessage || quotedMessage?.viewOnceMessageV2),
  };
 }

 _getMediaType(message) {
  const mediaTypes = {
   imageMessage: 'image',
   videoMessage: 'video',
   audioMessage: 'audio',
   documentMessage: 'document',
   stickerMessage: 'sticker',
  };
  return Object.keys(mediaTypes).find((key) => message[key]) || 'text';
 }

 _getMediaUrl(message) {
  return message?.imageMessage?.url || message?.videoMessage?.url || message?.audioMessage?.url || message?.documentMessage?.url || null;
 }

 _getFileSize(message) {
  return message?.imageMessage?.fileLength || message?.videoMessage?.fileLength || message?.audioMessage?.fileLength || message?.documentMessage?.fileLength || null;
 }

 _getCaption(message) {
  return message?.imageMessage?.caption || message?.videoMessage?.caption || message?.documentMessage?.caption || null;
 }

 decodeJid(jid) {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
   const decode = jidDecode(jid) || {};
   return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
  } else return jid;
 }
 async reply(text, options = {}) {
  let messageContent = { text };
  if (options.mentions) messageContent.mentions = options.mentions;
  const message = await this.client.sendMessage(this.jid, messageContent, { quoted: this.data, ...options });
  return new Handler(this.client, message);
 }

 async react(emoji) {
  return this.client.sendMessage(this.jid, {
   react: {
    text: emoji,
    key: this.key,
   },
  });
 }

 async edit(text, opt = {}) {
  return this.client.sendMessage(this.jid, { text, edit: this.key }, opt);
 }
 async sendMessage(jid, content, opt = { quoted: this.data }, type = 'text') {
  const sendMedia = async (mediaType, mediaContent) => {
   const isBuffer = Buffer.isBuffer(mediaContent);
   const isUrl = typeof mediaContent === 'string' && mediaContent.startsWith('http');
   return this.client.sendMessage(opt.jid || this.jid, {
    [mediaType]: isBuffer ? mediaContent : isUrl ? { url: mediaContent } : mediaContent,
    ...opt,
   });
  };

  const sendFunctions = {
   text: () => this.client.sendMessage(jid || this.jid, { text: content, ...opt }),
   image: () => sendMedia('image', content),
   video: () => sendMedia('video', content),
   audio: () => sendMedia('audio', content),
   sticker: async () => {
    const { data, mime } = await this.client.getFile(content);
    if (mime === 'image/webp') {
     const buff = await writeExifWebp(data, opt);
     return this.client.sendMessage(jid || this.jid, { sticker: { url: buff }, ...opt });
    }
    return this.client.sendImageAsSticker(this.jid, content, opt);
   },
   document: () => sendMedia('document', content, { ...opt, mimetype: opt.mimetype || 'application/octet-stream' }),
   location: () => this.client.sendMessage(jid || this.jid, { location: content, ...opt }),
   contact: () =>
    this.client.sendMessage(jid || this.jid, {
     contacts: {
      displayName: content.name,
      contacts: [{ vcard: content.vcard }],
     },
     ...opt,
    }),
  };

  const message = await (
   sendFunctions[type.toLowerCase()] ||
   (() => {
    throw new Error('Unsupported message type');
   })
  )();

  return new Handler(this.client, message);
 }
 async send(content, options = {}) {
  const jid = options.jid || this.jid;

  const getContentBuffer = async (content) => {
   if (Buffer.isBuffer(content)) return content;
   if (typeof content === 'string' && content.startsWith('http')) {
    return getBuffer(content); // Assuming this function exists to fetch the content
   }
   return Buffer.from(content);
  };

  const detectMimeType = async (buffer) => {
   const fileType = await FileType.fromBuffer(buffer);
   return fileType ? fileType.mime : 'application/octet-stream';
  };

  const convertContent = async (buffer, fromType, toType) => {
   if (toType === 'sticker') {
    if (!options.packname || !options.author) {
     throw new Error('Packname and author must be provided for stickers.');
    }

    // Use wa-sticker-formatter to create a sticker
    const sticker = new Sticker(buffer, {
     pack: options.packname,
     author: options.author,
     type: StickerTypes.FULL, // FULL or CROPPED
     quality: 80, // Sticker quality (0-100)
    });

    return await sticker.toBuffer(); // Return the sticker buffer
   }

   // Fallback to ffmpeg for other media conversions
   const tempInput = path.join(os.tmpdir(), `input_${Date.now()}`);
   const tempOutput = path.join(os.tmpdir(), `output_${Date.now()}`);

   await fs.promises.writeFile(tempInput, buffer);

   return new Promise((resolve, reject) => {
    ffmpeg(tempInput)
     .toFormat(toType.split('/')[1])
     .on('end', async () => {
      const outputBuffer = await fs.readFile(tempOutput);
      await fs.promises.unlink(tempInput);
      await fs.promises.unlink(tempOutput);
      resolve(outputBuffer);
     })
     .on('error', async (err) => {
      await fs.promises.unlink(tempInput);
      reject(new Error(`Conversion failed: ${err.message}`));
     })
     .save(tempOutput);
   });
  };

  try {
   let buffer = await getContentBuffer(content);
   let mimeType = await detectMimeType(buffer);

   if (options.type && options.type !== mimeType.split('/')[0]) {
    try {
     if (options.type === 'sticker') {
      // Force conversion to sticker using wa-sticker-formatter
      buffer = await convertContent(buffer, mimeType, 'sticker');
      mimeType = 'image/webp'; // Stickers are in WebP format
     } else {
      buffer = await convertContent(buffer, mimeType, `${options.type}/generic`);
      mimeType = await detectMimeType(buffer);
     }
    } catch (conversionError) {
     throw new Error(`Conversion failed: ${conversionError.message}`);
    }
   }

   const messageContent = {
    image: { image: buffer },
    video: { video: buffer },
    audio: { audio: buffer, mimetype: 'audio/mp4' },
    sticker: { sticker: buffer },
    document: { document: buffer, mimetype: mimeType, fileName: options.filename || 'file' },
   };

   const contentType = options.type || mimeType.split('/')[0];
   const isSticker = mimeType === 'image/webp';

   let sendOptions = {
    quoted: this.data,
    caption: options.caption,
    contextInfo: options.contextInfo,
   };

   if (isSticker) {
    if (!options.packname || !options.author) throw new Error('Packname and author must be provided for stickers.');

    return this.client.sendMessage(jid, {
     sticker: buffer,
     packname: options.packname,
     author: options.author,
    });
   }

   if (contentType === 'text' || !messageContent[contentType]) {
    return this.client.sendMessage(jid, { text: buffer.toString(), ...sendOptions });
   }

   return this.client.sendMessage(jid, { ...messageContent[contentType], ...sendOptions });
  } catch (error) {
   console.error('Error in send function:', error);
   throw new Error(`Send operation failed: ${error.message}`);
  }
 }
}

module.exports = Handler;
