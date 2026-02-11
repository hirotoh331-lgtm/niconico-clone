// DOM要素
const listView = document.getElementById('list-view');
const playerView = document.getElementById('player-view');
const videoList = document.getElementById('video-list');
const videoEl = document.getElementById('main-video');
const commentLayer = document.getElementById('comment-layer');
const goHomeBtn = document.getElementById('go-home-btn');

// 状態管理
let currentVideoId = null;
let comments = []; 

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    fetchVideos();
});

// 動画一覧取得 (URLを修正: /api/videos -> /videos)
async function fetchVideos() {
    const res = await fetch('/videos');
    const videos = await res.json();
    videoList.innerHTML = '';
    videos.forEach(v => {
        const div = document.createElement('div');
        div.className = 'video-card';
        // サーバー側のデータ構造 (title) に合わせる
        div.innerHTML = `<h4>${v.title}</h4>`;
        div.onclick = () => openPlayer(v);
        videoList.appendChild(div);
    });
}

// プレイヤーを開く
async function openPlayer(video) {
    currentVideoId = video.id;
    listView.classList.add('hidden');
    playerView.classList.remove('hidden');
    
    videoEl.src = video.url; // サーバー側のURLを使用
    commentLayer.innerHTML = '';
    
    // コメント取得 (サーバーは動画データの中にcommentsを持っている)
    // 動画一覧を再取得するか、引数のvideoから取得
    comments = video.comments || [];
    
    videoEl.play();
    animationLoop(); 
}

// 一覧に戻る
goHomeBtn.onclick = () => {
    videoEl.pause();
    videoEl.src = '';
    playerView.classList.add('hidden');
    listView.classList.remove('hidden');
    fetchVideos();
};

// アップロード処理 (URLを修正: /api/upload -> /upload)
document.getElementById('upload-btn').onclick = async () => {
    const fileInput = document.getElementById('video-input');
    const titleInput = document.getElementById('title-input'); // タイトル入力欄がある前提
    if (!fileInput.files[0]) return alert('ファイルを選択してください');
    
    const formData = new FormData();
    formData.append('video', fileInput.files[0]);
    formData.append('title', titleInput ? titleInput.value : "無題");
    
    const res = await fetch('/upload', { method: 'POST', body: formData });
    if (res.ok) {
        alert('アップロード完了');
        fileInput.value = '';
        fetchVideos();
    }
};

// コメント投稿処理 (URLと構造を修正)
document.getElementById('send-comment-btn').onclick = async () => {
    const inputEl = document.getElementById('comment-text');
    const text = inputEl.value;
    if (!text || !currentVideoId) return;
    
    // 今のサーバーが受け取れるのは { text: "内容" } という形式
    const body = { text: text };
    
    // URLを修正: /api/comments -> /videos/:id/comments
    const res = await fetch(`/videos/${currentVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    if (res.ok) {
        const data = await res.json();
        // サーバーが返してくれた新しいコメントリストに更新
        comments = data.comments;
        
        // 画面上に流す (仮のコメントオブジェクトを作成)
        spawnComment({
            id: Date.now(),
            text: text,
            position: document.getElementById('comment-position')?.value || 'naka',
            color: document.getElementById('comment-color')?.value || '#ffffff',
            size: document.getElementById('comment-size')?.value || 'm'
        });
        
        inputEl.value = '';
    }
};

// --- コメント描画ロジック (変更なし) ---

function animationLoop() {
    if (playerView.classList.contains('hidden')) return;
    requestAnimationFrame(animationLoop);
    if (videoEl.paused) return;

    // ※流れるタイミングの制御は、本来サーバー側に「何秒目か」を保存する必要がありますが、
    // 今は「送った瞬間に流れる」設定で動かしてみましょう。
}

function spawnComment(c) {
    const el = document.createElement('div');
    el.innerText = c.text;
    el.className = `comment-item size-${c.size} mode-${c.position}`;
    el.style.position = 'absolute';
    el.style.whiteSpace = 'nowrap';
    el.style.color = c.color;
    el.style.fontSize = '24px'; // とりあえず見えるサイズに
    el.style.fontWeight = 'bold';
    el.style.textShadow = '1px 1px 2px #000';
    
    commentLayer.appendChild(el);
    
    if (c.position === 'naka') {
        el.style.left = `${commentLayer.clientWidth}px`;
        const top = Math.random() * (commentLayer.clientHeight - 50);
        el.style.top = `${top}px`;

        // JSでアニメーション移動させる
        let pos = commentLayer.clientWidth;
        const move = () => {
            pos -= 2;
            el.style.left = `${pos}px`;
            if (pos > -el.clientWidth) {
                requestAnimationFrame(move);
            } else {
                el.remove();
            }
        };
        move();
    } else {
        // ue, shita用
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        if (c.position === 'ue') el.style.top = '10px';
        else el.style.bottom = '10px';
        setTimeout(() => el.remove(), 3000);
    }
}