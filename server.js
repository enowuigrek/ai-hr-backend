const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Import konfiguracji
const { initializeDatabase } = require('./config/database');
const { configureApp } = require('./config/security');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const performanceMiddleware = require('./middleware/performance');

// Import routes
const chatRoutes = require('./routes/chat');
const sessionRoutes = require('./routes/sessions');
const healthRoutes = require('./routes/health');

const app = express();
const port = process.env.PORT || 3000;

// Inicjalizacja bazy danych
initializeDatabase();

// Konfiguracja bezpieczeństwa i middleware
configureApp(app);

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/', healthRoutes);

// Frontend (React) w produkcji
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
  });
}

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  console.log(`🚀 AI HR Backend running on port ${port}`);
  console.log(`🌐 Frontend integrated and ready!`);
});