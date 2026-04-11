import OpenAI from "openai"
import axios from "axios"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function generateScript(topic) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube script writer" },
      { role: "user", content: `Write a short script about ${topic}` }
    ]
  })

  return res.choices[0].message.content
}

async function generateVideo(script) {
  const response = await axios.post(
    "https://api.json2video.com/v2/movies",
    {
      scenes: [
        {
          elements: [
            {
              type: "text",
              text: script
            }
          ]
        }
      ]
    },
    {
      headers: {
        "x-api-key": process.env.JSON2VIDEO_API_KEY
      }
    }
  )

  return response.data
}

// TEST RUN (worker execution)
async function run() {
  try {
    console.log("🚀 Worker started")

    const script = await generateScript("Success mindset")
    console.log("✅ Script:", script.substring(0, 50))

    const video = await generateVideo(script)
    console.log("🎬 Video created:", video)

  } catch (err) {
    console.error("❌ Worker error:", err.message)
  }
}

run()
