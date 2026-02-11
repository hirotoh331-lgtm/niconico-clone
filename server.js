require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// uploadsフォルダ自動作成（Render対策）
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });
let videos = []; // データ保存用

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// -------------------------------------------------
// 機能A: 動画アップロード（コメント箱を追加！）
// -------------------------------------------------
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'ファイルなし' });

    console.log('Cloudinaryへアップロード中...');
    
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
      comments: [] // ★重要：ここでコメントを入れる場所を作る
    };

    videos.push(newVideo);
    console.log('投稿成功:', newVideo.title);
    res.json({ success: true, video: newVideo });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '失敗しました' });
  }
});

// -------------------------------------------------
// 機能B: 動画一覧取得
// -------------------------------------------------
app.get('/videos', (req, res) => {
  res.json(videos);
});

// -------------------------------------------------
// 機能C: コメント投稿（★新機能！）
// -------------------------------------------------
app.post('/videos/:id/comments', (req, res) => {
  const videoId = req.params.id;
  const text = req.body.text;

  const video = videos.find(v => v.id === videoId);

  if (video && text) {
    video.comments.push(text); // コメントを追加
    console.log(`コメント受信 [${video.title}]: ${text}`);
    res.json({ success: true, comments: video.comments });
  } else {
    res.status(400).json({ success: false });
  }
});

// -------------------------------------------------
// 機能D: 動画の削除（★消さないように維持！）
// -------------------------------------------------
app.delete('/videos/:id', async (req, res) => {
  const videoId = req.params.id;
  const videoIndex = videos.findIndex(v => v.id === videoId);

  if (videoIndex === -1) {
    return res.status(404).json({ success: false, message: '動画が見つかりません' });
  }

  const video = videos[videoIndex];

  try {
    await cloudinary.uploader.destroy(video.public_id, { resource_type: 'video' });
    videos.splice(videoIndex, 1);
    console.log('削除成功:', video.title);
    res.json({ success: true });
  } catch (error) {
    console.error('削除失敗:', error);
    res.status(500).json({ success: false });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});