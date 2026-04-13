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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Job storage
const jobs = new Map();

// Create temp directory
const ensureTempDir = async () => {
  const tempDir = path.join(__dirname, 'tmp');
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }
  return tempDir;
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'AutoVid AI is running!' });
});

// STEP 1: Start job - 1 second la response
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

    // Background la process - await panna koodadhu!
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

// STEP 2: Status check
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found'
    });
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

// Background processor
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

    // [1/5] Generate script
    updateJob('processing', 10, 'Generating script...');
    const script = await generateScript(topic, language || 'English', duration || '30s');

    // [2/5] Generate voiceover
    updateJob('processing', 25, 'Generating voiceover...');
    const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
    await generateVoiceover(script.fullText, audioPath, voiceChoice || 'nova');

    // [3/5] Download video
    updateJob('processing', 45, 'Downloading video clips...');
    const videoPath = path.join(tempDir, `video_${timestamp}.mp4`);
    await downloadPexelsVideo(topic, videoPath);

    // [4/5] Process with FFmpeg - FIXED!
    updateJob('processing', 70, 'Processing video with FFmpeg...');
    const outputPath = path.join(tempDir, `output_${timestamp}.mp4`);
    await processVideo(videoPath, audioPath, outputPath, brandName, script.fullText);

    // [5/5] Upload to Cloudinary
    updateJob('processing', 90, 'Uploading to Cloudinary...');
    const cloudinaryUrl = await uploadToCloudinary(outputPath, jobId);

    // Success!
    updateJob('completed', 100, 'Video generated successfully!', cloudinaryUrl);

    // Cleanup
    setTimeout(async () => {
      await fs.unlink(audioPath).catch(() => {});
      await fs.unlink(videoPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }, 5000);

    // Auto delete job after 1 hour
    setTimeout(() => {
      jobs.delete(jobId);
    }, 3600000);

  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    updateJob('failed', 0, 'Video generation failed', null, error.message);
  }
}

// Helper functions
async function generateScript(topic, language, duration) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Create a ${duration} ${language} motivational video script about "${topic}". Return JSON: {"fullText": "complete narration text"}`
    }],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(response.choices[0].message.content);
}

async function generateVoiceover(text, outputPath, voice) {
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice,
    input: text,
    response_format: 'mp3'
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

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
  await fs.writeFile(outputPath, videoRes.data);
}

// FIXED FFmpeg - No textfile, simple drawtext
async function processVideo(videoPath, audioPath, outputPath, brandName, fullText) {
  return new Promise((resolve, reject) => {
    // Escape text for FFmpeg - remove special chars
    const safeText = fullText.replace(/[':]/g, '').substring(0, 100);
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
        '-shortest'
      ])
   .save(outputPath)
   .on('start', (cmd) => console.log('FFmpeg command:', cmd))
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
  console.log(`🚀 AutoVid AI Server running on port ${PORT}`);
});
