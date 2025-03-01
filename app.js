const express = require("express");
const app = express();
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");
const replicate = require("replicate");
const Amadeus = require("amadeus");
const puppeteer = require('puppeteer');
require("dotenv").config();
const util = require("util");
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const { Cashfree } = require("cashfree-pg");

// --- Firebase Admin Initialization ---
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Initialize Amadeus API client
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY,
  clientSecret: process.env.AMADEUS_API_SECRET,
});

// Initialize Replicate client
const replicateClient = new replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

//EJS view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//static files
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Express Session
app.use(
  session({
    secret: "thisWebsiteISbuiltByVinay",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());


app.use((req, res, next) => {
  res.locals.messages = req.flash();

  if (!req.session.user && req.cookies.session) {
    admin
      .auth()
      .verifySessionCookie(req.cookies.session, true)
      .then((decodedClaims) => {
        req.session.user = decodedClaims;
        res.locals.user = decodedClaims;
        next();
      })
      .catch((error) => {
        res.clearCookie("session");
        res.locals.user = null;
        next();
      });
  } else {
    res.locals.user = req.session.user || null;
    next();
  }
});

// Login Page
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken;
  //session expire after 5 days (in milliseconds)
  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  admin
    .auth()
    .createSessionCookie(idToken, { expiresIn })
    .then((sessionCookie) => {
      const options = { maxAge: expiresIn, httpOnly: true, secure: false };
      res.cookie("session", sessionCookie, options);
      res.status(200).json({ status: "success" });
    })
    .catch((error) => {
      console.error("Error creating session cookie:", error);
      res.status(401).send("UNAUTHORIZED REQUEST!");
    });
});

function checkAuth(req, res, next) {
  const sessionCookie = req.cookies.session || "";
  admin
    .auth()
    .verifySessionCookie(sessionCookie, true)
    .then((decodedClaims) => {
      req.user = decodedClaims;
      req.session.user = decodedClaims;
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

app.post("/plantrip", async (req, res) => {
  const { origin, destination, departureDate, travelDays, budget, travelCompanion } = req.body;
  console.log(req.body);

  if (!origin || !destination || !departureDate || !travelDays || !budget || !travelCompanion) {
    req.flash("error", "Please provide all the required fields.");
    return res.status(400).send("All Fields are Required to Plan the Trip.");
  }

  try {
    const flightOffers = await getFlightOffers(origin, destination, departureDate);
    const tripPlan = await generateTripPlan(destination, travelDays, budget, travelCompanion);
    req.session.flightOffers = flightOffers;
    req.session.tripPlan = tripPlan;
    req.session.destination = destination;
    res.render("trip", {
      user: req.user,
      pdfUnlocked: req.session.pdfUnlocked || false,
      flightOffers: flightOffers,
      tripPlan: tripPlan,
      destination: destination,
      CASHFREE_ENV: process.env.CASHFREE_ENV,
      BASE_URL: process.env.BASE_URL
    });
  } catch (error) {
    console.error("Error in /plantrip route:", error);
    req.flash("error", "Error generating trip plan. Please try again.");
    res.status(500).send("Error generating trip plan.");
  }
});

app.get("/trip", checkAuth, (req, res) => {
  res.render("index", {
    user: req.user,
    pdfUnlocked: req.session.pdfUnlocked || false,
    tripPlan: req.session.tripPlan,
    flightOffers: req.session.flightOffers,
    destination: req.session.destination,
    CASHFREE_ENV: process.env.CASHFREE_ENV,
    BASE_URL: process.env.BASE_URL
  });
});

app.get('/', (req, res) => {
  res.render('home');
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.clearCookie('session');
  res.redirect("/");
});

// Create Order 
app.post('/create-cashfree-order', async (req, res) => {
  try {
    const orderRequest = {
      order_id: `order_${Date.now()}`,
      order_amount: 1.00,
      order_currency: "INR",
      customer_details: {
        customer_id: req.session.user?.uid || 'guest',
        customer_phone: req.session.user?.phone || '9999999999'
      },
      order_meta: {
        return_url: `${process.env.BASE_URL}/payment-callback`
      }
    };

    const response = await Cashfree.PGCreateOrder("2023-08-01", orderRequest);
    res.json(response.data);

  } catch (error) {
    console.error('Order Error:', error.response?.data || error);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// Check Payment Status
app.get('/payment-status/:orderId', async (req, res) => {
  try {
    const response = await Cashfree.PGOrderFetchPayments(
      "2023-08-01",
      req.params.orderId
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.message });
  }
});

app.get('/payment-callback', async (req, res) => {
  try {
    const orderId = req.query.order_id;
    const statusResponse = await Cashfree.PGOrderFetchPayments(
      "2023-08-01",
      orderId
    );
    
    const paid = statusResponse.data.some(
      payment => payment.payment_status === "SUCCESS"
    );

    if(paid) {
      req.session.pdfUnlocked = true;
      res.redirect('/trip');
    } else {
      res.redirect('/payment-failed');
    }

  } catch (error) {
    console.error('Callback Error:', error);
    res.redirect('/payment-error');
  }
});

app.post('/cashfree-webhook', express.json(), (req, res) => {
  const signature = req.headers['x-cf-signature'];
  console.log('Webhook Data:', req.body);
  res.sendStatus(200);
});

//Check PDF download is allowed
function checkPdfAccess(req, res, next) {
  if (req.session && req.session.pdfUnlocked) {
    return next();
  }
  return res.status(403).send('You must purchase the PDF download to access this resource.');
}

app.get('/download-pdf', checkAuth, checkPdfAccess, async (req, res) => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const tripPlanUrl = `${req.protocol}://${req.get('host')}/secure-trip-plan?userId=${req.user.uid}`;
    await page.goto(tripPlanUrl, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
    });
    await browser.close();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="MyTripPlan.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF.');
  }
});

app.get('/secure-trip-plan', checkAuth, (req, res) => {
  res.render('trip-pdf', {
    tripPlan: req.session.tripPlan,
    destination: req.session.destination,
    user: req.user
  });
});

//generate trip plans using Replicate
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
      console.log(`--- Day Match ${matchCount} Found ---`);
      const dayNumber = dayMatch[1];
      const dayContent = dayMatch[2];

      const sections = [];
      let sectionMatch;
      while ((sectionMatch = sectionRegex.exec(dayContent)) !== null) {
        const sectionName = sectionMatch[1];
        const sectionActivities = sectionMatch[2].trim();
        sections.push({
          name: sectionName,
          activities: sectionActivities,
        });
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

//get flight offers using Amadeus
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