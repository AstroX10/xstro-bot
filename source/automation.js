const { command } = require('../lib');
const { isAdmin } = require('./group');
const { getAntiLink, setAntiLink, deleteAntiLink, AntiWord, addAntiWord, getAntiWords, getAntiSpam, setAntiSpam, addMessage, checkSpam, cleanupOldMessages, addWarning, resetWarnings } = require('../db');

command(
 {
  pattern: 'antilink ?(.*)',
  desc: 'Set AntiLink on | off | delete | kick',
  type: 'group',
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return message.reply('_For groups only!_');
  if (!match) return message.reply('_Wrong, Use ' + message.prefix + 'antilink on_\n_' + message.prefix + 'antilink kick_');
  const isUserAdmin = await isAdmin(message.jid, message.user, client);
  if (!isUserAdmin) return message.reply("_I'm not an admin._");

  const cmd = match.trim().toLowerCase();
  if (!cmd) {
   const settings = await getAntiLink(message.jid);
   return message.reply(settings ? `_AntiLink: ${settings.mode}` : 'AntiLink is set to off._');
  }
  if (cmd === 'off') {
   await deleteAntiLink(message.jid);
   return message.reply('AntiLink turned off.');
  }
  const mode = cmd === 'on' ? 'delete' : cmd === 'kick' ? 'kick' : null;
  await setAntiLink(message.jid, mode);
  return message.reply(`_AntiLink set to ${mode}._`);
 }
);

command(
 {
  on: 'text',
  dontAddCommandList: true,
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return;

  const settings = await getAntiLink(message.jid);
  if (!settings) return;
  const isUserAdmin = await isAdmin(message.jid, message.participant, client);
  if (isUserAdmin) return;
  const hasLink = /(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-&?=%.]+/gi.test(message.text);
  if (hasLink) {
   await client.sendMessage(message.jid, { delete: message.key });
   if (settings.mode === 'kick') {
    await client.groupParticipantsUpdate(message.jid, [message.participant], 'remove');
    message.reply(`@${message.participant.split('@')[0]} removed for sending a link.`, { mentions: [message.participant] });
   } else {
    message.reply(`@${message.participant.split('@')[0]}, links are not allowed.`, { mentions: [message.participant] });
   }
  }
 }
);

command(
 {
  pattern: 'antiword ?(.*)',
  desc: 'Add or remove forbidden words',
  type: 'group',
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return message.reply('_For groups only!_');
  if (!match) return message.reply('_Wrong, Use ' + message.prefix + 'antiword fuck_');
  const isUserAdmin = await isAdmin(message.jid, message.user, client);
  if (!isUserAdmin) return message.reply("I'm not an admin.");

  const args = match
   .trim()
   .toLowerCase()
   .split(/[,\s]+/)
   .filter(Boolean);
  if (args.length === 0) {
   const words = await getAntiWords(message.jid);
   return message.reply(words.length > 0 ? `Forbidden words: ${words.join(', ')}` : 'No forbidden words set.');
  }
  if (args[0] === 'off') {
   await AntiWord.destroy({ where: { groupJid: message.jid } });
   return message.reply('*AntiWord feature turned off.*\n_All forbidden words removed._');
  }
  let added = [],
   existing = [],
   failed = [];
  for (const word of args) {
   const result = await addAntiWord(message.jid, word);
   if (result === true) added.push(word);
   else if (result === 'exists') existing.push(word);
   else failed.push(word);
  }
  let response = '';
  if (added.length) response += `*Added: ${added.join(', ')}*\n`;
  if (existing.length) response += `*Already exists: ${existing.join(', ')}*\n`;
  if (failed.length) response += `Failed to add: ${failed.join(', ')}`;

  return message.reply(response.trim() || '*No changes made to the forbidden words list.*');
 }
);

command(
 {
  on: 'text',
  dontAddCommandList: true,
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return;
  const isUserAdmin = await isAdmin(message.jid, message.participant, client);
  if (isUserAdmin) return;
  const antiWords = await getAntiWords(message.jid);
  const messageText = message.text.toLowerCase();
  for (const word of antiWords) {
   if (messageText.includes(word)) {
    await client.sendMessage(message.jid, { delete: message.key });
    return message.reply(`_@${message.participant.split('@')[0]}, your message was deleted for using a forbidden word._`, {
     mentions: [message.participant],
    });
   }
  }
 }
);

command(
 {
  pattern: 'antispam ?(.*)',
  desc: 'Set AntiSpam on | off | kick | warn',
  type: 'group',
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return message.reply('_For groups only!_');
  if (!match) return message.reply('_Wrong, Use ' + message.prefix + 'antispam on | off | kick | warn_');
  const isUserAdmin = await isAdmin(message.jid, message.user, client);
  if (!isUserAdmin) return message.reply("_I'm not an admin._");

  const cmd = match.trim().toLowerCase();
  if (!cmd) {
   const settings = await getAntiSpam(message.jid);
   return message.reply(settings ? `_AntiSpam: ${settings.enabled ? 'on' : 'off'}, Kick: ${settings.kickEnabled ? 'on' : 'off'}, Warn: ${settings.warnEnabled ? 'on' : 'off'}_` : 'AntiSpam is not set.');
  }
  if (cmd === 'off') {
   await setAntiSpam(message.jid, false, false, false);
   return message.reply('AntiSpam turned off.');
  }
  if (cmd === 'on') {
   await setAntiSpam(message.jid, true, false, false);
   return message.reply('AntiSpam turned on.');
  }
  if (cmd === 'kick') {
   await setAntiSpam(message.jid, true, true, false);
   return message.reply('AntiSpam with kick enabled.');
  }
  if (cmd === 'warn') {
   await setAntiSpam(message.jid, true, false, true);
   return message.reply('AntiSpam with warnings enabled.');
  }
  return message.reply('_Invalid command. Use on, off, kick, or warn._');
 }
);

command(
 {
  on: 'text',
  dontAddCommandList: true,
 },
 async (message, match, m, client) => {
  if (!message.isGroup) return;

  const settings = await getAntiSpam(message.jid);
  if (!settings || !settings.enabled) return;

  const isUserAdmin = await isAdmin(message.jid, message.participant, client);
  if (isUserAdmin) return;

  const isSpam = await checkSpam(message.jid, message.participant, message.text);
  if (isSpam) {
   await client.sendMessage(message.jid, { delete: message.key });

   if (settings.warnEnabled) {
    const warningCount = await addWarning(message.jid, message.participant);
    if (warningCount >= 3) {
     if (settings.kickEnabled) {
      try {
       await client.groupParticipantsUpdate(message.jid, [message.participant], 'remove');
       await message.reply(`@${message.participant.split('@')[0]} has been kicked for repeated spamming.`, {
        mentions: [message.participant],
       });
      } catch (error) {
       console.error('Error kicking user:', error);
       await message.reply(`Failed to kick @${message.participant.split('@')[0]}. Please check bot permissions.`, {
        mentions: [message.participant],
       });
      }
     } else {
      await message.reply(`@${message.participant.split('@')[0]} has received 3 warnings for spamming. Further violations may result in being kicked.`, {
       mentions: [message.participant],
      });
     }
     await resetWarnings(message.jid, message.participant);
    } else {
     await message.reply(`@${message.participant.split('@')[0]}, please don't spam! Warning ${warningCount}/3`, {
      mentions: [message.participant],
     });
    }
   } else if (settings.kickEnabled) {
    await client.groupParticipantsUpdate(message.jid, [message.participant], 'remove');
    await message.reply(`@${message.participant.split('@')[0]} has been kicked for spamming.`, {
     mentions: [message.participant],
    });
   } else {
    await message.reply(`@${message.participant.split('@')[0]}, please don't spam!`, {
     mentions: [message.participant],
    });
   }
  } else {
   await addMessage(message.jid, message.participant, message.text);
  }
 }
);

setInterval(cleanupOldMessages, 5 * 60 * 1000);
