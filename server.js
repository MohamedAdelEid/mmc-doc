require('dotenv').config();

const path = require('path');
const express = require('express');
const routes = require('./src/routes');

const app = express();
const port = Number(process.env.PORT || 3847);

app.use(express.json({ limit: '32kb' }));
app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`MMC Doc listening on http://localhost:${port}`);
  console.log(`Phone / LAN: http://<your-pc-ip>:${port}`);
});
