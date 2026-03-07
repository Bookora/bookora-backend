const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bookora AI backend running");
});

app.post("/incoming-call", (req, res) => {
  res.send(`
<Response>
  <Say>Hello, this is Bookora AI receptionist.</Say>
</Response>
`);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
