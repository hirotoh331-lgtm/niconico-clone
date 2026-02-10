const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

// --- ここが修正ポイント: 上にあった const PORT = 3000; を削除しました ---

// ミドルウェア設定
app.use(express.json());
app.use(express.static('public')); // フロントエンドを配信
app.use('/uploads', express.static('uploads')); // アップロードされた動画を配信

// データ保存用ディレクトリの準備
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// フォルダがなければ作成
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// JSONファイルのパス定義
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');

// JSONファイルの初期化（なければ作る）
if (!fs.existsSync(COMMENTS_FILE)) fs.writeFileSync(COMMENTS_FILE, '{}'); // コメントはオブジェクト形式
if (!fs.existsSync(VIDEOS_FILE)) fs.writeFileSync(VIDEOS_FILE, '[]');     // 動画は配列形式

// Multer設定（動画アップロード用）
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// API: 動画一覧取得
app.get('/api/videos', (req, res) => {
    try {
        const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE));
        res.json(videos);
    } catch (e) {
        res.json([]);
    }
});

// API: 動画アップロード
app.post('/api/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    
    // 動画リストの更新
    const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE));
    const newVideo = {
        id: req.file.filename,
        originalName: req.file.originalname,
        path: `/uploads/${req.file.filename}`, // URLとしてアクセスするパス
        uploadDate: new Date()
    };
    videos.push(newVideo);
    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videos, null, 2));
    
    // この動画用のコメント配列を初期化
    const comments = JSON.parse(fs.readFileSync(COMMENTS_FILE));
    comments[newVideo.id] = [];
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));

    res.json(newVideo);
});

// API: コメント取得
app.get('/api/comments/:videoId', (req, res) => {
    try {
        const commentsData = JSON.parse(fs.readFileSync(COMMENTS_FILE));
        const list = commentsData[req.params.videoId] || [];
        // 再生時間順にソートして返す
        list.sort((a, b) => a.vpos - b.vpos);
        res.json(list);
    } catch (e) {
        res.json([]);
    }
});

// API: コメント投稿
app.post('/api/comments', (req, res) => {
    const { videoId, text, vpos, color, size, position } = req.body;
    const commentsData = JSON.parse(fs.readFileSync(COMMENTS_FILE));
    
    if (!commentsData[videoId]) commentsData[videoId] = [];
    
    const newComment = {
        id: Date.now(),
        text,
        vpos: parseFloat(vpos), // 動画内の再生時間(秒)
        color,
        size,
        position, // 'naka'(流れる), 'ue'(上), 'shita'(下)
        date: new Date()
    };
    
    commentsData[videoId].push(newComment);
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(commentsData, null, 2));
    
    res.json(newComment);
});

// --- サーバー起動設定 ---
const PORT = process.env.PORT || 3000; // Render環境のポート、なければ3000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});