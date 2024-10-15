const { downloadContentFromMessage, getContentType } = require('baileys');
const fs = require('fs').promises;
const { fromBuffer } = require('file-type');
const path = require('path');
const { parsedJid } = require('../utils');
const config = require('../config');

async function downloadMedia(message, pathFile) {
 const mimeMap = {
  imageMessage: 'image',
  videoMessage: 'video',
  stickerMessage: 'sticker',
  documentMessage: 'document',
  audioMessage: 'audio',
 };

 try {
  let type = Object.keys(message).find((key) => mimeMap[key]);
  let mes = message;

  if (!type) {
   throw new Error('Unsupported message type');
  }

  if (type === 'templateMessage' && message.templateMessage) {
   mes = message.templateMessage.hydratedFourRowTemplate;
   type = Object.keys(mes).find((key) => mimeMap[key]) || type;
  }

  if (type === 'interactiveResponseMessage' && message.interactiveResponseMessage) {
   mes = message.interactiveResponseMessage;
   type = Object.keys(mes).find((key) => mimeMap[key]) || type;
  }

  if (type === 'buttonsMessage' && message.buttonsMessage) {
   mes = message.buttonsMessage;
   type = Object.keys(mes).find((key) => mimeMap[key]) || type;
  }

  const stream = await downloadContentFromMessage(mes[type], mimeMap[type]);
  const buffer = [];

  for await (const chunk of stream) {
   buffer.push(chunk);
  }

  if (pathFile) {
   await fs.writeFile(pathFile, Buffer.concat(buffer));
   return pathFile;
  } else {
   return Buffer.concat(buffer);
  }
 } catch (error) {
  console.error('Error in downloadMedia:', error);
  throw error;
 }
}

async function serialize(msg, conn) {
 conn.logger = { info() {}, error() {}, warn() {} };
 if (msg.key) {
  msg.id = msg.key.id || null;
  msg.isSelf = msg.key.fromMe || false;
  msg.from = msg.key.remoteJid || null;
  msg.isGroup = msg.from ? msg.from.endsWith('@g.us') : false;

  msg.sender = msg.isGroup ? msg.key.participant : msg.isSelf ? conn.user.id : msg.from;

  try {
   msg.sudo = config.SUDO.split(',').includes(parsedJid(msg.sender)[0].split('@')[0]) || msg.key.fromMe;
  } catch {
   msg.sudo = false;
  }
 }

 if (msg.message) {
  msg.type = getContentType(msg.message) || null;

  try {
   msg.mentions = msg.message[msg.type]?.contextInfo?.mentionedJid || [];
  } catch {
   msg.mentions = [];
  }

  try {
   const quoted = msg.message[msg.type]?.contextInfo;
   if (quoted && quoted.quotedMessage) {
    msg.quoted = {
     type: null,
     stanzaId: quoted.stanzaId || null,
     sender: quoted.participant || null,
     message: null,
     isSelf: false,
     mtype: null,
     text: '',
     key: null,
     download: null,
    };
    if (quoted.quotedMessage['ephemeralMessage']) {
     const ephemeralMessage = quoted.quotedMessage.ephemeralMessage.message;
     const messageType = Object.keys(ephemeralMessage)[0];
     msg.quoted.type = messageType === 'viewOnceMessageV2' ? 'view_once' : 'ephemeral';
     msg.quoted.message = messageType === 'viewOnceMessageV2' ? ephemeralMessage.viewOnceMessageV2.message : ephemeralMessage;
    } else if (quoted.quotedMessage['viewOnceMessageV2']) {
     msg.quoted.type = 'view_once';
     msg.quoted.message = quoted.quotedMessage.viewOnceMessageV2.message;
    } else if (quoted.quotedMessage['viewOnceMessageV2Extension']) {
     msg.quoted.type = 'view_once_audio';
     msg.quoted.message = quoted.quotedMessage.viewOnceMessageV2Extension.message;
    } else {
     msg.quoted.type = 'normal';
     msg.quoted.message = quoted.quotedMessage;
    }
    msg.quoted.isSelf = msg.quoted.sender === conn.user.id;
    msg.quoted.mtype = Object.keys(msg.quoted.message);
    msg.quoted.text = msg.quoted.message[msg.quoted.mtype]?.text || msg.quoted.message[msg.quoted.mtype]?.description || msg.quoted.message[msg.quoted.mtype]?.caption || (msg.quoted.mtype === 'templateButtonReplyMessage' && msg.quoted.message[msg.quoted.mtype].hydratedTemplate?.hydratedContentText) || msg.quoted.message[msg.quoted.mtype] || '';
    msg.quoted.key = {
     id: msg.quoted.stanzaId,
     fromMe: msg.quoted.isSelf,
     remoteJid: msg.from,
     participant: msg.quoted.participant || null,
     timestamp: msg.quoted.timestamp || Date.now(),
    };
    msg.quoted.download = (pathFile) => downloadMedia(msg.quoted.message, pathFile);
   }
  } catch (error) {
   console.error('Error in processing quoted message:', error);
   msg.quoted = null;
  }

  try {
   msg.body = msg.message.conversation || msg.message[msg.type]?.text || msg.message[msg.type]?.caption || (msg.type === 'listResponseMessage' && msg.message[msg.type].singleSelectReply.selectedRowId) || (msg.type === 'buttonsResponseMessage' && msg.message[msg.type].selectedButtonId) || (msg.type === 'templateButtonReplyMessage' && msg.message[msg.type].selectedId) || false;
  } catch (error) {
   console.error('Error in extracting message body:', error);
   msg.body = '';
  }

  msg.download = (pathFile) => downloadMedia(msg.message, pathFile);
  conn.client = msg;

  conn.getFile = async (PATH, returnAsFilename) => {
   let res, filename;
   let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? ((filename = PATH), fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0);
   if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer');
   let type = (await fromBuffer(data)) || {
    mime: 'application/octet-stream',
    ext: '.bin',
   };
   if (data && returnAsFilename && !filename) {
    filename = path.join(__dirname, '../' + new Date() * 1 + type.ext);
    await fs.writeFile(filename, data);
   }
   return {
    res,
    filename,
    ...type,
    data,
   };
  };
 }
 return msg;
}

module.exports = { serialize, downloadMedia };
