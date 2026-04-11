import express from 'express'
import OpenAI from "openai"
import { exec } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from "fs"
import path from "path"
import gTTS from "gtts"
import ffmpeg from "fluent-ffmpeg"

// ✅ Setup ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath as string)

// ✅ ENV CHECK
console.log("ENV CHECK:", process.env.OPENAI_API_KEY ? "FOUND" : "MISSING")

// ✅ OpenAI Setup
let openai: OpenAI | null = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
} else {
  console.log("⚠️ OpenAI API key missing")
}

// ✅ Generate Script
async function generateScript(topic: string) {
  if (!openai) return "OpenAI not configured"

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a YouTube script writer" },
        { role: "user", content: `Write a 5 minute YouTube script about ${topic}` }
      ]
    })

    return res.choices?.[0]?.message?.content || "No script generated"
  } catch (error) {
    console.error("OpenAI Error:", error)
    return "Error generating script"
  }
}

// ✅ Create Video (TTS + Black Screen)
async function createVideo(script: string, job_id: string) {
  const audioPath = `audio_${job_id}.mp3`
  const videoPath = `video_${job_id}.mp4`

  // 🎙️ Generate voice
  await new Promise((resolve, reject) => {
    const tts = new gTTS(script)
    tts.save(audioPath, (err: any) => {
      if (err) reject(err)
      else resolve(true)
    })
  })

  // 🎬 Create video
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=black:s=1280x720:d=60`)
      .inputFormat("lavfi")
      .input(audioPath)
      .outputOptions([
        "-shortest",
        "-c:v libx264",
        "-c:a aac",
        "-pix_fmt yuv420p"
      ])
      .save(videoPath)
      .on("end", () => resolve(videoPath))
      .on("error", (err) => {
        console.error("FFmpeg Error:", err)
        reject(err)
      })
  })
}

// ✅ Express App
const app = express()
app.use(express.json())

// ✅ Root Route
app.get('/', (req, res) => {
  res.send('Autovid AI Backend Running 🚀')
})

// ✅ Job Storage
let jobs: any = {}

// ✅ Autopilot API
app.post('/api/autopilot', async (req, res) => {
  const { topic } = req.body
  const job_id = Date.now().toString()

  jobs[job_id] = { status: 'processing' }
  res.json({ job_id })

  try {
    const script = await generateScript(topic || "Motivation")
    const video = await createVideo(script, job_id)

    jobs[job_id] = {
      status: 'completed',
      script,
      video
    }
  } catch (e) {
    console.error("ERROR:", e)
    jobs[job_id] = { status: 'failed' }
  }
})

// ✅ Job Status
app.get('/api/job/:id', (req, res) => {
  const job = jobs[req.params.id]

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json(job)
})

// ✅ Download Video
app.get('/api/video/:name', (req, res) => {
  const filePath = path.resolve(req.params.name)

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Video not found")
  }

  res.download(filePath)
})

// ✅ Start Server
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log("ENV KEY:", process.env.OPENAI_API_KEY ? "OK" : "MISSING")
})
