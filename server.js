const express = require("express");
const twilio = require("twilio");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// enkel minne-lagring per samtale
const sessions = new Map();

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, []);
  }
  return sessions.get(callSid);
}

function addToSession(callSid, role, text) {
  const session = getSession(callSid);
  session.push({ role, text });

  // hold bare de siste 10 meldingene
  if (session.length > 10) {
    session.splice(0, session.length - 10);
  }
}

function buildPrompt(history, latestUserMessage) {
  const historyText = history
    .map((m) => `${m.role === "user" ? "KUNDE" : "BOOKORA"}: ${m.text}`)
    .join("\n");

  return `
Du er Bookora, en norsk AI-resepsjonist for en frisørsalong.

Regler:
- Svar alltid på norsk, med mindre innringeren tydelig snakker engelsk.
- Snakk kort, naturlig, varm og profesjonell.
- Høres ut som en ekte resepsjonist, ikke en robot.
- Still bare ett spørsmål om gangen.
- Hjelp med booking, avbestilling, flytting av time og enkle spørsmål.
- Ikke finn opp priser, åpningstider eller regler hvis du ikke vet.
- Hvis noe er uklart eller komplisert, si at salongen følger opp.
- Hold svarene korte nok til telefon.
- Ikke bruk punktlister.
- Ikke bruk emojis.
- Ikke si at du er en språkmodell.

Her er samtalehistorikken så langt:
${historyText}

Siste melding fra kunden:
KUNDE: ${latestUserMessage}

Svar som Bookora:
  `.trim();
}

function sayAndGather(response, text) {
  const gather = response.gather({
    input: ["speech"],
    action: "/process-speech",
    method: "POST",
    language: "nb-NO",
    speechTimeout: "auto"
  });

  // Twilio støtter TTS med språk-overstyring, og Amazon Polly har norske stemmer
  // som Liv og Ida i nb-NO. Denne prøver Liv for en mer naturlig norsk stemme.
  gather.say(
    {
      voice: "Polly.Liv",
      language: "nb-NO"
    },
    text
  );

  response.redirect({ method: "POST" }, "/incoming-call");
}

app.get("/", (req, res) => {
  res.send("Bookora AI backend running");
});

app.post("/incoming-call", (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown";
  sessions.set(callSid, []);

  sayAndGather(
    response,
    "Hei, du har kommet til Bookora, den AI-drevne resepsjonisten. Hvordan kan jeg hjelpe deg i dag?"
  );

  res.type("text/xml");
  res.send(response.toString());
});

app.post("/process-speech", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const callSid = req.body.CallSid || "unknown";
  const speechResult = (req.body.SpeechResult || "").trim();
  const confidence = req.body.Confidence;

  try {
    if (!speechResult) {
      sayAndGather(
        response,
        "Beklager, jeg fikk ikke helt med meg det. Kan du prøve en gang til?"
      );
      res.type("text/xml");
      return res.send(response.toString());
    }

    addToSession(callSid, "user", speechResult);

    const session = getSession(callSid);
    const prompt = buildPrompt(session, speechResult);

    const aiResponse = await client.responses.create({
      model: "gpt-5.4",
      input: prompt
    });

    const answer =
      (aiResponse.output_text || "").trim() ||
      "Beklager, jeg fikk ikke til å svare akkurat nå. Salongen følger opp senere.";

    addToSession(callSid, "assistant", answer);

    // hvis kunden vil avslutte
    const lower = speechResult.toLowerCase();
    if (
      lower.includes("ha det") ||
      lower.includes("farvel") ||
      lower.includes("takk det var alt") ||
      lower.includes("nei takk")
    ) {
      response.say(
        {
          voice: "Polly.Liv",
          language: "nb-NO"
        },
        "Takk for samtalen. Ha en fin dag."
      );
      response.hangup();

      res.type("text/xml");
      return res.send(response.toString());
    }

    sayAndGather(response, answer);

    res.type("text/xml");
    res.send(response.toString());
  } catch (error) {
    console.error("OpenAI/Twilio error:", error);

    response.say(
      {
        voice: "Polly.Liv",
        language: "nb-NO"
      },
      "Beklager, det oppstod en feil. Salongen følger opp senere."
    );
    response.hangup();

    res.type("text/xml");
    res.send(response.toString());
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
