require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs-extra');
const { Rcon } = require('rcon-client');
const schedule = require('node-schedule');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

const MC_SERVER_DIR = process.env.MC_SERVER_DIR || '/data';
const BACKUP_DIR = path.join(MC_SERVER_DIR, 'backups');
const PLUGINS_DIR = path.join(MC_SERVER_DIR, 'plugins');

let rcon = null;
let serverStatus = {
  online: false,
  players: [],
  tps: 20,
  memory: { used: 0, max: 0 },
  uptime: 0,
  version: 'unknown'
};

async function connectRcon() {
  try {
    rcon = await Rcon.connect({
      host: process.env.MC_HOST || 'localhost',
      port: parseInt(process.env.MC_RCON_PORT) || 25575,
      password: process.env.MC_RCON_PASSWORD || 'minecraft123'
    });
    console.log('RCON Connected');
    serverStatus.online = true;
    io.emit('serverStatus', serverStatus);
    
    rcon.on('end', () => {
      console.log('RCON Disconnected');
      serverStatus.online = false;
      io.emit('serverStatus', serverStatus);
      setTimeout(connectRcon, 5000);
    });
  } catch (err) {
    console.log('RCON Connection failed, retrying in 5s...');
    serverStatus.online = false;
    setTimeout(connectRcon, 5000);
  }
}

async function executeCommand(cmd) {
  if (!rcon) throw new Error('RCON not connected');
  const response = await rcon.send(cmd);
  return response;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === process.env.PANEL_PASSWORD) {
    res.json({ success: true, token: 'authenticated' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    if (serverStatus.online) {
      const playersList = await executeCommand('list');
      const tpsResponse = await executeCommand('tps');
      const memoryResponse = await executeCommand('memory');
      
      const playersMatch = playersList.match(/There are (\d+) of a max of (\d+) players online:(.*)/);
      if (playersMatch) {
        serverStatus.players = playersMatch[3].trim() ? playersMatch[3].trim().split(', ') : [];
      }
      
      const tpsMatch = tpsResponse.match(/TPS from last 1m, 5m, 15m: \*?([\d.]+), \*?([\d.]+), \*?([\d.]+)/);
      if (tpsMatch) serverStatus.tps = parseFloat(tpsMatch[1]);
    }
    res.json(serverStatus);
  } catch (err) {
    res.json(serverStatus);
  }
});

app.get('/api/players', async (req, res) => {
  try {
    if (serverStatus.online) {
      const response = await executeCommand('list');
      const match = response.match(/There are (\d+) of a max of (\d+) players online:(.*)/);
      if (match) {
        const players = match[3].trim() ? match[3].trim().split(', ') : [];
        res.json({ online: players.length, max: parseInt(match[2]), players });
      } else {
        res.json({ online: 0, max: 20, players: [] });
      }
    } else {
      res.json({ online: 0, max: 20, players: [] });
    }
  } catch (err) {
    res.json({ online: 0, max: 20, players: [] });
  }
});

app.post('/api/command', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command required' });
  
  try {
    const response = await executeCommand(command);
    io.emit('consoleOutput', { type: 'command', command, response });
    res.json({ success: true, response });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/kick', async (req, res) => {
  const { player, reason } = req.body;
  try {
    await executeCommand(`kick ${player} ${reason || 'Kicked by admin'}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/ban', async (req, res) => {
  const { player, reason } = req.body;
  try {
    await executeCommand(`ban ${player} ${reason || 'Banned by admin'}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/pardon', async (req, res) => {
  const { player } = req.body;
  try {
    await executeCommand(`pardon ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/op', async (req, res) => {
  const { player } = req.body;
  try {
    await executeCommand(`op ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/deop', async (req, res) => {
  const { player } = req.body;
  try {
    await executeCommand(`deop ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/tp', async (req, res) => {
  const { player, target } = req.body;
  try {
    await executeCommand(`tp ${player} ${target}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/gamemode', async (req, res) => {
  const { player, mode } = req.body;
  try {
    await executeCommand(`gamemode ${mode} ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/whitelist/add', async (req, res) => {
  const { player } = req.body;
  try {
    await executeCommand(`whitelist add ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/whitelist/remove', async (req, res) => {
  const { player } = req.body;
  try {
    await executeCommand(`whitelist remove ${player}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whitelist', async (req, res) => {
  try {
    const whitelistPath = path.join(MC_SERVER_DIR, 'whitelist.json');
    if (await fs.pathExists(whitelistPath)) {
      const data = await fs.readJson(whitelistPath);
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/bans', async (req, res) => {
  try {
    const bansPath = path.join(MC_SERVER_DIR, 'banned-players.json');
    if (await fs.pathExists(bansPath)) {
      const data = await fs.readJson(bansPath);
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/ops', async (req, res) => {
  try {
    const opsPath = path.join(MC_SERVER_DIR, 'ops.json');
    if (await fs.pathExists(opsPath)) {
      const data = await fs.readJson(opsPath);
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/plugins', async (req, res) => {
  try {
    await fs.ensureDir(PLUGINS_DIR);
    const files = await fs.readdir(PLUGINS_DIR);
    const plugins = files
      .filter(f => f.endsWith('.jar'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(PLUGINS_DIR, f)).size,
        modified: fs.statSync(path.join(PLUGINS_DIR, f)).mtime
      }));
    res.json(plugins);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/plugins/upload', async (req, res) => {
  res.status(501).json({ error: 'Use multipart form data' });
});

app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(MC_SERVER_DIR, 'server.properties');
    if (await fs.pathExists(configPath)) {
      const content = await fs.readFile(configPath, 'utf8');
      const config = {};
      content.split('\n').forEach(line => {
        if (line.trim() && !line.startsWith('#')) {
          const [key, value] = line.split('=');
          if (key && value !== undefined) {
            config[key.trim()] = value.trim();
          }
        }
      });
      res.json(config);
    } else {
      res.json({});
    }
  } catch (err) {
    res.json({});
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const config = req.body;
    const configPath = path.join(MC_SERVER_DIR, 'server.properties');
    let content = '#Minecraft server properties\n';
    Object.entries(config).forEach(([key, value]) => {
      content += `${key}=${value}\n`;
    });
    await fs.writeFile(configPath, content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/server/start', async (req, res) => {
  try {
    await executeCommand('start');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/server/stop', async (req, res) => {
  try {
    await executeCommand('stop');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/server/restart', async (req, res) => {
  try {
    await executeCommand('restart');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/server/save-all', async (req, res) => {
  try {
    await executeCommand('save-all');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/server/backup', async (req, res) => {
  try {
    await fs.ensureDir(BACKUP_DIR);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.zip`);
    
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.directory(MC_SERVER_DIR, false, { ignore: ['backups', 'plugins'] });
    await archive.finalize();
    
    res.json({ success: true, path: backupPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backups', async (req, res) => {
  try {
    await fs.ensureDir(BACKUP_DIR);
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.endsWith('.zip'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(BACKUP_DIR, f)).size,
        created: fs.statSync(path.join(BACKUP_DIR, f)).birthtime
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(backups);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/worlds', async (req, res) => {
  try {
    const worlds = [];
    const items = await fs.readdir(MC_SERVER_DIR);
    for (const item of items) {
      const itemPath = path.join(MC_SERVER_DIR, item);
      const stat = await fs.stat(itemPath);
      if (stat.isDirectory() && await fs.pathExists(path.join(itemPath, 'level.dat'))) {
        worlds.push({
          name: item,
          size: await getDirSize(itemPath),
          lastModified: stat.mtime
        });
      }
    }
    res.json(worlds);
  } catch (err) {
    res.json([]);
  }
});

async function getDirSize(dir) {
  let size = 0;
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      size += await getDirSize(filePath);
    } else {
      size += stat.size;
    }
  }
  return size;
}

app.post('/api/world/backup', async (req, res) => {
  const { name } = req.body;
  try {
    const worldPath = path.join(MC_SERVER_DIR, name);
    if (!await fs.pathExists(worldPath)) {
      return res.status(404).json({ error: 'World not found' });
    }
    
    await fs.ensureDir(BACKUP_DIR);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `world-${name}-${timestamp}.zip`);
    
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.directory(worldPath, name);
    await archive.finalize();
    
    res.json({ success: true, path: backupPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/schedules', async (req, res) => {
  const jobs = [];
  schedule.scheduledJobs.forEach((job, name) => {
    jobs.push({
      name,
      nextRun: job.nextInvocation(),
      running: job.running
    });
  });
  res.json(jobs);
});

app.post('/api/schedule', async (req, res) => {
  const { name, cron, command } = req.body;
  try {
    schedule.scheduleJob(name, cron, async () => {
      try {
        await executeCommand(command);
        console.log(`Scheduled command executed: ${command}`);
      } catch (err) {
        console.error(`Scheduled command failed: ${err.message}`);
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/schedule/cancel', async (req, res) => {
  const { name } = req.body;
  try {
    const job = schedule.scheduledJobs.get(name);
    if (job) {
      job.cancel();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/server/version', (req, res) => {
  res.json({ 
    current: process.env.VERSION || '1.21.5',
    type: process.env.TYPE || 'PAPER'
  });
});

app.get('/api/server/versions', async (req, res) => {
  try {
    const https = require('https');
    const url = 'https://papermc.io/api/v2/projects/paper';
    
    https.get(url, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const versions = json.versions || [];
          res.json(versions.reverse());
        } catch (e) {
          res.json(['1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.17.1', '1.16.5']);
        }
      });
    }).on('error', () => {
      res.json(['1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.17.1', '1.16.5']);
    });
  } catch (err) {
    res.json(['1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.17.1', '1.16.5']);
  }
});

app.post('/api/server/version', async (req, res) => {
  const { version } = req.body;
  if (!version) return res.status(400).json({ error: 'Version required' });
  
  try {
    const envPath = path.join(__dirname, '../.env');
    let envContent = '';
    if (await fs.pathExists(envPath)) {
      envContent = await fs.readFile(envPath, 'utf8');
    }
    
    if (envContent.includes('VERSION=')) {
      envContent = envContent.replace(/VERSION=.*/, `VERSION=${version}`);
    } else {
      envContent += `\nVERSION=${version}`;
    }
    
    await fs.writeFile(envPath, envContent);
    
    res.json({ 
      success: true, 
      message: `Version changed to ${version}. Server will restart with new version.`,
      version 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/server/types', (req, res) => {
  res.json([
    { id: 'PAPER', name: 'Paper', description: 'بهینه و سریع' },
    { id: 'SPIGOT', name: 'Spigot', description: 'پایدار و محبوب' },
    { id: 'BUKKIT', name: 'Bukkit', description: 'کلاسیک' },
    { id: 'FABRIC', name: 'Fabric', description: 'مدرن و سبک' },
    { id: 'FORGE', name: 'Forge', description: 'برای مادها' },
    { id: 'VANILLA', name: 'Vanilla', description: 'اصلی ماینکرفت' },
    { id: 'PURPUR', name: 'Purpur', description: 'بهینه‌ترین' }
  ]);
});

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.emit('serverStatus', serverStatus);
  
  socket.on('executeCommand', async (cmd) => {
    try {
      const response = await executeCommand(cmd);
      socket.emit('commandResponse', { success: true, response });
    } catch (err) {
      socket.emit('commandResponse', { success: false, error: err.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Panel server running on port ${PORT}`);
  connectRcon();
});

setInterval(async () => {
  if (serverStatus.online) {
    try {
      const memoryResponse = await executeCommand('memory');
      const match = memoryResponse.match(/(\d+)MB\/(\d+)MB/);
      if (match) {
        serverStatus.memory = { used: parseInt(match[1]), max: parseInt(match[2]) };
      }
    } catch (err) {}
  }
  io.emit('serverStatus', serverStatus);
}, 5000);
