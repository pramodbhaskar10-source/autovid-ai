import axios from "axios"
import express from "express"

const app = express()

app.get("/", (req, res) => {
  res.send("Worker is running ✅")
})

app.listen(10000, () => {
  console.log("Worker server running on port 10000")
})
  const cleanScript = "Success starts in your mind. Stay focused and never give up!"
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
setInterval(() => {
  console.log("Worker alive...")
}, 5000)
