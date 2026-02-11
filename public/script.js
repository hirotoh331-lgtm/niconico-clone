const listView = document.getElementById('list-view');
const playerView = document.getElementById('player-view');
const videoList = document.getElementById('video-list');
const videoEl = document.getElementById('main-video');
const commentLayer = document.getElementById('comment-layer');
const goHomeBtn = document.getElementById('go-home-btn');
const statusText = document.getElementById('status');

let currentVideoId = null;
let currentComments = []; // 現在の動画の全コメントデータ
let lastPlayedTime = 0;   // 直前にチェックした時間
let socket = null;

if (typeof io !== 'undefined') {
    socket = io();
    socket.on('new-comment', (data) => {
        if (data.videoId === currentVideoId) {
            // 新着コメントをリストに追加
            currentComments.push({ text: data.text, vpos: data.vpos });
            // もし今の再生時間と近ければ、即座に流す
            if (Math.abs(videoEl.currentTime - data.vpos) < 1) {
                spawnComment(data.text);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', fetchVideos);

// --- 動画の時間を監視してコメントを流す（最重要機能） ---
videoEl.ontimeupdate = () => {
    const currentTime = videoEl.currentTime;

    // もし時間が戻ったり大きく飛んだりしたら（シークした場合）、チェック時間をリセット
    if (currentTime < lastPlayedTime || currentTime - lastPlayedTime > 2) {
        commentLayer.innerHTML = ''; // 画面のコメントを全部消す
        lastPlayedTime = currentTime;
    }

    // 「直前の時間」から「今の時間」の間に設定されているコメントを探す
    currentComments.forEach(comment => {
        if (comment.vpos >= lastPlayedTime && comment.vpos < currentTime) {
            spawnComment(comment.text);
        }
    });

    lastPlayedTime = currentTime;
};

// 動画一覧取得
async function fetchVideos() {
    try {
        const res = await fetch('/videos');
        if (!res.ok) throw new Error("取得失敗");
        const videos = await res.json();
        videoList.innerHTML = '';
        videos.forEach(v => {
            const div = document.createElement('div');
            div.className = 'video-card';
            // 安全のためデータを渡す際は一旦変数に入れる
            div.innerHTML = `<span>▶ ${v.title}</span>`;
            div.onclick = () => openPlayer(v); // 引数でオブジェクトごと渡す
            
            // 削除ボタン
            const delBtn = document.createElement('button');
            delBtn.innerText = '削除';
            delBtn.className = 'delete-btn';
            delBtn.onclick = (e) => {
                e.stopPropagation(); // 親要素のクリックイベントを止める
                deleteVideo(v.id);
            };
            div.appendChild(delBtn);

            videoList.appendChild(div);
        });
    } catch (e) {
        console.error(e);
    }
}

// プレイヤーを開く
function openPlayer(video) {
    currentVideoId = video.id;
    // コメントデータを保存（vposがない古いデータのために0を入れておく）
    currentComments = video.comments.map(c => 
        typeof c === 'string' ? { text: c, vpos: 0 } : c
    );

    listView.classList.add('hidden');
    playerView.classList.remove('hidden');
    document.getElementById('current-video-title').innerText = video.title;
    
    videoEl.src = video.url;
    videoEl.currentTime = 0;
    lastPlayedTime = 0;
    commentLayer.innerHTML = '';
    
    videoEl.play().catch(e => console.log("自動再生ブロック:", e));
}

// 戻る
goHomeBtn.onclick = () => {
    videoEl.pause();
    playerView.classList.add('hidden');
    listView.classList.remove('hidden');
    currentVideoId = null;
    videoEl.src = ""; // 停止
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

    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        if (res.ok) {
            statusText.innerText = "完了！";
            document.getElementById('title-input').value = '';
            document.getElementById('video-input').value = '';
            fetchVideos();
        } else {
            statusText.innerText = "失敗しました";
        }
    } catch (e) {
        statusText.innerText = "エラー";
    }
};

// コメント送信（時間情報 vpos を追加）
async function sendComment() {
    const inputEl = document.getElementById('comment-text');
    const text = inputEl.value;
    if (!text || !currentVideoId) return;

    // 現在の再生時間を取得
    const vpos = videoEl.currentTime;

    await fetch(`/videos/${currentVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, vpos: vpos })
    });

    inputEl.value = '';
}

document.getElementById('send-comment-btn').onclick = sendComment;
document.getElementById('comment-text').onkeypress = (e) => { if(e.key === 'Enter') sendComment(); };

// 削除
async function deleteVideo(id) {
    if (!confirm("本当に削除しますか？")) return;
    await fetch(`/videos/${id}`, { method: 'DELETE' });
    fetchVideos();
}

// コメント流し（見た目は変更なし）
function spawnComment(text) {
    const el = document.createElement('div');
    el.innerText = text;
    el.className = 'comment-item';
    
    const top = Math.random() * (commentLayer.clientHeight - 40);
    el.style.top = `${top}px`;
    el.style.left = `${commentLayer.clientWidth}px`;
    
    commentLayer.appendChild(el);

    let pos = commentLayer.clientWidth;
    function move() {
        if (!document.body.contains(el)) return; // 要素が消えてたら終了
        pos -= 4; // 少し速くしました
        el.style.left = `${pos}px`;
        if (pos > -el.clientWidth) {
            requestAnimationFrame(move);
        } else {
            el.remove();
        }
    }
    move();
}