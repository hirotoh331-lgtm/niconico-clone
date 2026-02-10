// DOM要素
const listView = document.getElementById('list-view');
const playerView = document.getElementById('player-view');
const videoList = document.getElementById('video-list');
const videoEl = document.getElementById('main-video');
const commentLayer = document.getElementById('comment-layer');
const goHomeBtn = document.getElementById('go-home-btn');

// 状態管理
let currentVideoId = null;
let comments = []; // 現在の動画のコメント全量
let activeComments = []; // 画面上に描画中のコメント

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    fetchVideos();
});

// 動画一覧取得
async function fetchVideos() {
    const res = await fetch('/api/videos');
    const videos = await res.json();
    videoList.innerHTML = '';
    videos.forEach(v => {
        const div = document.createElement('div');
        div.className = 'video-card';
        div.innerHTML = `<h4>${v.originalName}</h4><small>${new Date(v.uploadDate).toLocaleString()}</small>`;
        div.onclick = () => openPlayer(v);
        videoList.appendChild(div);
    });
}

// プレイヤーを開く
async function openPlayer(video) {
    currentVideoId = video.id;
    listView.classList.add('hidden');
    playerView.classList.remove('hidden');
    
    videoEl.src = video.path;
    commentLayer.innerHTML = '';
    
    // コメント取得
    const res = await fetch(`/api/comments/${video.id}`);
    comments = await res.json();
    
    videoEl.play();
    animationLoop(); // アニメーション開始
}

// 一覧に戻る
goHomeBtn.onclick = () => {
    videoEl.pause();
    videoEl.src = '';
    playerView.classList.add('hidden');
    listView.classList.remove('hidden');
    fetchVideos();
};

// アップロード処理
document.getElementById('upload-btn').onclick = async () => {
    const fileInput = document.getElementById('video-input');
    if (!fileInput.files[0]) return alert('ファイルを選択してください');
    
    const formData = new FormData();
    formData.append('video', fileInput.files[0]);
    
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (res.ok) {
        alert('アップロード完了');
        fileInput.value = '';
        fetchVideos();
    }
};

// コメント投稿処理
document.getElementById('send-comment-btn').onclick = async () => {
    const text = document.getElementById('comment-text').value;
    if (!text || !currentVideoId) return;
    
    const body = {
        videoId: currentVideoId,
        text: text,
        vpos: videoEl.currentTime,
        color: document.getElementById('comment-color').value,
        size: document.getElementById('comment-size').value,
        position: document.getElementById('comment-position').value
    };
    
    const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    const newComment = await res.json();
    comments.push(newComment);
    comments.sort((a, b) => a.vpos - b.vpos); // 時間順に再ソート
    
    // 自分のコメントを即時反映（描画用配列に追加）
    spawnComment(newComment);
    
    document.getElementById('comment-text').value = '';
};

// ■■■ コメント描画ロジック（核心部分） ■■■

// アニメーションループ (requestAnimationFrame)
function animationLoop() {
    if (listView.classList.contains('hidden')) {
        requestAnimationFrame(animationLoop);
    }
    
    if (videoEl.paused) return; // 一時停止中は更新しない

    const currentTime = videoEl.currentTime;

    // 1. 新しいコメントの出現チェック
    // 0.1秒以内に再生されるべきコメントを探してDOM生成
    // ※簡易的な実装のため、シークバー移動時の重複防止等は省略しています
    comments.forEach(c => {
        // すでに描画済みでなく、かつ再生時間が今の時間の直近（0.2秒以内）のものを表示
        // ※本来はindex管理が必要ですが、簡易的に「前回フレームとの差分」で判定するのが一般的
        // ここでは「DOMが存在しない」かつ「時間がマッチする」場合に生成します
        if (c.vpos >= currentTime - 0.1 && c.vpos <= currentTime + 0.1) {
            if (!document.getElementById(`c-${c.id}`)) {
                spawnComment(c);
            }
        }
    });

    // 2. 流れるコメントの位置更新
    const runningComments = document.querySelectorAll('.comment-item.mode-naka');
    const containerWidth = commentLayer.clientWidth;
    
    runningComments.forEach(el => {
        // 現在のleft値を取得して減らす
        let currentLeft = parseFloat(el.style.left);
        // 移動速度: コンテナ幅などに応じて調整 (ここでは固定速度)
        const speed = (containerWidth + el.clientWidth) / 240; // 4秒(240フレーム)で横断
        
        const newLeft = currentLeft - speed;
        el.style.left = `${newLeft}px`;
        
        // 画面外に出たら削除
        if (newLeft < -el.clientWidth) {
            el.remove();
        }
    });
    
    // 固定コメントの寿命管理（3秒表示したら消すなど）
    // 今回はCSSアニメーションを使わないため、JSで管理するか、
    // 簡易的に固定コメントは3秒後にremoveするTimeoutをspawn時に仕込みます
}

function spawnComment(c) {
    if (document.getElementById(`c-${c.id}`)) return;

    const el = document.createElement('div');
    el.id = `c-${c.id}`;
    el.innerText = c.text;
    el.className = `comment-item size-${c.size} mode-${c.position}`;
    el.style.color = c.color;
    
    commentLayer.appendChild(el);
    
    // 位置の初期化
    if (c.position === 'naka') {
        el.style.left = `${commentLayer.clientWidth}px`; // 右端スタート
        // 高さのランダム配置（重なり防止の簡易版）
        const top = Math.random() * (commentLayer.clientHeight - 50);
        el.style.top = `${top}px`;
    } else if (c.position === 'ue') {
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.top = '10px';
        setTimeout(() => el.remove(), 3000); // 3秒で消滅
    } else if (c.position === 'shita') {
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.bottom = '10px';
        setTimeout(() => el.remove(), 3000); // 3秒で消滅
    }
}