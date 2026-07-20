const API_URL = '';
let socket = null;
let commandHistory = [];
let currentPage = 'dashboard';
let serverData = {
    online: false,
    players: [],
    tps: 20,
    memory: { used: 0, max: 0 },
    uptime: 0,
    version: 'unknown'
};

// Login
function login() {
    const password = document.getElementById('loginPassword').value;
    fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            initSocket();
            loadAllData();
            showToast('با موفقیت وارد شدید');
        } else {
            document.getElementById('loginError').textContent = 'رمز عبور اشتباه است';
        }
    })
    .catch(err => {
        document.getElementById('loginError').textContent = 'خطا در اتصال به سرور';
    });
}

function logout() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginPassword').value = '';
}

// Socket
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        addConsoleLine('[SYSTEM] اتصال برقرار شد', 'system');
    });
    
    socket.on('serverStatus', (status) => {
        serverData = status;
        updateDashboard();
    });
    
    socket.on('consoleOutput', (data) => {
        addConsoleLine(`[${data.type}] ${data.command}: ${data.response}`);
    });
    
    socket.on('commandResponse', (data) => {
        if (data.success) {
            addConsoleLine(data.response, 'info');
        } else {
            addConsoleLine(`خطا: ${data.error}`, 'error');
        }
    });
    
    socket.on('disconnect', () => {
        addConsoleLine('[SYSTEM] اتصال قطع شد', 'error');
    });
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        navigateTo(page);
    });
});

function navigateTo(page) {
    currentPage = page;
    
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    
    document.getElementById('pageTitle').textContent = getPageTitle(page);
    
    loadPageData(page);
}

function getPageTitle(page) {
    const titles = {
        dashboard: 'داشبورد',
        players: 'بازیکنان',
        console: 'کنسول',
        plugins: 'پلاگین‌ها',
        worlds: 'جهان‌ها',
        backups: 'بکاپ‌ها',
        config: 'تنظیمات',
        scheduler: 'زمان‌بندی',
        logs: 'لاگ‌ها'
    };
    return titles[page] || page;
}

// Load Data
function loadAllData() {
    updateDashboard();
    loadPageData(currentPage);
}

function loadPageData(page) {
    switch(page) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'players':
            loadPlayers();
            loadOps();
            loadWhitelist();
            loadBans();
            break;
        case 'console':
            break;
        case 'plugins':
            loadPlugins();
            break;
        case 'worlds':
            loadWorlds();
            break;
        case 'backups':
            loadBackups();
            break;
        case 'config':
            loadConfig();
            break;
        case 'scheduler':
            loadSchedules();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// Dashboard
function updateDashboard() {
    const status = serverData.online ? 'آنلاین' : 'آفلاین';
    document.getElementById('dashStatus').textContent = status;
    document.getElementById('dashPlayers').textContent = `${serverData.players.length}/20`;
    document.getElementById('dashTps').textContent = serverData.tps.toFixed(1);
    document.getElementById('dashMemory').textContent = `${serverData.memory.used}MB`;
    document.getElementById('dashVersion').textContent = serverData.version || '1.21.5';
    
    const statusBadge = document.getElementById('serverStatusBadge');
    const dot = statusBadge.querySelector('.status-dot');
    const text = statusBadge.querySelector('span:last-child');
    
    if (serverData.online) {
        dot.classList.remove('offline');
        dot.classList.add('online');
        text.textContent = 'آنلاین';
    } else {
        dot.classList.remove('online');
        dot.classList.add('offline');
        text.textContent = 'آفلاین';
    }
    
    document.getElementById('playerCountNav').textContent = `${serverData.players.length} بازیکن`;
    document.getElementById('tpsNav').textContent = `TPS: ${serverData.tps.toFixed(1)}`;
    
    updatePlayerGrid();
}

function updatePlayerGrid() {
    const container = document.getElementById('dashPlayerList');
    if (serverData.players.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>هیچ بازیکنی آنلاین نیست</p></div>';
        return;
    }
    
    container.innerHTML = serverData.players.map(player => `
        <div class="player-item">
            <div class="player-name">${player}</div>
            <div class="player-actions">
                <button onclick="quickPlayerAction('kick', '${player}')" class="btn btn-sm btn-warning" title="اخراج">
                    <i class="fas fa-shoe-prints"></i>
                </button>
                <button onclick="quickPlayerAction('tp', '${player}')" class="btn btn-sm btn-primary" title="تلپورت">
                    <i class="fas fa-exchange-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Players
function loadPlayers() {
    fetch(`${API_URL}/api/players`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('onlinePlayersList');
        if (data.players.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>هیچ بازیکنی آنلاین نیست</p></div>';
            return;
        }
        
        container.innerHTML = data.players.map(player => `
            <div class="player-list-item">
                <span><i class="fas fa-user" style="margin-left: 8px;"></i>${player}</span>
                <div style="display: flex; gap: 5px;">
                    <button onclick="executePlayerCmd('kick ${player}')" class="btn btn-sm btn-warning">اخراج</button>
                    <button onclick="executePlayerCmd('ban ${player}')" class="btn btn-sm btn-danger">مسدود</button>
                    <button onclick="executePlayerCmd('op ${player}')" class="btn btn-sm btn-info">OP</button>
                    <button onclick="executePlayerCmd('gamemode creative ${player}')" class="btn btn-sm btn-outline">خلاقیت</button>
                </div>
            </div>
        `).join('');
    });
}

function loadOps() {
    fetch(`${API_URL}/api/ops`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('opsList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user-shield"></i><p>هیچ اوپراتوری وجود ندارد</p></div>';
            return;
        }
        
        container.innerHTML = data.map(op => `
            <div class="player-list-item">
                <span><i class="fas fa-crown" style="margin-left: 8px; color: #eab308;"></i>${op.name}</span>
                <button onclick="executePlayerCmd('deop ${op.name}')" class="btn btn-sm btn-danger">حذف OP</button>
            </div>
        `).join('');
    });
}

function loadWhitelist() {
    fetch(`${API_URL}/api/whitelist`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('whitelistContent');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>لیست سفید خالی است</p></div>';
            return;
        }
        
        container.innerHTML = data.map(player => `
            <div class="player-list-item">
                <span><i class="fas fa-check-circle" style="margin-left: 8px; color: #22c55e;"></i>${player.name}</span>
                <button onclick="executePlayerCmd('whitelist remove ${player.name}')" class="btn btn-sm btn-danger">حذف</button>
            </div>
        `).join('');
    });
}

function loadBans() {
    fetch(`${API_URL}/api/bans`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('bansList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ban"></i><p>هیچ بازیکن مسدودی وجود ندارد</p></div>';
            return;
        }
        
        container.innerHTML = data.map(ban => `
            <div class="player-list-item">
                <span><i class="fas fa-ban" style="margin-left: 8px; color: #ef4444;"></i>${ban.name} - ${ban.reason || 'بدون دلیل'}</span>
                <button onclick="executePlayerCmd('pardon ${ban.name}')" class="btn btn-sm btn-success">رفع مسدودیت</button>
            </div>
        `).join('');
    });
}

function addOp() {
    const player = document.getElementById('addOpInput').value;
    if (player) {
        executePlayerCmd(`op ${player}`);
        document.getElementById('addOpInput').value = '';
    }
}

function addToWhitelist() {
    const player = document.getElementById('addWhitelistInput').value;
    if (player) {
        executePlayerCmd(`whitelist add ${player}`);
        document.getElementById('addWhitelistInput').value = '';
    }
}

function addBan() {
    const player = document.getElementById('addBanInput').value;
    const reason = document.getElementById('banReasonInput').value;
    if (player) {
        executePlayerCmd(`ban ${player} ${reason || ''}`);
        document.getElementById('addBanInput').value = '';
        document.getElementById('banReasonInput').value = '';
    }
}

function playerAction(action) {
    const player = document.getElementById('targetPlayer').value;
    if (!player) {
        showToast('نام بازیکن را وارد کنید', true);
        return;
    }
    
    if (action === 'tp') {
        const target = prompt('نام بازیکن مقصد:');
        if (target) {
            executePlayerCmd(`tp ${player} ${target}`);
        }
    } else if (action.startsWith('gamemode')) {
        const mode = action.split(' ')[1];
        executePlayerCmd(`gamemode ${mode} ${player}`);
    } else {
        executePlayerCmd(`${action} ${player}`);
    }
}

function quickPlayerAction(action, player) {
    executePlayerCmd(`${action} ${player}`);
}

function executePlayerCmd(cmd) {
    sendCommand(cmd);
    showToast(`دستور اجرا شد: ${cmd}`);
    setTimeout(() => {
        loadPlayers();
        loadOps();
        loadWhitelist();
        loadBans();
    }, 1000);
}

// Console
function sendConsoleCommand() {
    const input = document.getElementById('consoleInput');
    const cmd = input.value.trim();
    if (!cmd) return;
    
    commandHistory.unshift(cmd);
    if (commandHistory.length > 50) commandHistory.pop();
    
    addConsoleLine(`> ${cmd}`);
    sendCommand(cmd);
    input.value = '';
    
    updateCommandHistory();
}

function presetCmd(cmd) {
    document.getElementById('consoleInput').value = cmd;
    sendConsoleCommand();
}

function addConsoleLine(text, type = 'normal') {
    const console = document.getElementById('consoleOutput');
    const line = document.createElement('div');
    line.className = `console-${type}`;
    line.textContent = text;
    console.appendChild(line);
    
    if (document.getElementById('autoScroll').checked) {
        console.scrollTop = console.scrollHeight;
    }
}

function clearConsole() {
    document.getElementById('consoleOutput').innerHTML = '<div class="console-line">[SYSTEM] کنسول پاک شد</div>';
}

function updateCommandHistory() {
    const container = document.getElementById('commandHistory');
    container.innerHTML = commandHistory.map(cmd => `
        <div class="command-history-item">
            <span>${cmd}</span>
            <button onclick="presetCmd('${cmd}')" class="btn btn-sm btn-outline">اجرا</button>
        </div>
    `).join('');
}

// Plugins
function loadPlugins() {
    fetch(`${API_URL}/api/plugins`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('pluginsList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-puzzle-piece"></i><p>هیچ پلاگینی نصب نشده</p></div>';
            return;
        }
        
        container.innerHTML = data.map(plugin => `
            <div class="plugin-card">
                <h4><i class="fas fa-puzzle-piece"></i> ${plugin.name}</h4>
                <div class="plugin-meta">
                    <span>حجم: ${formatSize(plugin.size)}</span>
                    <span>${new Date(plugin.modified).toLocaleDateString('fa-IR')}</span>
                </div>
            </div>
        `).join('');
    });
}

function refreshPlugins() {
    loadPlugins();
    showToast('لیست پلاگین‌ها بروزرسانی شد');
}

// Worlds
function loadWorlds() {
    fetch(`${API_URL}/api/worlds`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('worldsList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-globe-americas"></i><p>هیچ جهانی یافت نشد</p></div>';
            return;
        }
        
        container.innerHTML = data.map(world => `
            <div class="world-card">
                <h4><i class="fas fa-globe-americas"></i> ${world.name}</h4>
                <div class="world-info">
                    <div class="world-info-item">
                        <span>حجم:</span>
                        <span>${formatSize(world.size)}</span>
                    </div>
                    <div class="world-info-item">
                        <span>آخرین تغییر:</span>
                        <span>${new Date(world.lastModified).toLocaleDateString('fa-IR')}</span>
                    </div>
                </div>
                <button onclick="backupWorld('${world.name}')" class="btn btn-sm btn-primary">
                    <i class="fas fa-cloud-upload-alt"></i> بکاپ
                </button>
            </div>
        `).join('');
    });
}

function refreshWorlds() {
    loadWorlds();
    showToast('لیست جهان‌ها بروزرسانی شد');
}

function backupWorld(name) {
    fetch(`${API_URL}/api/world/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('بکاپ جهان با موفقیت ایجاد شد');
        } else {
            showToast('خطا در ایجاد بکاپ', true);
        }
    });
}

// Backups
function loadBackups() {
    fetch(`${API_URL}/api/backups`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('backupsList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-cloud-upload-alt"></i><p>هیچ بکاپی وجود ندارد</p></div>';
            return;
        }
        
        container.innerHTML = data.map(backup => `
            <div class="backup-item">
                <div class="backup-info">
                    <h4><i class="fas fa-file-archive"></i> ${backup.name}</h4>
                    <div class="backup-meta">
                        <span>حجم: ${formatSize(backup.size)}</span>
                        <span>تاریخ: ${new Date(backup.created).toLocaleDateString('fa-IR')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    });
}

function createBackup() {
    fetch(`${API_URL}/api/server/backup`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('بکاپ با موفقیت ایجاد شد');
            loadBackups();
        } else {
            showToast('خطا در ایجاد بکاپ', true);
        }
    });
}

// Config
function loadConfig() {
    fetch(`${API_URL}/api/config`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('configForm');
        const configKeys = {
            'server-port': 'پورت سرور',
            'max-players': 'حداکثر بازیکنان',
            'difficulty': 'سختی',
            'gamemode': 'حالت بازی',
            'pvp': 'PVP',
            'view-distance': 'فاصله دید',
            'simulation-distance': 'فاصله شبیه‌سازی',
            'spawn-protection': 'محافظت اسپاون',
            'max-world-size': 'حداکثر اندازه جهان',
            'allow-flight': 'اجازه پرواز',
            'white-list': 'لیست سفید',
            'online-mode': 'حالت آنلاین',
            'motd': 'پیام سرور',
            'level-name': 'نام جهان',
            'level-seeded': 'بذر جهان',
            'level-type': 'نوع جهان',
            'spawn-monsters': 'اسپاون هیولاها',
            'spawn-npcs': 'اسپاون NPCها',
            'spawn-animals': 'اسپاون حیوانات',
            'generate-structures': 'ساختارهای تولیدی',
            'max-tick-time': 'حداکثر تیک',
            'network-compression-threshold': 'آستانه فشرده‌سازی',
            'rate-limit': 'محدودیت نرخ',
            'entity-broadcast-range-percentage': 'بُرد پخش موجودات'
        };
        
        container.innerHTML = Object.entries(data).map(([key, value]) => {
            const label = configKeys[key] || key;
            const isBoolean = ['true', 'false'].includes(value);
            
            if (isBoolean) {
                return `
                    <div class="config-item">
                        <label>${label}</label>
                        <select data-key="${key}">
                            <option value="true" ${value === 'true' ? 'selected' : ''}>فعال</option>
                            <option value="false" ${value === 'false' ? 'selected' : ''}>غیرفعال</option>
                        </select>
                    </div>
                `;
            }
            
            return `
                <div class="config-item">
                    <label>${label}</label>
                    <input type="text" data-key="${key}" value="${value}">
                </div>
            `;
        }).join('');
    });
}

function saveConfig() {
    const config = {};
    document.querySelectorAll('#configForm [data-key]').forEach(el => {
        config[el.dataset.key] = el.value;
    });
    
    fetch(`${API_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('تنظیمات با موفقیت ذخیره شد');
        } else {
            showToast('خطا در ذخیره تنظیمات', true);
        }
    });
}

// Scheduler
function loadSchedules() {
    fetch(`${API_URL}/api/schedules`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('schedulesList');
        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>هیچ زمان‌بندی وجود ندارد</p></div>';
            return;
        }
        
        container.innerHTML = data.map(schedule => `
            <div class="schedule-item">
                <div>
                    <strong>${schedule.name}</strong>
                    <p style="font-size: 12px; color: var(--text-secondary);">اجرا: ${schedule.nextRun || 'نامشخص'}</p>
                </div>
                <button onclick="cancelSchedule('${schedule.name}')" class="btn btn-sm btn-danger">لغو</button>
            </div>
        `).join('');
    });
}

function addSchedule() {
    const name = document.getElementById('scheduleName').value;
    const cron = document.getElementById('scheduleCron').value;
    const command = document.getElementById('scheduleCommand').value;
    
    if (!name || !cron || !command) {
        showToast('همه فیلدها را پر کنید', true);
        return;
    }
    
    fetch(`${API_URL}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cron, command })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('زمان‌بندی اضافه شد');
            loadSchedules();
            document.getElementById('scheduleName').value = '';
            document.getElementById('scheduleCron').value = '';
            document.getElementById('scheduleCommand').value = '';
        } else {
            showToast('خطا در اضافه کردن زمان‌بندی', true);
        }
    });
}

function cancelSchedule(name) {
    fetch(`${API_URL}/api/schedule/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('زمان‌بندی لغو شد');
            loadSchedules();
        }
    });
}

// Logs
function loadLogs() {
    fetch(`${API_URL}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'help' })
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('logsContent');
        container.textContent = data.response || 'لاگی موجود نیست';
    });
}

function refreshLogs() {
    loadLogs();
    showToast('لاگ‌ها بروزرسانی شد');
}

function clearLogs() {
    document.getElementById('logsContent').textContent = 'لاگ‌ها پاک شدند';
    showToast('لاگ‌ها پاک شدند');
}

// Server Actions
function serverAction(action) {
    fetch(`${API_URL}/api/server/${action}`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`عملیات ${action} انجام شد`);
        } else {
            showToast(`خطا: ${data.error}`, true);
        }
    });
}

function quickCmd(cmd) {
    sendCommand(cmd);
    showToast(`دستور اجرا شد: ${cmd}`);
}

function sendCommand(cmd) {
    fetch(`${API_URL}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.response) {
            addConsoleLine(data.response, 'info');
        }
    });
}

// Utilities
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = isError ? 'toast error' : 'toast';
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    const savedPassword = localStorage.getItem('mc_panel_password');
    if (savedPassword) {
        document.getElementById('loginPassword').value = savedPassword;
    }
});
