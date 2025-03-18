const Recommendation = require('./models/Recommendation');
const Trip = require('./models/Trip');

async function generateRecommendations(userId, currentCompanion) {
  const userTrips = await Trip.find({ userId, travelCompanion: currentCompanion });
  if (!userTrips.length) return [];

  const sameDest = userTrips.map(t => t.destination);
  const otherUserTrips = await Trip.find({
    destination: { $in: sameDest },
    userId: { $ne: userId },
    travelCompanion: currentCompanion
  });

  const otherUsers = [...new Set(otherUserTrips.map(t => t.userId))];
  const allRecommendations = await Trip.find({
    userId: { $in: otherUsers },
    travelCompanion: currentCompanion,
    destination: { $nin: sameDest }
  });

  const freqMap = {};
  allRecommendations.forEach(t => {
    freqMap[t.destination] = (freqMap[t.destination] || 0) + 1;
  });

  const topDestinations = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dest]) => dest);

  return await Trip.find({ destination: { $in: topDestinations } });
}

module.exports = { generateRecommendations };