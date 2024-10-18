const { DataTypes } = require('sequelize');
const config = require('../config');

const AntiSpam = config.DATABASE.define('AntiSpam', {
 groupJid: {
  type: DataTypes.STRING,
  allowNull: false,
  unique: true,
 },
 enabled: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
 },
});

const SpamCheck = config.DATABASE.define('SpamCheck', {
 groupJid: {
  type: DataTypes.STRING,
  allowNull: false,
 },
 sender: {
  type: DataTypes.STRING,
  allowNull: false,
 },
 message: {
  type: DataTypes.STRING,
  allowNull: false,
 },
 timestamp: {
  type: DataTypes.DATE,
  allowNull: false,
 },
});

module.exports = {
 AntiSpam,
 SpamCheck,
 async getAntiSpam(groupJid) {
  return await AntiSpam.findOne({
   where: { groupJid },
  });
 },
 async setAntiSpam(groupJid, enabled) {
  return await AntiSpam.upsert({
   groupJid,
   enabled,
  });
 },
 async deleteAntiSpam(groupJid) {
  return await AntiSpam.destroy({
   where: { groupJid },
  });
 },
 async addMessage(groupJid, sender, message) {
  return await SpamCheck.create({
   groupJid,
   // sender,
   message,
   timestamp: new Date(),
  });
 },
 async checkSpam(groupJid, sender, message) {
  const fiveSecondsAgo = new Date(new Date() - 5000);
  const count = await SpamCheck.count({
   where: {
    groupJid,
    sender,
    message,
    timestamp: {
     [config.DATABASE.Sequelize.Op.gte]: fiveSecondsAgo,
    },
   },
  });
  return count > 0;
 },
 async cleanupOldMessages() {
  const fiveMinutesAgo = new Date(new Date() - 5 * 60 * 1000);
  await SpamCheck.destroy({
   where: {
    timestamp: {
     [config.DATABASE.Sequelize.Op.lt]: fiveMinutesAgo,
    },
   },
  });
 },
};
