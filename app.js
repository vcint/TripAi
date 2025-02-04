const express = require('express');
const app = express();
const session=require('express-session');
const flash = require('connect-flash');
const path = require('path');
const { HfInference } = require('@huggingface/inference'); 
require('dotenv').config();

// Initialize Hugging Face Inference client
const hf = new HfInference(process.env.HF_API_TOKEN);


app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Body Parser
app.use(express.urlencoded({extended:true}));

app.use(
    session({
        secret:'thisWebsiteISbuiltByVinay',
        resave:false,
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
app.post('/plantrip',async (req, res) => {
    const{
      origin,
      destination,
      departureDate,
      travelDays,
      budget,
      travelComapanion,
    }=req.body;
    console.log(req.body);
    if (!origin || !destination || !departureDate || !travelDays || !budget) {
        req.flash('error', 'Please provide all the required fields.');
        return res.status(400).send("All Fields are Required to Plan the Trip."); 
    }

    try {
        const tripPlan = await generateTripPlan(destination, travelDays, budget, travelComapanion);
        res.send(tripPlan)
    } catch (error) {
        console.error("Error in /plantrip route:", error);
        req.flash('error', 'Error generating trip plan. Please try again.');
        res.status(500).send("Error generating trip plan.");
    }
});

// Function to generate trip plans using GPT-2
async function generateTripPlan(destination, duration,budget,travelComapanion) {
  try {
      const prompt = `Generate a detailed trip plan for ${destination} with ${travelComapanion} for ${duration} days with ${budget}. Include activities, places to visit, and food recommendations.`;
      const response = await hf.textGeneration({
          model: "openai-community/gpt2",
          inputs: prompt,
          parameters: {
              max_length: 1000, 
              temperature: 0.7, 
          },
      });

      return response.generated_text;
  } catch (error) {
      console.error("Error generating trip plan:", error);
      throw new Error("Failed to generate trip plan");
  }
}

// Route to handle trip plan generation
app.post('/generate-trip-plan', async (req, res) => {
  const { destination, duration } = req.body;

  if (!destination || !duration) {
      req.flash('error', 'Please provide both destination and duration.');
      return res.redirect('/');
  }

  try {
      const tripPlan = await generateTripPlan(destination, duration);
      req.flash('success', 'Trip plan generated successfully!');
      res.render('trip-plan', { tripPlan }); 
  } catch (error) {
      req.flash('error', 'Failed to generate trip plan. Please try again.');
      res.redirect('/'); 
  }
});


app.use('/',require('./routes/index'));
//app.use('/auth',require('./routes/auth'));
//app.use('/',require('./routes/api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});