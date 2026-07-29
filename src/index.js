/* ============================================
   DigitallyDefined Backend API Server
   ============================================ */
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Quiz results endpoint
app.post('/api/quiz/results', (req, res) => {
  const { answers } = req.body;
  // Calculate superpower from answers
  const counts = {};
  answers.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  let result = 'systems';
  let maxCount = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; result = key; }
  }
  res.json({ superpower: result });
});

// Calculator endpoint
app.post('/api/calculator', (req, res) => {
  const { age, desiredIncome, monthlySavings, hoursPerWeek } = req.body;
  const yearsToRetirement = Math.max(0, 67 - age);
  const savingsAtRetirement = monthlySavings * 12 * yearsToRetirement * 1.06;
  const annualFromSavings = savingsAtRetirement * 0.04;
  const socialSecurity = 18000;
  const traditionalIncome = Math.round((annualFromSavings + socialSecurity) / 12);
  const digitalGap = Math.max(0, desiredIncome - traditionalIncome);
  const hourlyRate = hoursPerWeek <= 5 ? 25 : hoursPerWeek <= 15 ? 40 : 60;
  const monthlyPotential = Math.round(hourlyRate * hoursPerWeek * 4.33);
  
  res.json({
    freedomNumber: desiredIncome,
    traditionalIncome,
    digitalGap,
    monthlyPotential,
    timeline: {
      '3months': Math.round(monthlyPotential * 0.3),
      '6months': Math.round(monthlyPotential * 0.6),
      '12months': Math.round(monthlyPotential * 1.0),
      '24months': Math.round(monthlyPotential * 1.8)
    }
  });
});

// Scorecard endpoint
app.post('/api/scorecard', (req, res) => {
  const { scores } = req.body;
  const weights = { audience: 1, urgency: 1.2, experience: 1, monetization: 1.3, competition: 1.1, scalability: 1.1, passion: 1 };
  let totalWeighted = 0;
  let totalWeight = 0;
  Object.keys(weights).forEach(key => {
    totalWeighted += (scores[key] || 3) * weights[key];
    totalWeight += weights[key];
  });
  const finalScore = Math.round((totalWeighted / totalWeight) * 10);
  res.json({ score: finalScore, maxScore: 50 });
});

// Hermes chat endpoint (proxy to real Hermes API later)
app.post('/api/hermes/chat', (req, res) => {
  const { message, context } = req.body;
  // Placeholder - will connect to Hermes gateway
  res.json({ 
    response: "I've received your message. Hermes AI integration will be connected to the live gateway soon.",
    timestamp: new Date().toISOString()
  });
});

// Dashboard data endpoint
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    users: { total: 247, newThisWeek: 12, growth: 12 },
    quizCompletions: { total: 89, thisWeek: 8, growth: 8 },
    calculatorUses: { total: 156, thisWeek: 15, growth: 15 },
    scorecardRuns: { total: 73, thisWeek: 5, growth: 5 },
    chatSessions: { total: 412, thisWeek: 22, growth: 22 },
    revenue: { mrr: 3240, growth: 18 },
    superpowerDistribution: {
      systems: 34,
      people: 22,
      creative: 28,
      teaching: 16
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`DigitallyDefined API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});