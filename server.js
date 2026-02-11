require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB接続
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB接続成功！(同期機能版)"))
    .catch(err => console.error("❌ MongoDB接続エラー:", err));

// データモデル（時間情報 vpos を含む）
const videoSchema = new mongoose.Schema({
    title: String,
    public_id: String,
    url: String,
    comments: [{
        text: String,
        vpos: Number // 再生時間（秒）
    }],
    createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', videoSchema);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });

// --- APIルート ---

// 1. 動画一覧取得
app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find().sort({ createdAt: -1 });
        res.json(videos.map(v => ({
            id: v._id,
            title: v.title,
            url: v.url,
            comments: v.comments
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. アップロード
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('ファイルなし');
        
        console.log("アップロード開始:", req.body.title);
        
        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'video', folder: 'niconico-clone'
        });
        fs.unlinkSync(req.file.path);
        
        const newVideo = new Video({
            title: req.body.title || "無題",
            public_id: result.public_id,
            url: result.secure_url,
            comments: []
        });
        await newVideo.save();
        
        console.log("保存完了:", newVideo.title);
        res.status(201).json(newVideo);
    } catch (e) {
        console.error("Up Error:", e);
        res.status(500).send(e.message);
    }
});

// 3. 削除
app.delete('/videos/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (video) {
            if (video.public_id) await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });
            await Video.findByIdAndDelete(req.params.id);
        }
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 4. コメント投稿（時間情報対応）
app.post('/videos/:id/comments', async (req, res) => {
    try {
        const { text, vpos } = req.body;
        const video = await Video.findById(req.params.id);
        if (video) {
            const newComment = { text, vpos: Number(vpos) };
            video.comments.push(newComment);
            await video.save();
            
            // Socket.ioで配信
            io.emit('new-comment', { videoId: video._id, text, vpos });
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

io.on('connection', (socket) => console.log('User connected'));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));