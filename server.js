require('dotenv').config(); // .envファイルを読み込む
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs'); // ファイル操作用
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(express.static('public')); // publicフォルダを公開
app.use(cors());

// 1. Cloudinaryの設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. 動画の一時保存先設定（uploadsフォルダ）
const upload = multer({ dest: 'uploads/' });

// 簡易データベース（本番ではちゃんとしたDB推奨ですが、今は配列で代用）
let videos = [];

// -------------------------------------------------
// 機能A: 動画アップロード
// -------------------------------------------------
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const filePath = req.file.path; // 一時保存されたファイルの場所

    // Cloudinaryへアップロード
    // resource_type: 'video' が重要！
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'niconico-clone' // Cloudinary内のフォルダ名
    });

    // 成功したら、サーバー内の一時ファイルを削除（容量節約）
    fs.unlinkSync(filePath);

    // データベース（配列）に保存する情報
    const newVideo = {
      id: Date.now().toString(),       // ID
      title: req.body.title || '無題', // 動画タイトル
      public_id: result.public_id,     // Cloudinary上のID (削除に必要)
      url: result.secure_url,          // 動画のURL
      comments: []                     // コメント用（空っぽで作成）
    };

    videos.push(newVideo); // 配列に追加

    console.log('アップロード成功:', newVideo.title);
    res.json({ success: true, video: newVideo });

  } catch (error) {
    console.error('アップロード失敗:', error);
    res.status(500).json({ success: false, error: 'アップロードに失敗しました' });
  }
});

// -------------------------------------------------
// 機能B: 動画一覧の取得
// -------------------------------------------------
app.get('/videos', (req, res) => {
  res.json(videos);
});

// -------------------------------------------------
// 機能C: 動画の削除
// -------------------------------------------------
app.delete('/videos/:id', async (req, res) => {
  const videoId = req.params.id;
  const videoIndex = videos.findIndex(v => v.id === videoId);

  if (videoIndex === -1) {
    return res.status(404).json({ success: false, message: '動画が見つかりません' });
  }

  const video = videos[videoIndex];

  try {
    // Cloudinaryから削除
    // 動画を消すときは resource_type: 'video' が必須！
    await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });

    // 配列（データベース）からも削除
    videos.splice(videoIndex, 1);

    console.log('削除成功:', video.title);
    res.json({ success: true });

  } catch (error) {
    console.error('削除失敗:', error);
    res.status(500).json({ success: false, error: '削除に失敗しました' });
  }
});

// サーバー起動
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});