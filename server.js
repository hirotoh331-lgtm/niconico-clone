// 必要なツールを読み込む
require('dotenv').config(); // Renderで必須の修正
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000; // Renderのポート設定に対応

// Cloudinaryの設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 一時保存の設定
const upload = multer({ dest: 'uploads/' });

// データ保存用（サーバー再起動で消えます）
let videos = [];

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// -------------------------------------------------
// 機能A: 動画アップロード
// -------------------------------------------------
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ファイルがありません' });
    }

    console.log('Cloudinaryへアップロード中...');

    // Cloudinaryへアップロード（フォルダ指定を追加！）
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'niconico-clone' // ★ここが修正ポイント：フォルダを指定
    });

    // 成功したら一時ファイルを削除
    fs.unlinkSync(req.file.path);

    // データを保存
    const newVideo = {
      id: Date.now().toString(),
      title: req.body.title || '無題の動画',
      public_id: result.public_id, // 削除するときに必要
      url: result.secure_url,
      thumbnail: result.secure_url.replace('.mp4', '.jpg') // サムネイルURL
    };

    videos.push(newVideo);

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
// 機能C: 動画の削除（これを残しました！）
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
    await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });

    // リストから削除
    videos.splice(videoIndex, 1);

    console.log('削除成功:', video.title);
    res.json({ success: true });

  } catch (error) {
    console.error('削除失敗:', error);
    res.status(500).json({ success: false, error: '削除に失敗しました' });
  }
});

// サーバー起動
app.listen(port, () => {
  console.log(`サーバーが起動しました！ポート: ${port}`);
});