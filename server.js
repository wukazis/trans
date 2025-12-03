import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 保持 Gemini 进程常驻
let geminiProcess = null;
let isReady = false;
let responseBuffer = '';
let currentResolve = null;

function startGemini() {
  console.log('启动 Gemini 进程...');
  geminiProcess = spawn('gemini', [], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  geminiProcess.stdout.on('data', (data) => {
    const text = data.toString();
    responseBuffer += text;
    
    // 检测响应结束（通常 Gemini 输出完会有换行）
    if (currentResolve && responseBuffer.includes('\n')) {
      // 等待一小段时间确保完整响应
      setTimeout(() => {
        if (currentResolve) {
          const response = responseBuffer.trim();
          responseBuffer = '';
          currentResolve(response);
          currentResolve = null;
        }
      }, 500);
    }
  });

  geminiProcess.stderr.on('data', (data) => {
    const text = data.toString();
    // 忽略加载凭证的提示
    if (!text.includes('Loaded cached credentials')) {
      console.error('Gemini stderr:', text);
    }
  });

  geminiProcess.on('close', (code) => {
    console.log('Gemini 进程退出，代码:', code);
    isReady = false;
    // 自动重启
    setTimeout(startGemini, 1000);
  });

  geminiProcess.on('error', (err) => {
    console.error('Gemini 进程错误:', err);
  });

  // 等待进程就绪
  setTimeout(() => {
    isReady = true;
    console.log('Gemini 进程就绪');
  }, 2000);
}

function sendToGemini(prompt) {
  return new Promise((resolve, reject) => {
    if (!geminiProcess || !isReady) {
      reject(new Error('Gemini 进程未就绪'));
      return;
    }

    responseBuffer = '';
    currentResolve = resolve;

    // 发送提示到 Gemini
    geminiProcess.stdin.write(prompt + '\n');

    // 超时处理
    setTimeout(() => {
      if (currentResolve) {
        const response = responseBuffer.trim();
        responseBuffer = '';
        currentResolve = null;
        if (response) {
          resolve(response);
        } else {
          reject(new Error('响应超时'));
        }
      }
    }, 30000);
  });
}

app.post('/translate', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: '请提供要翻译的文本' });
  }

  if (!isReady) {
    return res.status(503).json({ error: 'Gemini 服务正在启动，请稍后重试' });
  }

  try {
    const prompt = `请将以下英文翻译成中文，只返回翻译结果，不要添加任何解释：${text}`;
    const translation = await sendToGemini(prompt);
    res.json({ translation });
  } catch (error) {
    console.error('翻译错误:', error);
    res.status(500).json({ error: '翻译失败: ' + error.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: isReady ? 'ready' : 'starting' });
});

// 启动
startGemini();

app.listen(PORT, () => {
  console.log(`翻译服务器运行在端口 ${PORT}`);
});
