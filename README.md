# 🌍 TripAi – AI-Powered Trip Itinerary Generator

[![Live Demo](https://img.shields.io/badge/Live-Demo-green)](https://tripai25.onrender.com)
![Meta Llama 3.8B Instruct](https://img.shields.io/badge/AI_Model-Meta%20Llama%203.8B%20Instruct-blueviolet?logo=openai&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4ea94b?logo=mongodb&logoColor=white)



TripAi is a powerful AI-based travel planning web application that helps users effortlessly generate customised trip itineraries. By leveraging Meta’s Llama 3.8B Instruct model and integrating real-time data from Amadeus APIs, TripAi delivers intelligent and practical trip suggestions – including flights, hotels, and personalised activities.

---

## ✨ Features

- ✈️ **Smart Trip Planner** : Enter origin, destination, dates, budget, and partners to get a tailored itinerary.
- 🧠 **AI-Generated Plans** : Powered by Meta Llama 3.8B Instruct for context-aware travel suggestions.
- 🏨 **Real-Time Flights & Hotels** : View flights and hotel availability via the Amadeus API.
- 📥 **Download as PDF** : Export your travel plan after a nominal fee using Cashfree Payment Gateway.
- 📊 **Recommendations Engine** : Suggests trips based on historical travel data.
- 🔒 **Firebase Auth** : Secure sign-in system for user-specific planning and downloads.
- 💾 **MongoDB + Redis** : Persistent storage for user plans and caching for performance.

---

## 🧪 Tech Stack

| Tech | Purpose |
|------|---------|
| **Node.js + Express** | Backend server and routing |
| **EJS** | Server-side templating |
| **Bootstrap** | Responsive UI design |
| **MongoDB + Redis** | Database + caching layer |
| **Firebase Auth** | Authentication system |
| **Puppeteer** | HTML-to-PDF conversion |
| **Meta Llama 3.8B Instruct** | Natural language trip planning |
| **Amadeus API** | Flights and hotels integration |
| **Cashfree API** | Payment gateway integration |

---

## 🚀 Live Site

🔗 [TripAi Live on Render](https://tripai25.onrender.com)

---

## 🛠️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/tripai.git
   cd tripai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup `.env` file:**
   Create a `.env` file in the root directory and add the following:

   ```env
   SESSION_SECRET=your_Session_SECRET
   MONGO_URI=your_mongodb_connection_string
   REDIS_URL=your_redis_url
   REDIS_USER=
   REDIS_PASSWORD=
   FIREBASE_CONFIG=your_firebase_config_json
   LLM_API_KEY=your_meta_llama_api_key
   AMADEUS_API_KEY=your_amadeus_key
   AMADEUS_API_SECRET=your_amadeus_secret
   CASHFREE_APP_ID=your_cashfree_app_id
   CASHFREE_SECRET_KEY=your_cashfree_secret
   CASHFREE_ENV=
   BASE_URL=
   XEnvironment=
   FIREBASE_SERVICE_ACCOUNT=
   ```

4. **Start the server:**
   ```bash
   node app.js
   ```

5. Visit `http://localhost:3000` to start using TripAi locally.

---

## 📸 Screenshots

![tripAi Img](./TripAi.jpg)

---

## 🧑‍💻 Contributors

- [Vinay Chitade](https://github.com/vcint)

---

## 📄 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
