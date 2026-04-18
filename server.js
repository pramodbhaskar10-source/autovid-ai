const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v2: cloudinary } = require('cloudinary');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const Replicate = require('replicate');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Replicate Config
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Jobs Map - In-memory store
const jobs = new Map();

// 18 STYLES - FacelessReels.com Killer
const STYLE_PROMPTS = {
  'Autoshorts V2': 'cinematic, viral short format, dynamic, trending',
  'LEGO': 'lego blocks style, plastic toy, colorful, blocky construction',
  'Comic Book': 'comic book style, bold ink lines, halftone dots, speech bubbles',
  'Disney toon': 'disney animation style, magical, vibrant colors, glossy, 3d',
  'studio Ghibli': 'studio ghibli style, hayao miyazaki, anime, painterly, soft lighting, detailed background',
  'pixelated': '8-bit pixel art, retro game style, blocky',
  'creepy toon': 'dark cartoon, tim burton style, eerie, gothic',
  'childrens book': 'children book illustration, soft colors, watercolor, cute',
  'photo realism': 'photorealistic, 8k uhd, ultra detailed, professional photography',
  'Minecraft': 'minecraft style, voxel art, blocky 3d, pixelated texture',
  'watercolor': 'watercolor painting, soft brush strokes, artistic, flowing',
  'expressionism': 'expressionist painting, bold colors, emotional, abstract',
  'Charcoal': 'charcoal sketch, black and white, artistic, hand drawn',
  'Gtav': 'gta v style, realistic game graphics, rockstar, detailed',
  'Anime': 'anime style, japanese animation, vibrant colors, detailed eyes, manga',
  'Autoshorts': 'trending short format, fast paced, viral, dynamic',
  'film noir': 'film noir style, black and white, dramatic shadows, 1940s, detective',
  '3D toon': '3d cartoon style, pixar, glossy render, subsurface scattering'
};

const ASPECT_RATIOS = {
  'vertical': { width: 1080, height: 1920 },
  'horizontal': { width: 1920, height: 1080 },
  'square': { width: 1080, height: 1080 }
};

// 6 VOICES
const VOICE_MAP = {
  'Echo': 'EXAVITQu4vr4xnSDxMaL',
  'Alloy': 'XB0fDUnXU5powFXDhCwa',
  'Onyx': 'iP95p4xoKVk53GoZ742B',
  'Fable': 'SAz9YHcvj6GT2YYXdXww',
  'Nova': 'XB0fDUnXU5powFXDhCwa',
  'Shimmer': 'jBpfuIE2acCO8z3wKNLl'
};

// Duration to scenes mapping
const DURATION_SCENES = {
  '30s': 6, '1min': 12, '2min': 24, '3min': 36,
  '5min': 60, '10min': 120, '15min': 180, '20min': 240
};

// ==================== ROUTES ====================

// Health Check - Test this first!
app.get('/health', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    env_check: {
      replicate:!!process.env.REPLICATE_API_TOKEN,
      openai:!!process.env.OPENAI_API_KEY,
      elevenlabs:!!process.env.ELEVENLABS_API_KEY,
      cloudinary:!!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

// Start Video Generation - Returns immediately!
app.post('/api/generate-pro', (req, res) => {
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { topic, style, voice, aspectRatio, duration, language, brandName } = req.body;

    // Validate inputs
    if (!topic ||!style ||!voice ||!aspectRatio ||!duration) {
      return res.status(400).json({ error: 'Missing required fields: topic, style, voice, aspectRatio, duration' });
    }

    console.log(`[${jobId}] Job queued:`, { topic, style, voice, duration });
    jobs.set(jobId, {
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      params: req.body
    });

    // Start background job - NO AWAIT! This is key!
    processVideoJobPro(jobId, req.body).catch(err => {
      console.error(`[${jobId}] Job failed:`, err);
      jobs.set(jobId, {
        status: 'failed',
        error: err.message,
        progress: 0
      });
    });

    // Return immediately - under 100ms
    res.json({
      jobId,
      status: 'queued',
      message: 'Faceless video generation started. Poll /api/status/:jobId for updates.'
    });

  } catch (err) {
    console.error('Error in /api/generate-pro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check Job Status
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    jobId: req.params.jobId,
   ...job
  });
});

// ==================== BACKGROUND JOB ====================

async function processVideoJobPro(jobId, params) {
  const { topic, style, voice, aspectRatio, duration, language = 'English', brandName = 'AutoVid' } = params;
  const job = jobs.get(jobId);
  const workDir = path.join('/tmp', jobId);

  try {
    await fs.mkdir(workDir, { recursive: true });
    console.log(`[${jobId}] Workdir created: ${workDir}`);

    // STEP 1: Split script into scenes
    job.status = 'scripting'; job.progress = 10;
    jobs.set(jobId, {...job});
    const sceneCount = DURATION_SCENES[duration] || 12;
    console.log(`[${jobId}] Generating ${sceneCount} scenes for topic: ${topic}`);
    const scenes = await generateScenes(topic, sceneCount, language);

    // STEP 2: Generate AI images for each scene
    job.status = 'generating_images'; job.progress = 20;
    jobs.set(jobId, {...job});
    const { width, height } = ASPECT_RATIOS[aspectRatio];
    const imageFiles = [];

    for (let i = 0; i < scenes.length; i++) {
      console.log(`[${jobId}] Generating image ${i+1}/${scenes.length}`);
      const imagePrompt = `${scenes[i]}, ${STYLE_PROMPTS[style]}, high quality, detailed, 8k, no text, no watermark`;

      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: imagePrompt,
            width,
            height,
            num_outputs: 1,
            num_inference_steps: 30,
            scheduler: "K_EULER"
          }
        }
      );

      const imgPath = path.join(workDir, `scene_${i}.png`);
      const imgRes = await axios.get(output[0], { responseType: 'arraybuffer' });
      await fs.writeFile(imgPath, imgRes.data);
      imageFiles.push(imgPath);

      job.progress = 20 + Math.floor((i / scenes.length) * 35);
      jobs.set(jobId, {...job});
    }

    // STEP 3: Generate voiceover
    job.status = 'voiceover'; job.progress = 55;
    jobs.set(jobId, {...job});
    const fullScript = scenes.map(s => s.replace(/^Scene \d+:\s*/, '')).join('. ');
    console.log(`[${jobId}] Generating voiceover with ${voice}`);

    const audioRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_MAP[voice]}`,
      {
        text: fullScript,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5 }
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );
    const audioPath = path.join(workDir, 'voiceover.mp3');
    await fs.writeFile(audioPath, audioRes.data);

    // STEP 4: Generate captions SRT
    job.status = 'captions'; job.progress = 65;
    jobs.set(jobId, {...job});
    const srtPath = path.join(workDir, 'captions.srt');
    const srtContent = generateSRT(scenes, sceneCount);
    await fs.writeFile(srtPath, srtContent);
    console.log(`[${jobId}] Captions generated`);

    // STEP 5: Stitch video with Ken Burns + Captions
    job.status = 'rendering'; job.progress = 75;
    jobs.set(jobId, {...job});
    const outputPath = path.join(workDir, 'final.mp4');
    console.log(`[${jobId}] Rendering video with FFmpeg`);
    await stitchVideoPro(imageFiles, audioPath, srtPath, outputPath, width, height, brandName);

    // STEP 6: Upload to Cloudinary
    job.status = 'uploading'; job.progress = 90;
    jobs.set(jobId, {...job});
    console.log(`[${jobId}] Uploading to Cloudinary`);
    const uploadRes = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'autovid',
      public_id: `${jobId}_${style}_${voice}`.replace(/\s+/g, '_'),
      overwrite: true
    });

    // COMPLETE
    job.status = 'completed';
    job.progress = 100;
    job.result = {
      videoUrl: uploadRes.secure_url,
      style,
      voice,
      aspectRatio,
      duration,
      scenes: sceneCount,
      completedAt: new Date().toISOString()
    };
    jobs.set(jobId, {...job});
    console.log(`[${jobId}] COMPLETED: ${uploadRes.secure_url}`);

    // Cleanup
    await fs.rm(workDir, { recursive: true, force: true });
    console.log(`[${jobId}] Cleanup done`);

  } catch (err) {
    console.error(`[${jobId}] ERROR:`, err);
    job.status = 'failed';
    job.error = err.message;
    jobs.set(jobId, {...job});

    // Cleanup on error
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

// ==================== HELPERS ====================

async function generateScenes(topic, count, language) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Create ${count} visual scene descriptions for a ${language} faceless YouTube short about "${topic}". Each scene is 5 seconds. Format: Scene 1: [vivid visual description]. Only return the scenes, numbered. No intro or outro text.`
    }],
    temperature: 0.8
  }, {
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    timeout: 30000
  });

  const content = res.data.choices[0].message.content;
  return content.split('\n').filter(s => s.trim().match(/^Scene \d+:/)).slice(0, count);
}

function generateSRT(scenes, count) {
  let srt = '';
  scenes.forEach((scene, i) => {
    const start = i * 5;
    const end = (i + 1) * 5;
    const text = scene.replace(/^Scene \d+:\s*/, '').trim();
    const formatTime = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},000`;
    };
    srt += `${i+1}\n${formatTime(start)} --> ${formatTime(end)}\n${text}\n\n`;
  });
  return srt;
}

function stitchVideoPro(images, audio, srt, output, width, height, brand) {
  return new Promise((resolve, reject) => {
    const inputs = images.map(img => `-loop 1 -t 5 -i "${img}"`).join(' ');

    const filterComplex = images.map((_, i) =>
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',` +
      `setsar=1,fps=30[v${i}]`
    ).join(';') + ';' +
    images.map((_, i) => `[v${i}]`).join('') +
    `concat=n=${images.length}:v=1:a=0[concatenated];` +
    `[concatenated]subtitles='${srt}':force_style='FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'[subbed];` +
    `[subbed]drawtext=text='${brand}':x=w-tw-20:y=20:fontsize=32:fontcolor=white@0.8:shadowcolor=black@0.5:shadowx=2:shadowy=2[v]`;

    const cmd = `ffmpeg ${inputs} -i "${audio}" -filter_complex "${filterComplex}" -map "[v]" -map ${images.length}:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -shortest -y "${output}"`;

    console.log('Running FFmpeg...');
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('FFmpeg error:', stderr);
        reject(new Error(`FFmpeg failed: ${err.message}`));
      } else {
        console.log('FFmpeg success');
        resolve();
      }
    });
  });
}

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AutoVid AI Pro running on ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
