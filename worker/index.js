import express from "express"
import axios from "axios"
import cors from "cors"

const app = express()

// ✅ MIDDLEWARE (ORDER MATTERS)
app.use(cors())
app.use(express.json())

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("Worker is running ✅")
})

// ✅ MAIN WORKER API
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

    // ✅ STATUS CHECK ROUTE (THIS FIXES YOUR ERROR)
app.get("/status/:id", async (req, res) => {
  try {
    const id = req.params.id

    const response = await axios.get(
      `https://api.json2video.com/v2/movies/${id}`,
      {
        headers: {
          "x-api-key": process.env.JSON2VIDEO_API_KEY
        }
      }
    )

    res.json(response.data)

  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})
    
    // ✅ IMPORTANT RESPONSE (for frontend)
    res.json({
      success: true,
      project: response.data.project
    })

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

// ✅ KEEP SERVER ALIVE
setInterval(() => {
  console.log("Worker alive...")
}, 5000)

// ✅ START SERVER
app.listen(10000, () => {
  console.log("Worker running on port 10000")
})
