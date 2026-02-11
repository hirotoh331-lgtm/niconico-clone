require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cors = require('cors');
const http = require('http'); // 追加
const { Server } = require('socket.io'); // 追加

const app = express();
const server = http.createServer(app); // expressをhttpサーバーに紐付け
const io = new Server(server, { cors: { origin: "*" } }); // Socket.io起動
const port = process.env.PORT || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });
let videos = []; 

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// --- Socket.io の接続設定 ---
io.on('connection', (socket) => {
  console.log('ユーザーが接続しました');
});

app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'ファイルなし' });
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'niconico-clone'
    });
    fs.unlinkSync(req.file.path);
    const newVideo = {
      id: Date.now().toString(),
      title: req.body.title || '無題',
      public_id: result.public_id,
      url: result.secure_url,
      thumbnail: result.secure_url.replace('.mp4', '.jpg'),
      comments: [] 
    };
    videos.push(newVideo);
    res.json({ success: true, video: newVideo });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

app.get('/videos', (req, res) => {
  res.json(videos);
});

// --- コメント投稿（リアルタイム配信付き） ---
app.post('/videos/:id/comments', (req, res) => {
  const videoId = req.params.id;
  const text = req.body.text;
  const video = videos.find(v => v.id === videoId);

  if (video && text) {
    video.comments.push(text);
    // ★ここが重要！接続している全員に「誰かがコメントしたよ！」と知らせる
    io.emit('new-comment', { videoId: videoId, text: text });
    res.json({ success: true, comments: video.comments });
  } else {
    res.status(400).json({ success: false });
  }
});

app.delete('/videos/:id', async (req, res) => {
  const videoId = req.params.id;
  const videoIndex = videos.findIndex(v => v.id === videoId);
  if (videoIndex === -1) return res.status(404).json({ success: false });
  const video = videos[videoIndex];
  try {
    await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });
    videos.splice(videoIndex, 1);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// app.listen ではなく server.listen に変える
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});