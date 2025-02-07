const express = require('express');
const app = express();
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const replicate = require('replicate');
const Amadeus = require('amadeus');
require('dotenv').config();

// Initialize Amadeus API Client
const amadeus = new Amadeus({
    clientId: process.env.AMADEUS_API_KEY,
    clientSecret: process.env.AMADEUS_API_SECRET,
});

// Initialize Replicate client
const replicateClient = new replicate({
    auth: process.env.REPLICATE_API_TOKEN, // Add your Replicate API token here
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Body Parser
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: 'thisWebsiteISbuiltByVinay',
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

//function to get data form frontend form
app.post('/plantrip', async (req, res) => {
    const {
        origin,
        destination,
        departureDate,
        travelDays,
        budget,
        travelCompanion,
    } = req.body;
    console.log(req.body);

    if (!origin || !destination || !departureDate || !travelDays || !budget || !travelCompanion) {
        req.flash('error', 'Please provide all the required fields.');
        return res.status(400).send("All Fields are Required to Plan the Trip.");
    }

    try {
        

        //const tripPlan = await generateTripPlan(destination, travelDays, budget, travelCompanion);
       // const flightOffers = await getFlightOffers(origin, destination, departureDate);
        const flightOffers = await getFlightOffers(origin, destination, departureDate);
       // res.render('trip', { tripPlan: tripPlan, flightOffers: flightOffers });
       res.render('trip',{flightOffers: flightOffers});
    } catch (error) {
        console.error("Error in /plantrip route:", error);
        req.flash('error', 'Error generating trip plan. Please try again.');
        res.status(500).send("Error generating trip plan.");
    }
});

// Function to generate trip plans using Replicate
async function generateTripPlan(destination, duration, budget, travelCompanion) {
    try {
        const prompt = `Generate detailed a trip plan for ${destination} with ${travelCompanion} for ${duration} days with a ${budget} budget. Include the following: 
                    1. A daily itinerary.`;

        console.log("Received Prompt: ", prompt);

        // Call Replicate API to generate trip plan using meta/meta-llama-3-8b-instruct
        const response = await replicateClient.run(
            "meta/meta-llama-3-8b-instruct", 
            {
                input: { prompt: prompt },
            }
        );

        console.log("Received Response from AI Model: ", response);
        console.log("Type Of Response Recived: ",typeof(response));
        return response; // assuming the response contains a 'text' field with the generated plan
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
            adults: 1, // Default 1 passenger, modify as needed
            max: 5, // Fetch top 5 flight offers
            currencyCode: "INR"
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




// Route to handle trip plan generation

app.use('/', require('./routes/index'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
