require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2; // Cloudinary読み込み
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Socket.io設定

// --- Cloudinary設定 ---
// RenderのEnvironment Variablesに設定されている必要があります
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- MongoDB接続（成功した設定を使用） ---
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB接続成功！(Cloudinary版)"))
    .catch(err => console.error("❌ MongoDB接続エラー:", err));

// --- データモデル ---
const videoSchema = new mongoose.Schema({
    title: String,
    public_id: String, // Cloudinary上のID（削除用）
    url: String,       // 動画のURL
    comments: [String],
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

// --- ミドルウェア ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 一時保存用フォルダの作成（Render用）
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
// Multer設定（一時的にサーバーに保存→Cloudinaryへ）
const upload = multer({ dest: 'uploads/' });

// --- APIルート ---

// 1. 動画一覧取得
app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });
        // フロントエンド用にデータを整形
        const formattedVideos = videos.map(v => ({
            id: v._id,
            title: v.title,
            url: v.url, // CloudinaryのURLをそのまま返す
            comments: v.comments
        }));
        res.json(formattedVideos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. 動画アップロード（Cloudinaryへ保存）
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('ファイルがありません');
        
        console.log("Cloudinaryへアップロード中...", req.body.title);

        // Cloudinaryにアップロード
        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'video',
            folder: 'niconico-clone' // Cloudinary内のフォルダ名
        });

        // サーバー内の一時ファイルを削除（これをしないとゴミが溜まる）
        fs.unlinkSync(req.file.path);

        // データベースに情報を保存
        const newVideo = new Video({
            title: req.body.title || "無題",
            public_id: result.public_id,
            url: result.secure_url,
            comments: []
        });
        await newVideo.save();
        
        console.log("保存完了！:", newVideo.title);
        res.status(201).json(newVideo);

    } catch (e) {
        console.error("アップロードエラー:", e);
        res.status(500).send(e.message);
    }
});

// 3. 動画削除
app.delete('/videos/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (video) {
            // Cloudinaryから実体ファイルを削除
            if (video.public_id) {
                await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });
            }
            // データベースから削除
            await Video.findByIdAndDelete(req.params.id);
        }
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// 4. コメント投稿
app.post('/videos/:id/comments', async (req, res) => {
    try {
        const { text } = req.body;
        const video = await Video.findById(req.params.id);
        if (video) {
            video.comments.push(text);
            await video.save();
            
            // Socket.ioで全員に配信
            io.emit('new-comment', { videoId: video._id, text: text });
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Socket.io接続
io.on('connection', (socket) => {
    console.log('ユーザーが接続しました');
});

// サーバー起動
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});