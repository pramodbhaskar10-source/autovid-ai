const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const jobs = new Map();

const ensureTempDir = async () => {
  const tempDir = path.join(__dirname, 'tmp');
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }
  return tempDir;
};

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'AutoVid AI with ElevenLabs Multilingual v2 is running!' });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { topic, duration, language, voiceChoice, brandName } = req.body;
    if (!topic) {
      return res.status(400).json({ success: false, error: 'Topic is required' });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    jobs.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: 0,
      message: 'Job queued',
      videoUrl: null,
      error: null,
      createdAt: new Date().toISOString()
    });

    console.log(`[${jobId}] Job created: ${topic}`);
    processVideoJob(jobId, { topic, duration, language, voiceChoice, brandName });

    res.json({
      success: true,
      message: 'Video generation started',
      jobId: jobId,
      statusUrl: `/api/status/${jobId}`,
      estimatedTime: '35-40 seconds'
    });
  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({
    success: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    videoUrl: job.videoUrl,
    error: job.error,
    createdAt: job.createdAt
  });
});

async function processVideoJob(jobId, params) {
  const updateJob = (status, progress, message, videoUrl = null, error = null) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = status;
      job.progress = progress;
      job.message = message;
      if (videoUrl) job.videoUrl = videoUrl;
      if (error) job.error = error;
      jobs.set(jobId, job);
      console.log(`[${jobId}] ${status}: ${message} (${progress}%)`);
    }
  };

  try {
    const { topic, duration, language, voiceChoice, brandName } = params;
    updateJob('processing', 5, 'Starting video generation...');
    const tempDir = await ensureTempDir();
    const timestamp = Date.now();

    updateJob('processing', 10, 'Generating script...');
    const script = await generateScript(topic, language || 'Tamil', duration || '30s');

    updateJob('processing', 25, 'Generating premium Tamil voiceover...');
    const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
    await generateVoiceover(script.fullText, audioPath, voiceChoice || 'nova', language || 'Tamil');

    updateJob('processing', 45, 'Downloading video clips...');
    const videoPath = path.join(tempDir, `video_${timestamp}.mp4`);
    await downloadPexelsVideo(topic, videoPath);

    updateJob('processing', 70, 'Processing video with FFmpeg...');
    const outputPath = path.join(tempDir, `output_${timestamp}.mp4`);
    await processVideo(videoPath, audioPath, outputPath, brandName);

    updateJob('processing', 90, 'Uploading to Cloudinary...');
    const cloudinaryUrl = await uploadToCloudinary(outputPath, jobId);

    updateJob('completed', 100, 'Video generated successfully!', cloudinaryUrl);

    setTimeout(async () => {
      await fs.unlink(audioPath).catch(() => {});
      await fs.unlink(videoPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }, 5000);

    setTimeout(() => { jobs.delete(jobId); }, 3600000);

  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    updateJob('failed', 0, 'Video generation failed', null, error.message);
  }
}

async function generateScript(topic, language, duration) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Create a ${duration} ${language} motivational video script about "${topic}". Make it emotional, powerful, and cinematic. Return JSON: {"fullText": "complete narration text"}`
    }],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(response.choices[0].message.content);
}

async function generateVoiceover(text, outputPath, voiceChoice, language) {
  const voiceMap = {
    'nova': 'XB0fDUnXU5powFXDhCwa', // Anjali - Premium Tamil Female
    'shimmer': 'jsCqWAovK2LkecY7zXl4', // Priya - Tamil Female
    'echo': 'D4bWdEbF2Q2tDGN6dXj0', // Arjun - Tamil Male
    'fable': 'bVMeCyTHy58xNoL34h3p', // Vikram - Tamil Male
    'onyx': 'onwK4e9ZLuTAKqWW03F9', // Daniel - English Male
    'alloy': 'FGY2WhTYpPnrIDTdsZk9', // Laura - English Female
    'default': 'XB0fDUnXU5powFXDhCwa' // Anjali default for Tamil
  };

  const voiceId = voiceMap[voiceChoice] || voiceMap['default'];

  console.log(`[${voiceChoice}] Using ElevenLabs Multilingual v2: ${voiceId}`);

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.65,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    await fs.writeFile(outputPath, response.data);
    console.log('ElevenLabs: Multilingual v2 Tamil voice generated successfully');
  } catch (error) {
    console.error('ElevenLabs Error:', error.response?.status, error.response?.data?.toString());
    throw new Error(`ElevenLabs failed: ${error.response?.status || error.message}`);
  }
}

// FIXED - videoPath bug removed
async function downloadPexelsVideo(query, outputPath) {
  const searchRes = await axios.get('https://api.pexels.com/videos/search', {
    headers: { Authorization: PEXELS_API_KEY },
    params: { query, per_page: 1, orientation: 'portrait' }
  });

  if (!searchRes.data.videos || searchRes.data.videos.length === 0) {
    throw new Error('No videos found on Pexels for this topic');
  }

  const video = searchRes.data.videos[0];
  const videoFile = video.video_files.find(f => f.quality === 'hd' && f.height >= 1280) || video.video_files[0];
  const videoRes = await axios.get(videoFile.link, { responseType: 'arraybuffer' });
  await fs.writeFile(outputPath, videoRes.data); // ✅ CORRECT
}

async function processVideo(videoPath, audioPath, outputPath, brandName) {
  return new Promise((resolve, reject) => {
    const safeBrand = (brandName || 'AutoVid AI').replace(/[':]/g, '');
    ffmpeg()
 .input(videoPath)
 .input(audioPath)
 .complexFilter([
        '[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2[scaled]',
        `[scaled]drawtext=text='${safeBrand}':fontcolor=white:fontsize=32:x=w-tw-40:y=40:box=1:boxcolor=black@0.5:boxborderw=10[outv]`
      ])
 .outputOptions([
        '-map [outv]',
        '-map 1:a',
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k',
        '-shortest'
      ])
 .save(outputPath)
 .on('end', () => {
        console.log('FFmpeg processing completed');
        resolve();
      })
 .on('error', (err) => {
        console.error('FFmpeg error:', err.message);
        reject(err);
      });
  });
}

async function uploadToCloudinary(filePath, jobId) {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'autovid',
    public_id: `video_${jobId}`,
    overwrite: true
  });
  return result.secure_url;
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 AutoVid AI with ElevenLabs Multilingual v2 running on port ${PORT}`);
});
