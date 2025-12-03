import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/translate', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: '请提供要翻译的文本' });
  }

  try {
    // 转义文本中的特殊字符
    const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const prompt = `请将以下英文翻译成中文，只返回翻译结果，不要添加任何解释：\n\n${escapedText}`;
    
    // 调用 Gemini CLI
    const { stdout, stderr } = await execAsync(`gemini "${prompt}"`, {
      timeout: 60000,
      maxBuffer: 1024 * 1024
    });

    if (stderr) {
      console.error('Gemini CLI stderr:', stderr);
    }

    res.json({ translation: stdout.trim() });
  } catch (error) {
    console.error('翻译错误:', error);
    res.status(500).json({ error: '翻译失败: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`翻译服务器运行在端口 ${PORT}`);
});
