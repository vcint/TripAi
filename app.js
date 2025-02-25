const express = require("express");
const app = express();
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");
const replicate = require("replicate");
const Amadeus = require("amadeus");
require("dotenv").config();
const util = require("util");
const cookieParser = require("cookie-parser");

// --- Firebase Admin Initialization ---
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY,
  clientSecret: process.env.AMADEUS_API_SECRET,
});

const replicateClient = new replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieParser());

// Express Session and Flash
app.use(
  session({
    secret: "thisWebsiteISbuiltByVinay",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// Global Variables Middleware
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  res.locals.user = req.session.user || null;
  next();
});

app.get("/login", (req, res) => {
  res.render("login");
});

// Create a session cookie after the client sends the Firebase ID token
app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken;
  // Set session expiration to 5 days (in milliseconds)
  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  admin
    .auth()
    .createSessionCookie(idToken, { expiresIn })
    .then((sessionCookie) => {
      //at time of deployment do secure=true
      const options = { maxAge: expiresIn, httpOnly: true, secure: false };
      res.cookie("session", sessionCookie, options);
      res.status(200).json({ status: "success" });
    })
    .catch((error) => {
      console.error("Error creating session cookie:", error);
      res.status(401).send("UNAUTHORIZED REQUEST!");
    });
});

// Middleware to check the Firebase session cookie
function checkAuth(req, res, next) {
  const sessionCookie = req.cookies.session || "";
  admin
    .auth()
    .verifySessionCookie(sessionCookie, true)
    .then((decodedClaims) => {
      req.user = decodedClaims;
      res.locals.user = decodedClaims;
      next();
    })
    .catch((error) => {
      res.redirect("/login");
    });
}

app.get("/plantrip", checkAuth, (req, res) => {
  res.render("plantrip", { user: req.user });
});
app.get("/trip", checkAuth, (req, res) => {
  res.render("index",{user:req.user});
});
app.get('/', (req, res) => {
  res.render('home');
});
app.get("/logout", (req,res)=>{
    req.session.destroy();
    res.clearCookie('session');
    res.redirect("/");
});

// Route to handle trip planning form submission
app.post("/plantrip",async (req, res) => {
  const { origin, destination, departureDate, travelDays, budget, travelCompanion } = req.body;
  console.log(req.body);

  if (!origin || !destination || !departureDate || !travelDays || !budget || !travelCompanion) {
    req.flash("error", "Please provide all the required fields.");
    return res.status(400).send("All Fields are Required to Plan the Trip.");
  }

  try {
    const flightOffers = await getFlightOffers(origin, destination, departureDate);
    const tripPlan = await generateTripPlan(destination, travelDays, budget, travelCompanion);

    res.render("trip", {
      flightOffers: flightOffers,
      tripPlan: tripPlan,
      destination: destination,
    });
  } catch (error) {
    console.error("Error in /plantrip route:", error);
    req.flash("error", "Error generating trip plan. Please try again.");
    res.status(500).send("Error generating trip plan.");
  }
});

// Function to generate trip plans using Replicate
async function generateTripPlan(destination, duration, budget, travelCompanion) {
  try {
    const prompt =
      `Generate a detailed ${duration}day trip plan for ${destination} with ${travelCompanion} and with a ${budget} budget. \n\n` +
      "**Instructions:**\n" +
      '* Use `<day day="N">` tags for each day.\n' +
      '* Within each `<day>`, use `<section name="Section Name">` tags.\n' +
      "* Describe activities in plain text within `<section>` tags.\n" +
      "* **No extra whitespace or line breaks within tags.**\n\n";

    console.log("Received Prompt: ", prompt);

    const response = await replicateClient.run("meta/meta-llama-3-8b-instruct", {
      input: { prompt: prompt, max_tokens: 9600 },
    });

    const tripPlanTextArray = response;
    let tripPlanText = tripPlanTextArray.join("");
    tripPlanText = tripPlanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    console.log(tripPlanText);

    let preProcessedTripPlanText = tripPlanText;
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/```/g, "");
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/\s*<day/g, "<day");
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/<\/day>\s*/g, "</day>");
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/\s*<section/g, "<section");
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/<\/section>\s*/g, "</section>");
    preProcessedTripPlanText = preProcessedTripPlanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (!tripPlanText || tripPlanText.trim() === "") {
      console.warn("AI model returned empty trip plan text.");
      return [];
    }

    const dayRegex = /\s*<day day="(\d+)">(.*?)<\/day>/gs;
    const sectionRegex = /<section name="([^"]+)">(.*?)<\/section>/gs;

    const days = [];
    let dayMatch;
    let matchCount = 0;

    while ((dayMatch = dayRegex.exec(preProcessedTripPlanText)) !== null) {
      matchCount++;
      console.log(`  --- Day Match ${matchCount} Found ---`);
      const dayNumber = dayMatch[1];
      const dayContent = dayMatch[2];

      console.log("  Day Number:", dayNumber);
      console.log("  Day Content:", dayContent);

      const sections = [];
      let sectionMatch;
      while ((sectionMatch = sectionRegex.exec(dayContent)) !== null) {
        const sectionName = sectionMatch[1];
        const sectionActivities = sectionMatch[2].trim();

        sections.push({
          name: sectionName,
          activities: sectionActivities,
        });
        console.log(`    --- Section Found: ${sectionName} ---`);
        console.log("      Section Name:", sectionName);
        console.log("      Section Activities:", sectionActivities);
      }

      days.push({
        day: dayNumber,
        sections: sections,
      });
    }
    return days;
  } catch (error) {
    console.error("Error generating trip plan:", error);
    throw new Error("Failed to generate trip plan");
  }
}

async function getFlightOffers(origin, destination, departureDate) {
  try {
    const response = await amadeus.shopping.flightOffersSearch.get({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: departureDate,
      travelClass: "ECONOMY",
      adults: 1,
      max: 5,
      currencyCode: "INR",
    });

    if (!response?.data || response.data.length === 0) {
      console.warn("No flight offers found for the given criteria.");
      return [];
    }

    return response.data;
  } catch (error) {
    console.error("Error fetching flight offers:", error.response?.result || error.message);
    return { error: "Failed to fetch flight offers. Please try again later." };
  }
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
