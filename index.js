const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
async function readAndRequireFiles(directory) {
 try {
  const files = await fs.readdir(directory);
  return Promise.all(files.filter((file) => path.extname(file).toLowerCase() === '.js').map((file) => require(path.join(directory, file))));
 } catch (error) {
  console.error('Error reading and requiring files:', error);
  throw error;
 }
}

async function initialize() {
 try {
  await readAndRequireFiles(path.join(__dirname, '/db/'));
  console.log('Syncing Database');
  await config.DATABASE.sync();

  console.log('⬇  Installing Plugins...');
  await readAndRequireFiles(path.join(__dirname, '/source/'));
  console.log('✅ Plugins Installed!');

  const WhatsAppBot = require('./lib/bot');
  const bot = new WhatsAppBot();
  return bot.connect();
 } catch (error) {
  console.error('Initialization error:', error);
  process.exit(1);
 }
}

initialize();
