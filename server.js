const express = require("express");
const twilio = require("twilio");

const app = express();

app.use(express.urlencoded({ extended: false }));

// test route
app.get("/", (req, res) => {
  res.send("Bookora AI backend running");
});

// incoming call from Twilio
app.post("/incoming-call", (req, res) => {

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  response.say(
    { voice: "alice" },
    "Hello. You have reached Bookora. The AI receptionist is currently being set up. Please try again later."
  );

  res.type("text/xml");
  res.send(response.toString());

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
