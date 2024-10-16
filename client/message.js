const { getBuffer, writeExifWebp, imageToWebp, writeExifVid, videoToWebp, writeExifImg } = require('../utils');
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
 async sendImageAsSticker(jid, buff, options = {}) {
  let buffer;
  if (options && (options.packname || options.author)) {
   buffer = await writeExifImg(buff, options);
  } else {
   buffer = await imageToWebp(buff);
  }
  await this.client.sendMessage(jid, { sticker: { url: buffer }, ...options }, options);
 }

 async sendVideoAsSticker(jid, buff, options = {}) {
  let buffer;
  if (options && (options.packname || options.author)) {
   buffer = await writeExifVid(buff, options);
  } else {
   buffer = await videoToWebp(buff);
  }
  await this.client.sendMessage(jid, { sticker: { url: buffer }, ...options }, options);
 }

 async send(content, options = {}) {
  const jid = options.jid || this.jid;

  const getContentBuffer = async (content) => {
   if (Buffer.isBuffer(content)) return content;
   if (typeof content === 'string' && content.startsWith('http')) {
    return getBuffer(content);
   }
   return Buffer.from(content);
  };

  const detectMimeType = async (buffer) => {
   const fileType = await FileType.fromBuffer(buffer);
   return fileType ? fileType.mime : 'application/octet-stream';
  };

  try {
   let buffer = await getContentBuffer(content);
   let mimeType = await detectMimeType(buffer);

   const contentType = options.type || mimeType.split('/')[0];

   if (contentType === 'sticker' || options.asSticker) {
    if (mimeType.startsWith('image/')) {
     return this.sendImageAsSticker(jid, buffer, options);
    } else if (mimeType.startsWith('video/')) {
     return this.sendVideoAsSticker(jid, buffer, options);
    }
   }

   const messageContent = {
    image: { image: buffer },
    video: { video: buffer },
    audio: { audio: buffer, mimetype: 'audio/mp4' },
    document: { document: buffer, mimetype: mimeType, fileName: options.filename || 'file' },
   };

   let sendOptions = {
    quoted: this.data,
    caption: options.caption,
    contextInfo: options.contextInfo,
   };

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
