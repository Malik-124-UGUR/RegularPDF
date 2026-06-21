const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// 'public' klasöründeki dosyaları dışarıya aç
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${port}`);
});