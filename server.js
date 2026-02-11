require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose'); // ★追加：データベース操作用

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const port = process.env.PORT || 3000;

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB接続（★ここが新しい！）
// データベースへの接続を開始します
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDBに接続成功！'))
  .catch(err => console.error('❌ MongoDB接続エラー:', err));

// データの設計図（スキーマ）を作成
const videoSchema = new mongoose.Schema({
  title: String,
  public_id: String,
  url: String,
  thumbnail: String,
  comments: [String], // コメントは文字のリスト
  createdAt: { type: Date, default: Date.now } // 投稿日時
});

// モデル（実体）を作成
const Video = mongoose.model('Video', videoSchema);

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// --- Socket.io 接続 ---
io.on('connection', (socket) => {
  console.log('ユーザーが接続しました');
});

// --- 機能A: 動画アップロード ---
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'ファイルなし' });

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'niconico-clone'
    });

    fs.unlinkSync(req.file.path);

    // ★データベースに保存
    const newVideo = new Video({
      title: req.body.title || '無題',
      public_id: result.public_id,
      url: result.secure_url,
      thumbnail: result.secure_url.replace('.mp4', '.jpg'),
      comments: []
    });

    await newVideo.save(); // 保存実行！

    console.log('投稿成功:', newVideo.title);
    res.json({ success: true, video: newVideo });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

// --- 機能B: 動画一覧取得 ---
app.get('/videos', async (req, res) => {
  // ★データベースから全件取得（新しい順）
  const videos = await Video.find().sort({ createdAt: -1 });
  // id という名前で使えるように変換して返す
  const formattedVideos = videos.map(v => ({
    id: v._id, // MongoDBのIDは _id なので変換
    title: v.title,
    url: v.url,
    comments: v.comments
  }));
  res.json(formattedVideos);
});

// --- 機能C: コメント投稿 ---
app.post('/videos/:id/comments', async (req, res) => {
  const { text } = req.body;
  
  try {
    // ★データベースの動画を探してコメント追加
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false });

    video.comments.push(text);
    await video.save(); // 保存！

    // 全員に通知
    io.emit('new-comment', { videoId: req.params.id, text: text });
    
    res.json({ success: true, comments: video.comments });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- 機能D: 動画の削除 ---
app.delete('/videos/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false });

    // Cloudinaryから削除
    await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });
    
    // ★データベースから削除
    await Video.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});