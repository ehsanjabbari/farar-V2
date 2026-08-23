import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyC78Ud-K2RCdajERy3YfKJY53BRY0nwrTU",
    authDomain: "faraazdivar.firebaseapp.com",
    databaseURL: "https://faraazdivar-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "faraazdivar",
    storageBucket: "faraazdivar.firebasestorage.app",
    messagingSenderId: "428483092269",
    appId: "1:428483092269:web:983a505203f478e65ffda4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let loggedInUser = null; 
let gameMode = 'online'; 
let myRole = null; 
let currentRoomId = null;

const board = document.getElementById('board');
const gridSize = 17;
let player1Name = 'PLAYER 1';
let player2Name = 'PLAYER 2';
let startingPlayer = 'blue';
let currentPlayer = 'blue';
let isGameOver = false;
let statsUpdated = false; 
let scores = { red: 0, blue: 0 }; 

let positions = { red: { r: 0, c: 8 }, blue: { r: 16, c: 8 } };
let walls = { red: 10, blue: 10 };

const withTimeout = (promise, ms = 5000) => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('NetworkTimeout')), ms));
    return Promise.race([promise, timeout]);
};

// =========================================
// کنترل جابجایی بین صفحات (لابی و ورود)
// =========================================
document.getElementById('btn-show-login').addEventListener('click', () => {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
});

document.getElementById('btn-cancel-login').addEventListener('click', () => {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
});

// =========================================
// سیستم ثبت نام و ورود (Authentication)
// =========================================
document.getElementById('btn-login').addEventListener('click', async () => {
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value.trim();

    if (username.length < 3 || password.length < 4) {
        alert("نام کاربری حداقل ۳ حرف و رمز عبور حداقل ۴ حرف باشد.");
        return;
    }

    const btn = document.getElementById('btn-login');
    btn.innerText = 'در حال بررسی...';
    btn.disabled = true;

    try {
        const userRef = ref(db, `users/${username}`);
        const snapshot = await withTimeout(get(userRef));

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.password === password) {
                loggedInUser = { username, ...userData };
                processLoginSuccess();
            } else {
                alert("رمز عبور برای این نام کاربری اشتباه است!");
            }
        } else {
            const newUser = { password, wins: 0, losses: 0 };
            await set(userRef, newUser);
            loggedInUser = { username, ...newUser };
            alert("حساب جدید شما با موفقیت ساخته شد!");
            processLoginSuccess();
        }
    } catch (e) {
        alert("ارتباط با سرور برقرار نشد. لطفاً VPN خود را بررسی کنید.");
    } finally {
        btn.innerText = 'تایید و ورود';
        btn.disabled = false;
    }
});

function processLoginSuccess() {
    // بازگشت به لابی
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    
    // مخفی کردن دکمه ورود و نمایش کارت پروفایل
    document.getElementById('btn-show-login').classList.add('hidden');
    document.getElementById('login-divider').classList.add('hidden');
    document.getElementById('profile-section').classList.remove('hidden');
    
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('profile-name').innerText = `سلام، ${loggedInUser.username}`;
    document.getElementById('profile-wins').innerText = loggedInUser.wins;
    document.getElementById('profile-losses').innerText = loggedInUser.losses;
}

// =========================================
// سیستم لابی اتاق‌ها
// =========================================
document.getElementById('btn-create-room').addEventListener('click', async () => {
    if (!loggedInUser) {
        alert("برای بازی آنلاین ابتدا باید وارد حساب کاربری شوید!");
        return;
    }

    const btn = document.getElementById('btn-create-room');
    btn.innerText = 'در حال ساخت...';
    btn.disabled = true;

    try {
        gameMode = 'online';
        currentRoomId = Math.floor(1000 + Math.random() * 9000).toString(); 
        myRole = 'blue';
        player1Name = loggedInUser.username;
        player2Name = 'در حال انتظار...';
        statsUpdated = false;
        
        const initialState = {
            player1Name: player1Name,
            player2Name: player2Name,
            currentPlayer: 'blue',
            startingPlayer: 'blue',
            isGameOver: false,
            positions: { red: { r: 0, c: 8 }, blue: { r: 16, c: 8 } },
            walls: { red: 10, blue: 10 },
            placedWalls: [],
            scores: { red: 0, blue: 0 }
        };

        await withTimeout(set(ref(db, `rooms/${currentRoomId}`), { gameState: initialState }));
        
        setupGameScreen();
        alert(`اتاق ساخته شد! \nکد اتاق شما: ${currentRoomId}\nمنتظر ورود حریف بمانید...`);
    } catch (e) {
        alert("خطا در ارتباط با سرور. VPN را بررسی کنید.");
    } finally {
        btn.innerText = 'ساخت اتاق جدید';
        btn.disabled = false;
    }
});

document.getElementById('btn-join-room').addEventListener('click', async () => {
    if (!loggedInUser) {
        alert("برای بازی آنلاین ابتدا باید وارد حساب کاربری شوید!");
        return;
    }

    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (!code) return;

    const btn = document.getElementById('btn-join-room');
    btn.innerText = 'در حال جستجو...';
    btn.disabled = true;

    try {
        gameMode = 'online';
        const roomRef = ref(db, `rooms/${code}/gameState`);
        const snapshot = await withTimeout(get(roomRef));

        if (snapshot.exists()) {
            currentRoomId = code;
            myRole = 'red'; 
            statsUpdated = false;
            
            await set(ref(db, `rooms/${code}/gameState/player2Name`), loggedInUser.username);
            setupGameScreen();
        } else {
            alert("اتاقی با این کد یافت نشد!");
        }
    } catch (e) {
        alert("خطا در ارتباط با سرور. VPN را بررسی کنید.");
    } finally {
        btn.innerText = 'ورود به اتاق';
        btn.disabled = false;
    }
});

document.getElementById('btn-offline-mode').addEventListener('click', () => {
    gameMode = 'offline';
    myRole = 'both'; 
    currentRoomId = null;
    player1Name = loggedInUser ? loggedInUser.username : 'مهمان ۱';
    player2Name = 'مهمان ۲';
    statsUpdated = true; 

    startingPlayer = 'blue';
    currentPlayer = 'blue';
    isGameOver = false;
    positions = { red: { r: 0, c: 8 }, blue: { r: 16, c: 8 } };
    walls = { red: 10, blue: 10 };
    scores = { red: 0, blue: 0 }; 

    setupGameScreen();
});

function setupGameScreen() {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const roleBadge = document.getElementById('my-role-display');

    if (gameMode === 'offline') {
        document.getElementById('display-room-code').innerText = 'آفلاین';
        roleBadge.innerText = 'بازی دو نفره روی یک گوشی';
        createBoard();
        updateDisplay();
    } else {
        document.getElementById('display-room-code').innerText = currentRoomId;
        roleBadge.innerText = myRole === 'blue' ? 'شما: PLAYER 1 (آبی)' : 'شما: PLAYER 2 (قرمز)';
        roleBadge.className = myRole === 'red' ? 'role-badge red-role' : 'role-badge';
        
        createBoard();
        
        onValue(ref(db, `rooms/${currentRoomId}/gameState`), (snapshot) => {
            const data = snapshot.val();
            if (data) applyGameStateFromFirebase(data);
        });
    }
}

// =========================================
// آپدیت پروفایل در دیتابیس هنگام پایان بازی
// =========================================
function processGameOver(winnerRole) {
    if (gameMode === 'online' && !statsUpdated && loggedInUser) {
        statsUpdated = true; 
        
        if (myRole === winnerRole) {
            loggedInUser.wins++;
            set(ref(db, `users/${loggedInUser.username}/wins`), loggedInUser.wins);
        } else if (myRole !== 'both') {
            loggedInUser.losses++;
            set(ref(db, `users/${loggedInUser.username}/losses`), loggedInUser.losses);
        }
        
        updateProfileUI(); 
    }
}

// =========================================
// هسته بازی و همگام‌سازی (Sync)
// =========================================
function applyGameStateFromFirebase(state) {
    currentPlayer = state.currentPlayer;
    startingPlayer = state.startingPlayer || 'blue';
    isGameOver = state.isGameOver;
    positions = state.positions;
    walls = state.walls;
    player1Name = state.player1Name || 'PLAYER 1';
    player2Name = state.player2Name || 'PLAYER 2';
    if (state.scores) scores = state.scores;

    document.querySelectorAll('.placed-wall').forEach(el => el.classList.remove('placed-wall', 'red-wall', 'blue-wall'));

    if (state.placedWalls) {
        state.placedWalls.forEach(w => {
            const el = document.querySelector(`[data-row="${w.r}"][data-col="${w.c}"]`);
            if (el) el.classList.add('placed-wall', `${w.color}-wall`);
        });
    }

    document.querySelectorAll('.pawn').forEach(p => p.remove());
    const redCell = document.querySelector(`[data-row="${positions.red.r}"][data-col="${positions.red.c}"]`);
    if (redCell) redCell.innerHTML = '<div class="pawn red" id="pawn-red"></div>';

    const blueCell = document.querySelector(`[data-row="${positions.blue.r}"][data-col="${positions.blue.c}"]`);
    if (blueCell) blueCell.innerHTML = '<div class="pawn blue" id="pawn-blue"></div>';

    updateDisplay();
    
    if (isGameOver) {
        const winnerRole = positions.blue.r === 0 ? 'blue' : 'red';
        const winnerName = winnerRole === 'blue' ? player1Name : player2Name;
        document.getElementById('turn-indicator').innerText = `🏆 برنده: ${winnerName} 🏆`;
        document.getElementById('restart-btn').classList.remove('hidden');
        processGameOver(winnerRole);
    } else {
        document.getElementById('restart-btn').classList.add('hidden');
    }
}

function syncGameStateToFirebase() {
    if (!currentRoomId || gameMode === 'offline') return;

    let placedWallsData = [];
    document.querySelectorAll('.placed-wall').forEach(el => {
        placedWallsData.push({ r: el.dataset.row, c: el.dataset.col, color: el.classList.contains('red-wall') ? 'red' : 'blue' });
    });

    const newState = {
        player1Name, player2Name,
        currentPlayer, startingPlayer, isGameOver,
        positions, walls,
        placedWalls: placedWallsData,
        scores
    };

    set(ref(db, `rooms/${currentRoomId}/gameState`), newState).catch(() => {});
}

// =========================================
// منطق ساخت جدول و حرکت
// =========================================
function createBoard() {
    board.innerHTML = ''; 
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const div = document.createElement('div');
            div.dataset.row = r;
            div.dataset.col = c;

            if (r % 2 === 0 && c % 2 === 0) {
                div.className = 'cell';
                div.addEventListener('click', () => handleCellClick(r, c));
                
                if (gameMode === 'offline') {
                    if (r === positions.red.r && c === positions.red.c) {
                        div.innerHTML = '<div class="pawn red" id="pawn-red"></div>';
                    } else if (r === positions.blue.r && c === positions.blue.c) {
                        div.innerHTML = '<div class="pawn blue" id="pawn-blue"></div>';
                    }
                }
            } else if (r % 2 === 0 && c % 2 !== 0) {
                div.className = 'wall-v';
            } else if (r % 2 !== 0 && c % 2 === 0) {
                div.className = 'wall-h';
            } else {
                div.className = 'cross'; 
            }
            board.appendChild(div);
        }
    }
}

function handleCellClick(r, c) {
    if (isGameOver) return;
    if (gameMode === 'online' && currentPlayer !== myRole) return; 

    const currentPos = positions[currentPlayer];
    const opponent = currentPlayer === 'blue' ? 'red' : 'blue';
    const opponentPos = positions[opponent];
    
    if (!checkMoveValidity(currentPos, r, c, opponentPos)) return;

    if (gameMode === 'offline') {
        movePawn(currentPlayer, r, c);
        
        if (checkWin(currentPlayer, r)) {
            isGameOver = true;
            scores[currentPlayer]++; 
            updateDisplay();
            
            const winnerName = currentPlayer === 'blue' ? player1Name : player2Name;
            document.getElementById('turn-indicator').innerText = `🏆 برنده: ${winnerName} 🏆`;
            document.getElementById('turn-indicator').className = currentPlayer === 'blue' ? 'turn-indicator blue-turn' : 'turn-indicator red-turn';
            clearMoveHints(); 
            document.getElementById('restart-btn').classList.remove('hidden');
            setTimeout(() => { alert(`تبریک! ${winnerName} برنده شد! 🎉`); }, 50);
            return;
        } else {
            currentPlayer = opponent;
        }
        updateDisplay();
    } else {
        positions[currentPlayer] = { r: r, c: c };
        
        if (checkWin(currentPlayer, r)) {
            isGameOver = true;
            scores[currentPlayer]++; 
        } else {
            currentPlayer = opponent;
        }
        syncGameStateToFirebase();
    }
}

function movePawn(player, newR, newC) {
    const oldCell = document.querySelector(`[data-row="${positions[player].r}"][data-col="${positions[player].c}"]`);
    if(oldCell) oldCell.innerHTML = '';
    
    positions[player] = { r: newR, c: newC };
    const newCell = document.querySelector(`[data-row="${newR}"][data-col="${newC}"]`);
    if(newCell) newCell.innerHTML = `<div class="pawn ${player}" id="pawn-${player}"></div>`;
}

function checkWin(player, r) {
    return (player === 'blue' && r === 0) || (player === 'red' && r === 16);
}

function updateDisplay() {
    document.querySelector('.red-player').style.opacity = currentPlayer === 'red' ? '1' : '0.4';
    document.querySelector('.blue-player').style.opacity = currentPlayer === 'blue' ? '1' : '0.4';
    
    document.getElementById('name-blue').innerText = player1Name;
    document.getElementById('name-red').innerText = player2Name;
    document.getElementById('red-walls').innerText = walls.red;
    document.getElementById('blue-walls').innerText = walls.blue;
    document.getElementById('score-red').innerText = scores.red;
    document.getElementById('score-blue').innerText = scores.blue;

    const turnIndicator = document.getElementById('turn-indicator');
    if (!isGameOver) {
        if (currentPlayer === 'blue') {
            turnIndicator.innerText = `نوبت: ${player1Name}`;
            turnIndicator.className = 'turn-indicator blue-turn';
        } else {
            turnIndicator.innerText = `نوبت: ${player2Name}`;
            turnIndicator.className = 'turn-indicator red-turn';
        }
    }

    if (gameMode === 'offline') {
        if (!isGameOver) showMoveHints();
    } else {
        if (currentPlayer === myRole && !isGameOver) {
            showMoveHints();
        } else {
            clearMoveHints();
        }
    }
}

function clearMoveHints() {
    document.querySelectorAll('.move-hint').forEach(h => h.remove());
}

function showMoveHints() {
    clearMoveHints();
    const currentPos = positions[currentPlayer];
    const opponent = currentPlayer === 'blue' ? 'red' : 'blue';
    const opponentPos = positions[opponent];

    for (let r = Math.max(0, currentPos.r - 4); r <= Math.min(16, currentPos.r + 4); r += 2) {
        for (let c = Math.max(0, currentPos.c - 4); c <= Math.min(16, currentPos.c + 4); c += 2) {
            if (checkMoveValidity(currentPos, r, c, opponentPos)) {
                const targetCell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                if (targetCell) {
                    const hintDot = document.createElement('div');
                    hintDot.className = `move-hint ${currentPlayer}`;
                    targetCell.appendChild(hintDot);
                }
            }
        }
    }
}

function checkMoveValidity(currentPos, targetR, targetC, opponentPos) {
    const r1 = currentPos.r; const c1 = currentPos.c;
    const r2 = targetR; const c2 = targetC;
    const dr = r2 - r1; const dc = c2 - c1;

    if ((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0)) {
        if (r2 === opponentPos.r && c2 === opponentPos.c) return false; 
        const wall = document.querySelector(`[data-row="${r1 + dr/2}"][data-col="${c1 + dc/2}"]`);
        return !(wall && wall.classList.contains('placed-wall'));
    }
    
    if ((Math.abs(dr) === 4 && dc === 0) || (Math.abs(dc) === 4 && dr === 0)) {
        const midR = r1 + dr/2; const midC = c1 + dc/2;
        if (midR === opponentPos.r && midC === opponentPos.c) { 
            const wall1 = document.querySelector(`[data-row="${r1 + dr/4}"][data-col="${c1 + dc/4}"]`);
            const wall2 = document.querySelector(`[data-row="${midR + dr/4}"][data-col="${midC + dc/4}"]`);
            return (!wall1 || !wall1.classList.contains('placed-wall')) && (!wall2 || !wall2.classList.contains('placed-wall'));
        }
        return false;
    }

    if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
        const drOpp = opponentPos.r - r1; const dcOpp = opponentPos.c - c1;
        if (Math.abs(drOpp) === 2 && dcOpp === 0 && r2 === opponentPos.r) {
            const wallUsOpp = document.querySelector(`[data-row="${r1 + drOpp/2}"][data-col="${c1}"]`);
            if (wallUsOpp && wallUsOpp.classList.contains('placed-wall')) return false;
            const jumpTargetR = opponentPos.r + drOpp;
            const wallBehindOpp = document.querySelector(`[data-row="${opponentPos.r + drOpp/2}"][data-col="${c1}"]`);
            if (jumpTargetR < 0 || jumpTargetR > 16 || (wallBehindOpp && wallBehindOpp.classList.contains('placed-wall'))) {
                const wallOppTarget = document.querySelector(`[data-row="${opponentPos.r}"][data-col="${c1 + dc/2}"]`);
                return (!wallOppTarget || !wallOppTarget.classList.contains('placed-wall'));
            }
        }
        else if (Math.abs(dcOpp) === 2 && drOpp === 0 && c2 === opponentPos.c) {
            const wallUsOpp = document.querySelector(`[data-row="${r1}"][data-col="${c1 + dcOpp/2}"]`);
            if (wallUsOpp && wallUsOpp.classList.contains('placed-wall')) return false;
            const jumpTargetC = opponentPos.c + dcOpp;
            const wallBehindOpp = document.querySelector(`[data-row="${r1}"][data-col="${opponentPos.c + dcOpp/2}"]`);
            if (jumpTargetC < 0 || jumpTargetC > 16 || (wallBehindOpp && wallBehindOpp.classList.contains('placed-wall'))) {
                const wallOppTarget = document.querySelector(`[data-row="${r1 + dr/2}"][data-col="${opponentPos.c}"]`);
                return (!wallOppTarget || !wallOppTarget.classList.contains('placed-wall'));
            }
        }
    }
    return false;
}

function hasPath(player) {
    const startPos = positions[player];
    const targetRow = player === 'blue' ? 0 : 16;
    let queue = [{ r: startPos.r, c: startPos.c }];
    let visited = new Set();
    visited.add(`${startPos.r},${startPos.c}`);
    const dirs = [ { dr: -2, dc: 0, wr: -1, wc: 0 }, { dr: 2, dc: 0, wr: 1, wc: 0 }, { dr: 0, dc: -2, wr: 0, wc: -1 }, { dr: 0, dc: 2, wr: 0, wc: 1 } ];
    
    while (queue.length > 0) {
        const current = queue.shift();
        if (current.r === targetRow) return true;
        for (let d of dirs) {
            const nextR = current.r + d.dr; const nextC = current.c + d.dc;
            const wallR = current.r + d.wr; const wallC = current.c + d.wc;
            if (nextR >= 0 && nextR <= 16 && nextC >= 0 && nextC <= 16 && !visited.has(`${nextR},${nextC}`)) {
                const wallElement = document.querySelector(`[data-row="${wallR}"][data-col="${wallC}"]`);
                if (wallElement && !wallElement.classList.contains('placed-wall')) {
                    visited.add(`${nextR},${nextC}`);
                    queue.push({ r: nextR, c: nextC });
                }
            }
        }
    }
    return false;
}

function getWallPartsFromCross(crossElem, type) {
    if (!crossElem) return null;
    let r = parseInt(crossElem.dataset.row); let c = parseInt(crossElem.dataset.col);
    let parts = [];
    if (type === 'h') {
        parts.push(document.querySelector(`[data-row="${r}"][data-col="${c - 1}"]`)); 
        parts.push(crossElem);     
        parts.push(document.querySelector(`[data-row="${r}"][data-col="${c + 1}"]`)); 
    } else if (type === 'v') {
        parts.push(document.querySelector(`[data-row="${r - 1}"][data-col="${c}"]`)); 
        parts.push(crossElem);     
        parts.push(document.querySelector(`[data-row="${r + 1}"][data-col="${c}"]`)); 
    }
    return (parts.length === 3 && parts[0] && parts[1] && parts[2]) ? parts : null;
}

let draggedWallType = null;
let dragGhost = null;
let currentPreviewParts = []; 
let magneticTargets = []; 
let snappedTarget = null; 

function setupDragAndDrop() {
    const dispensers = document.querySelectorAll('.draggable-wall');
    dispensers.forEach(disp => disp.addEventListener('pointerdown', handleDragStart));
    
    document.getElementById('restart-btn').addEventListener('click', () => {
        if (gameMode === 'offline') resetOfflineGame();
        else resetGameToFirebase();
    });
}

function handleDragStart(e) {
    if (isGameOver || walls[currentPlayer] <= 0) return;
    if (gameMode === 'online' && currentPlayer !== myRole) return;
    
    draggedWallType = e.target.dataset.type;
    snappedTarget = null;
    magneticTargets = [];
    document.querySelectorAll('.cross').forEach(cross => {
        const rect = cross.getBoundingClientRect();
        magneticTargets.push({ element: cross, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    });

    dragGhost = document.createElement('div');
    dragGhost.className = `ghost-wall ${draggedWallType} ${currentPlayer === 'red' ? 'red-ghost' : 'blue-ghost'}`;
    document.body.appendChild(dragGhost);
    moveGhost(e.clientX, e.clientY);
    
    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
}

function handleDragMove(e) {
    if (!dragGhost) return;
    e.preventDefault();
    clearPreview();
    snappedTarget = null;

    let closestCross = null; let minDistance = Infinity;
    for (let target of magneticTargets) {
        const dx = e.clientX - target.x; const dy = e.clientY - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) { minDistance = distance; closestCross = target; }
    }

    if (closestCross && minDistance < 60) {
        moveGhost(closestCross.x, closestCross.y);
        const wallParts = getWallPartsFromCross(closestCross.element, draggedWallType);
        if (wallParts && !wallParts.some(p => p && p.classList.contains('placed-wall'))) {
            snappedTarget = closestCross.element;
            showPreview(wallParts);
        }
    } else {
        moveGhost(e.clientX, e.clientY);
    }
}

function moveGhost(x, y) { dragGhost.style.left = x + 'px'; dragGhost.style.top = y + 'px'; }

function showPreview(parts) {
    const previewClass = currentPlayer === 'red' ? 'preview-red' : 'preview-blue';
    parts.forEach(p => { if (p) { p.classList.add('preview-wall', previewClass); currentPreviewParts.push(p); } });
}

function clearPreview() {
    currentPreviewParts.forEach(p => p.classList.remove('preview-wall', 'preview-red', 'preview-blue'));
    currentPreviewParts = [];
}

function handleDragEnd(e) {
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    if (!dragGhost) return;
    dragGhost.remove(); dragGhost = null;
    clearPreview();
    
    if (snappedTarget) {
        const wallParts = getWallPartsFromCross(snappedTarget, draggedWallType);
        if (wallParts) handleWallDropByParts(wallParts);
    }
    draggedWallType = null; snappedTarget = null;
}

function handleWallDropByParts(wallParts) {
    if (isGameOver || walls[currentPlayer] <= 0) return;
    if (gameMode === 'online' && currentPlayer !== myRole) return;
    if (wallParts.some(p => p && p.classList.contains('placed-wall'))) return; 

    const playerColorClass = currentPlayer === 'red' ? 'red-wall' : 'blue-wall';
    wallParts.forEach(p => p.classList.add('placed-wall', playerColorClass));
    
    if (!hasPath('red') || !hasPath('blue')) {
        wallParts.forEach(p => p.classList.remove('placed-wall', playerColorClass));
        alert('خطای استراتژی: مسدود کردن کامل مسیر ممنوع است!');
        return; 
    }
    
    walls[currentPlayer]--;
    currentPlayer = currentPlayer === 'blue' ? 'red' : 'blue';
    gameMode === 'offline' ? updateDisplay() : syncGameStateToFirebase();
}

function resetOfflineGame() {
    startingPlayer = startingPlayer === 'blue' ? 'red' : 'blue';
    currentPlayer = startingPlayer;
    isGameOver = false; statsUpdated = false;
    positions = { red: { r: 0, c: 8 }, blue: { r: 16, c: 8 } };
    walls = { red: 10, blue: 10 };
    document.getElementById('restart-btn').classList.add('hidden');
    createBoard(); updateDisplay();
}

function resetGameToFirebase() {
    if (myRole !== 'blue') { alert("فقط سازنده اتاق می‌تواند دست جدید را شروع کند."); return; }

    const nextStarter = startingPlayer === 'blue' ? 'red' : 'blue';
    statsUpdated = false;

    const initialState = {
        player1Name, player2Name,
        currentPlayer: nextStarter, startingPlayer: nextStarter,
        isGameOver: false,
        positions: { red: { r: 0, c: 8 }, blue: { r: 16, c: 8 } },
        walls: { red: 10, blue: 10 },
        placedWalls: [], scores: scores
    };
    set(ref(db, `rooms/${currentRoomId}/gameState`), initialState).catch(() => {});
}

setupDragAndDrop();
