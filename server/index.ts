import express from 'express'
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import OpenAI from 'openai'

ffmpeg.setFfmpegPath(ffmpegPath as string)

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ===== OpenAI Setup =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== Root Route =====
app.get('/', (req, res) => {
  res.send('🎬 Autovid AI Running')
})

// ===== Storage =====
let jobs: any = {}

// ===== Generate Script =====
async function generateScript(topic: string) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // ✅ safer model
      messages: [
        { role: "system", content: "You are a YouTube script writer" },
        { role: "user", content: `Write a 5 minute YouTube script about ${topic}` }
      ]
    })

    return res.choices[0].message.content || "No script generated"

  } catch (err: any) {
    console.error("🔥 OPENAI ERROR:", err.message)
    throw new Error(err.message || "OpenAI failed")
  }
}

// ===== Generate Video (NO TTS TEMPORARY) =====
async function createVideo(script: string, job_id: string) {
  const audioPath = `audio-${job_id}.mp3`
  const videoPath = `video-${job_id}.mp4`

  // ✅ TEMP: empty audio (avoids TTS errors)
  fs.writeFileSync(audioPath, "")

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(audioPath)
      .inputOptions(['-f lavfi', '-i color=c=black:s=1280x720'])
      .outputOptions([
        '-shortest',
        '-c:v libx264',
        '-c:a aac',
        '-pix_fmt yuv420p'
      ])
      .save(videoPath)
      .on('end', resolve)
      .on('error', reject)
  })

  return videoPath
}

// ===== AUTOPILOT API =====
app.post('/api/autopilot', async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: 'processing' }

  res.json({ job_id })

  try {
    console.log("🎬 Starting job:", job_id)

    const script = await generateScript(topic || "Motivation")
    console.log("✅ Script generated")

    const video = await createVideo(script, job_id)
    console.log("✅ Video created:", video)

    jobs[job_id] = {
      status: 'completed',
      script,
      video_url: `/api/video/${job_id}`
    }

  } catch (e: any) {
    console.error("❌ JOB ERROR:", e.message)

    jobs[job_id] = {
      status: 'failed',
      error: e.message
    }
  }
})

// ===== CHECK JOB =====
app.get('/api/job/:id', (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

// ===== DOWNLOAD VIDEO =====
app.get('/api/video/:id', (req, res) => {
  const file = path.join(process.cwd(), `video-${req.params.id}.mp4`)

  if (!fs.existsSync(file)) {
    return res.status(404).send("Video not found")
  }

  res.sendFile(file)
})

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
