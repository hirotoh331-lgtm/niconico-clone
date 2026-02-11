const listView = document.getElementById('list-view');
const playerView = document.getElementById('player-view');
const videoList = document.getElementById('video-list');
const videoEl = document.getElementById('main-video');
const commentLayer = document.getElementById('comment-layer');
const goHomeBtn = document.getElementById('go-home-btn');
const statusText = document.getElementById('status');

let currentVideoId = null;

// 初期読み込み
document.addEventListener('DOMContentLoaded', fetchVideos);

// 動画一覧取得
async function fetchVideos() {
    const res = await fetch('/videos');
    const videos = await res.json();
    videoList.innerHTML = '';
    videos.forEach(v => {
        const div = document.createElement('div');
        div.className = 'video-card';
        div.innerHTML = `
            <span onclick="openPlayer('${v.id}', '${v.title}', '${v.url}')">▶ ${v.title}</span>
            <button class="delete-btn" onclick="deleteVideo('${v.id}')">削除</button>
        `;
        videoList.appendChild(div);
    });
}

// プレイヤーを開く
function openPlayer(id, title, url) {
    currentVideoId = id;
    listView.classList.add('hidden');
    playerView.classList.remove('hidden');
    document.getElementById('current-video-title').innerText = title;
    videoEl.src = url;
    videoEl.play();
}

// 戻る
goHomeBtn.onclick = () => {
    videoEl.pause();
    playerView.classList.add('hidden');
    listView.classList.remove('hidden');
    fetchVideos();
};

// アップロード
document.getElementById('upload-btn').onclick = async () => {
    const file = document.getElementById('video-input').files[0];
    const title = document.getElementById('title-input').value;
    if (!file) return alert('ファイルを選択してください');

    statusText.innerText = "アップロード中...";
    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', title || "無題");

    const res = await fetch('/upload', { method: 'POST', body: formData });
    if (res.ok) {
        statusText.innerText = "完了！";
        fetchVideos();
    } else {
        statusText.innerText = "失敗しました";
    }
};

// コメント送信
async function sendComment() {
    const inputEl = document.getElementById('comment-text');
    const text = inputEl.value;
    if (!text || !currentVideoId) return;

    // 画面に流す（先行反映）
    spawnComment(text);

    // サーバーに保存
    await fetch(`/videos/${currentVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
    });

    inputEl.value = '';
}

document.getElementById('send-comment-btn').onclick = sendComment;
document.getElementById('comment-text').onkeypress = (e) => { if(e.key === 'Enter') sendComment(); };

// 動画から削除
async function deleteVideo(id) {
    if (!confirm("本当に削除しますか？")) return;
    await fetch(`/videos/${id}`, { method: 'DELETE' });
    fetchVideos();
}

// コメントを右から左へ流す
function spawnComment(text) {
    const el = document.createElement('div');
    el.innerText = text;
    el.className = 'comment-item';
    
    // ランダムな高さに配置
    const top = Math.random() * (commentLayer.clientHeight - 40);
    el.style.top = `${top}px`;
    el.style.left = `${commentLayer.clientWidth}px`;
    
    commentLayer.appendChild(el);

    let pos = commentLayer.clientWidth;
    function move() {
        pos -= 3; // スピード
        el.style.left = `${pos}px`;
        if (pos > -el.clientWidth) {
            requestAnimationFrame(move);
        } else {
            el.remove();
        }
    }
    move();
}