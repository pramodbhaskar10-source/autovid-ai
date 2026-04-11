import express from "express"
import fs from "fs"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import OpenAI from "openai"

ffmpeg.setFfmpegPath(ffmpegPath)

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("🎬 Worker running")
})

// ===== CREATE VIDEO =====
app.post("/create-video", async (req, res) => {
  const { script, job_id } = req.body

  try {
    // 🎤 TEXT → AUDIO
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: script
    })

    const audioBuffer = Buffer.from(await speech.arrayBuffer())
    fs.writeFileSync(`audio-${job_id}.mp3`, audioBuffer)

    const videoPath = `video-${job_id}.mp4`

    // 🎬 AUDIO → VIDEO
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(`audio-${job_id}.mp3`)
        .inputOptions(["-f lavfi", "-i color=c=black:s=1280x720"])
        .outputOptions([
          "-shortest",
          "-c:v libx264",
          "-c:a aac",
          "-pix_fmt yuv420p"
        ])
        .save(videoPath)
        .on("end", resolve)
        .on("error", reject)
    })

    res.json({ videoPath })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Video generation failed" })
  }
})

app.listen(5000, () => {
  console.log("🚀 Worker running on port 5000")
})
