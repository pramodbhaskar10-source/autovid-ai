import express from "express"
import axios from "axios"
import cors from "cors"

const app = express()

app.use(cors())
app.use(express.json())

// health check
app.get("/", (req, res) => {
  res.send("Worker running ✅")
})

// CREATE VIDEO
app.post("/", async (req, res) => {
  try {
    const topic = req.body.topic || "Success mindset"

    const cleanScript = topic
      .replace(/\*\*/g, "")
      .replace(/\n/g, " ")
      .substring(0, 120)

    const response = await axios.post(
      "https://api.json2video.com/v2/movies",
      {
        scenes: [
          {
            elements: [
              {
                type: "text",
                text: cleanScript,
                style: "headline",
                duration: 6
              }
            ]
          }
        ]
      },
      {
        headers: {
          "x-api-key": process.env.JSON2VIDEO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    )

    // ✅ RETURN ONLY PROJECT ID
    res.json({
      project: response.data.project
    })

  } catch (err) {
    console.error(err.response?.data || err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(process.env.PORT || 10000, () => {
  console.log("Worker running 🚀")
})
