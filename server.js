require('dotenv').config(); // ローカル開発用（Renderでは自動無視されます）
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ミドルウェア設定
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // フロントエンド（index.htmlなど）を配信

// アップロード先フォルダの確認と作成
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer設定（動画保存用）
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ★ここが一番重要！MongoDB接続設定（詳細ログ付き）★
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ 【致命的エラー】MONGODB_URI が設定されていません！RenderのEnvironmentを確認してください。");
} else {
    console.log("ℹ️ MongoDBに接続を試みます..."); // パスワードは表示しないので安全
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log("✅ MongoDB接続成功！(Connected)");
    })
    .catch((err) => {
        console.error("❌ MongoDB接続失敗...");
        console.error(err); // エラーの全容を表示
    });

// 動画スキーマ
const videoSchema = new mongoose.Schema({
    title: String,
    url: String,
    comments: [String],
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

// --- APIルート ---

// 全動画取得
app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });
        res.json(videos.map(v => ({
            id: v._id,
            title: v.title,
            url: `/uploads/${path.basename(v.url)}`, // URLを整形
            comments: v.comments
        })));
    } catch (e) {
        console.error("動画リスト取得エラー:", e);
        res.status(500).json({ error: e.message });
    }
});

// 動画アップロード
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('ファイルがありません');
        
        console.log("動画アップロード開始:", req.body.title);

        const newVideo = new Video({
            title: req.body.title || "無題",
            url: req.file.filename, // ファイル名だけ保存
            comments: []
        });
        await newVideo.save();
        
        console.log("動画保存完了！ ID:", newVideo._id);
        res.status(201).json(newVideo);
    } catch (e) {
        console.error("アップロードエラー:", e);
        res.status(500).send(e.message);
    }
});

// 動画削除
app.delete('/videos/:id', async (req, res) => {
    try {
        await Video.findByIdAndDelete(req.params.id);
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// コメント投稿
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