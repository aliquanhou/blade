const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// SSE streaming chat
app.post('/api/chat/stream', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'empty message' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('\n');

    const env = {
        ...process.env,
        CLAUDE_CODE_SIMPLE: '1',
        CLAUDE_CODE_DISABLE_UPDATES: '1',
        CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Program Files\\Git\\bin\\bash.exe',
        CLAUDE_CODE_MODEL: 'deepseek-v4-flash',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/v1',
        BLADE_PROVIDER: 'deepseek',
    };

    const blade = spawn('node', [
        path.join(__dirname, '..', 'bin', 'blade.js'),
        '-p', message,
        '--model', 'deepseek-v4-flash',
    ], { cwd: path.join(__dirname, '..'), env });

    let hasOutput = false;
    blade.stdout.on('data', (data) => {
        hasOutput = true;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: data.toString() })}\n\n`);
    });
    blade.on('close', () => {
        if (!hasOutput) res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    });
    blade.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    });
    setTimeout(() => { blade.kill(); res.end(); }, 120000);
});

app.listen(PORT, '0.0.0.0', () => console.log('Blade Web: http://localhost:' + PORT));
