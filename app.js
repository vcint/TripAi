const express = require("express");
const app = express();
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");
const replicate = require("replicate");
const Amadeus = require("amadeus");
const puppeteer = require('puppeteer');
require("dotenv").config();
const cookieParser = require("cookie-parser");
const { Cashfree } = require("cashfree-pg");
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const axios = require("axios");
const redis = require('redis');
const { generateRecommendations } = require('./recommendations');
const Recommendation = require('./models/Recommendation');
const mongoose = require('mongoose');
const Trip = require('./models/Trip');

const RedisStore = require('connect-redis').default;
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log("MongoDB Connection Error: ", err));

redisClient.connect()
  .then(() => console.log('Redis connected'))
  .catch(err => console.error('Redis connection failed:', err));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY,
  clientSecret: process.env.AMADEUS_API_SECRET,
});

const replicateClient = new replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: "thisWebsiteISbuiltByVinay",
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'session:',
    ttl: 86400
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.messages = req.flash();
  if (req.cookies.firebaseSession && !req.session.user) {
    admin.auth().verifySessionCookie(req.cookies.firebaseSession, true)
      .then((decodedClaims) => {
        req.session.user = decodedClaims;
        res.locals.user = decodedClaims;
        next();
      })
      .catch(() => {
        res.clearCookie("firebaseSession");
        next();
      });
  } else {
    res.locals.user = req.session.user || null;
    next();
  }
});

app.use((req, res, next) => {
  console.log('\n--- New Request ---');
  console.log('URL:', req.originalUrl);
  console.log('Session ID:', req.sessionID);
  console.log('Session State:', {
    pdfUnlocked: req.session.pdfUnlocked,
    destination: req.session.destination,
    user: req.session.user?.uid
  });
  next();
});

app.get("/", (req, res) => res.render('home'));
app.get("/login", (req, res) => res.render("login"));

app.post("/sessionLogin", (req, res) => {
  const idToken = req.body.idToken;
  const expiresIn = 60 * 60 * 24 * 5 * 1000;
  
  admin.auth().createSessionCookie(idToken, { expiresIn })
    .then((sessionCookie) => {
      res.cookie("firebaseSession", sessionCookie, {
        maxAge: expiresIn,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
      });
      res.status(200).json({ status: "success" });
    })
    .catch((error) => {
      console.error("Session error:", error);
      res.status(401).send("UNAUTHORIZED REQUEST!");
    });
});

function checkAuth(req, res, next) {
  if (!res.locals.user) return res.redirect("/login");
  next();
}

app.post("/plantrip", async (req, res) => {
  const { origin, destination, departureDate, travelDays, budget, travelCompanion } = req.body;

  if (!origin || !destination || !departureDate || !travelDays || !budget || !travelCompanion) {
    req.flash("error", "All fields are required");
    return res.redirect("/trip");
  }

  try {
    // Generate trip plan and flight offers
    const [flightOffers, tripPlan] = await Promise.all([
      getFlightOffers(origin, destination, departureDate),
      generateTripPlan(destination, travelDays, budget, travelCompanion)
    ]);

    // Calculate total cost estimate
    const totalCostEstimate = flightOffers.reduce((total, offer) => total + parseFloat(offer.price.total), 0);

    // Save trip data to the database
    const newTrip = new Trip({
      userId: req.session.user.uid, // Assuming user ID is stored in the session
      origin,
      destination,
      budget,
      travelCompanion ,
      travelDates: [departureDate], // Assuming travelDates is an array with departureDate
      responseSummary: JSON.stringify(tripPlan),
      totalCostEstimate
    });

    await newTrip.save();

    // Track user interaction
    const recommendation = new Recommendation({
      userId: req.session.user.uid,
      tripId: newTrip._id,
      destination
    });

    await recommendation.save();

    // Update session with generated data
    req.session.flightOffers = flightOffers;
    req.session.tripPlan = tripPlan;
    req.session.destination = destination;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect("/trip");
      }
      res.render("trip", { 
        user: req.session.user,
        pdfUnlocked: false,
        flightOffers,
        tripPlan,
        destination,
        CASHFREE_ENV: process.env.CASHFREE_ENV,
        BASE_URL: process.env.BASE_URL
      });
    });
  } catch (error) {
    console.error("Planning error:", error);
    req.flash("error", "Failed to generate plan");
    res.redirect("/trip");
  }
});

app.get("/trip", checkAuth, (req, res) => {
  res.render("index");
});

app.get('/trending-destinations', async (req, res) => {
  try {
    const trendingDestinations = await Trip.aggregate([
      { $group: { _id: "$destination", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    res.json(trendingDestinations);
  } catch (error) {
    console.error("Error fetching trending destinations:", error);
    res.status(500).json({ error: "Failed to fetch trending destinations" });
  }
});

app.get('/my-trips', checkAuth, async (req, res) => {
  try {
    const userId = req.session.user.uid;
    const trips = await Trip.find({ userId });
    const currentCompanion = trips[0]?.travelCompanion || 'solo';
    const recommendations = await generateRecommendations(userId, currentCompanion);
res.render('my-trips', { trips, recommendations });
  } catch (error) {
    console.error('Error fetching trips:', error);
    req.flash('error', 'Failed to fetch trips');
    res.redirect('/');
  }
});

app.get('/trip/:id', checkAuth, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      req.flash('error', 'Trip not found');
      return res.redirect('/my-trips');
    }
    res.render('trip-details', { trip });
  } catch (error) {
    console.error('Error fetching trip details:', error);
    req.flash('error', 'Failed to fetch trip details');
    res.redirect('/my-trips');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('session');
  res.clearCookie('connect.sid');
  res.clearCookie('firebaseSession');
  res.redirect('/');
});

app.post('/create-cashfree-order', async (req, res) => {
  try {
    const orderId = `order_${Date.now()}`;
    
    const orderRequest = {
      order_id: orderId,
      order_amount: 1.00,
      order_currency: "INR",
      customer_details: {
        customer_id: req.session.user?.uid || 'guest',
        customer_phone: req.session.user?.phone || '9999999999'
      },
      order_meta: {
        return_url: `${process.env.BASE_URL}/payment-callback?order_id=${orderId}`
      }
    };

    const response = await Cashfree.PGCreateOrder("2023-08-01", orderRequest);
    res.json(response.data);

  } catch (error) {
    console.error('Order Error:', error);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

app.get("/plantrip", checkAuth, (req, res) => {
  if (!req.session.tripPlan || !req.session.flightOffers) {
    req.flash("error", "No trip plan found");
    return res.redirect("/trip");
  }
  res.render("trip", {
    user: req.session.user,
    pdfUnlocked: req.session.pdfUnlocked || false,
    flightOffers: req.session.flightOffers,
    tripPlan: req.session.tripPlan,
    destination: req.session.destination,
    CASHFREE_ENV: process.env.CASHFREE_ENV,
    BASE_URL: process.env.BASE_URL
  });
});
app.get('/payment-callback', async (req, res) => {
  try {
    const orderId = req.query.order_id;
    if (!orderId) throw new Error('Missing order ID');

    const originalSession = {
      user: req.session.user,
      destination: req.session.destination,
      tripPlan: req.session.tripPlan,
      flightOffers: req.session.flightOffers
    };

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    req.session.user = originalSession.user;
    req.session.destination = originalSession.destination;
    req.session.tripPlan = originalSession.tripPlan;
    req.session.flightOffers = originalSession.flightOffers;

    const statusResponse = await Cashfree.PGOrderFetchPayments("2023-08-01", orderId);
    const paymentSuccess = statusResponse.data?.some(p => p.payment_status === "SUCCESS");

    if (paymentSuccess) {
      req.session.pdfUnlocked = true;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      return res.redirect(`${process.env.BASE_URL}/plantrip`);
    }

    res.redirect('/payment-failed');
  } catch (error) {
    console.error('Payment callback error:', error);
    req.session.destroy();
    res.clearCookie('session');
    res.redirect(`/payment-error?message=${encodeURIComponent(error.message)}`);
  }
});

app.post('/reset-pdf-access', (req, res) => {
  req.session.pdfUnlocked = false;
  res.sendStatus(200);
});

app.get("/download-pdf", checkAuth, async (req, res) => {
  let browser;
  try {
    if (!req.session.pdfUnlocked) return res.status(403).send("Payment verification required");
    if (!req.session.tripPlan || !req.session.destination) return res.status(400).send("Trip plan data missing");

    const sessionCookie = req.cookies['connect.sid'];
    if (!sessionCookie) return res.status(401).send("Missing session cookie");

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      timeout: 60000
    });

    const page = await browser.newPage();
    const domain = new URL(process.env.BASE_URL).hostname;

    await page.setCookie({
      name: "connect.sid",
      value: sessionCookie,
      domain: domain,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax"
    });

    const pdfUrl = `${process.env.BASE_URL}/secure-trip-plan`;
    await page.goto(pdfUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" }
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=TripPlan.pdf",
      "Content-Length": pdfBuffer.length,
      "Cache-Control": "no-store"
    });

    res.end(pdfBuffer);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).send(`Failed to generate PDF: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/secure-trip-plan', checkAuth, (req, res) => {
  try {
    if (!req.session.pdfUnlocked) throw new Error('PDF access not unlocked');
    if (!req.session.tripPlan || !req.session.destination) throw new Error('Missing trip plan data');
    
    res.render('trip-pdf', {
      tripPlan: req.session.tripPlan,
      destination: req.session.destination,
      user: req.user,
      layout: false
    });
  } catch (error) {
    console.error('Secure Trip Plan Error:', error);
    res.status(500).send('Could not generate PDF content');
  }
});

async function generateTripPlan(destination, duration, budget, travelCompanion) {
  try {
    const prompt = `Generate a detailed ${duration}-day trip plan for ${destination} with ${travelCompanion} and with a ${budget} budget. Include specific details like transportation, accommodation, and activities. Provide a step-by-step plan for each day, including times and locations.\n\n**Instructions:**\n* Use <day day="N"> tags for each day.\n* Within each <day>, use <section name="Section Name"> tags.\n* Describe activities in plain text within <section> tags.\n* No extra whitespace or line breaks within tags.\n\n`;

    const response = await replicateClient.run("meta/meta-llama-3-8b-instruct", {
      input: { prompt: prompt, max_tokens: 9600 },
    });

    if (!response || !Array.isArray(response)) throw new Error('Invalid API response');

    const tripPlanText = response.join("").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const processedText = tripPlanText
      .replace(/```/g, "")
      .replace(/\s*<day/g, "<day")
      .replace(/<\/day>\s*/g, "</day>")
      .replace(/\s*<section/g, "<section")
      .replace(/<\/section>\s*/g, "</section>");

    const dayRegex = /<day day="(\d+)">(.*?)<\/day>/gs;
    const sectionRegex = /<section name="([^"]+)">(.*?)<\/section>/gs;
    const days = [];

    let dayMatch;
    while ((dayMatch = dayRegex.exec(processedText)) !== null) {
      const dayNumber = dayMatch[1];
      const dayContent = dayMatch[2];
      const sections = [];

      let sectionMatch;
      while ((sectionMatch = sectionRegex.exec(dayContent)) !== null) {
        sections.push({
          name: sectionMatch[1],
          activities: sectionMatch[2].trim()
        });
      }

      days.push({
        day: dayNumber,
        sections: sections
      });
    }

    return days;
  } catch (error) {
    console.error("Plan generation error:", error);
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
    return response.data || [];
  } catch (error) {
    console.error("Flight error:", error);
    return [];
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});