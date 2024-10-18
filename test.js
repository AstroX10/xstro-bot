const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function convertBufferToWhatsAppVideo(inputBuffer) {
  const inputFilePath = path.join(os.tmpdir(), 'input-video');
  const outputFilePath = path.join(os.tmpdir(), 'output-video.mp4');

  fs.writeFileSync(inputFilePath, inputBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .setFfmpegPath(ffmpegPath)
      .outputOptions([
        '-c:v libx264', '-c:a aac', '-b:a 128k', '-ar 44100', 
        '-pix_fmt yuv420p', '-movflags +faststart', '-preset fast', 
        '-crf 28', '-vf scale=480:trunc(ow/a/2)*2', '-profile:v baseline'
      ])
      .on('end', () => {
        const outputBuffer = fs.readFileSync(outputFilePath);
        fs.unlinkSync(inputFilePath);
        fs.unlinkSync(outputFilePath);
        resolve(outputBuffer);
      })
      .on('error', (err) => {
        fs.unlinkSync(inputFilePath);
        reject(err);
      })
      .save(outputFilePath);
  });
}

// Usage example
const inputBuffer = fs.readFileSync('./input-video.webm');

convertBufferToWhatsAppVideo(inputBuffer)
  .then((outputBuffer) => {
    console.log('Video converted successfully, output buffer length:', outputBuffer.length);
  })
  .catch((err) => console.error(`Error: ${err.message}`));
