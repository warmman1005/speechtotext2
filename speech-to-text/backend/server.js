import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import mammoth from 'mammoth';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';




const app = express();
const PORT = 3000;

app.use(bodyParser.json({ limit: '1000mb' }));
app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(cors());


import { openAIKey } from './config.js'; 

// 你的其他程式碼


app.get('/', (req, res) => {
    res.send('語音轉文字後端服務運行中');
    
});

const storage = multer.memoryStorage();
const upload = multer({
    limits: { fileSize: 1000 * 1024 * 1024 } 
});

ffmpeg.setFfmpegPath(ffmpegStatic);

// 将音频文件分割为较小的片段
// 将音频文件分割为较小的片段
// 将音频文件分割为较小的片段
async function splitAudio(filePath, segmentDuration = 240) { // segmentDuration in seconds
    const tempDir = `./temp_${uuidv4()}`;
    fs.mkdirSync(tempDir);

    return new Promise((resolve, reject) => {
        ffmpeg(filePath)
            .output(`${tempDir}/output%03d.wav`)
            .outputOptions([`-f segment`, `-segment_time ${segmentDuration}`, `-c copy`])
            .on('end', () => resolve(tempDir))
            .on('error', reject)
            .run();
    });
}


// 将音频文件发送到 OpenAI API 进行转写
async function transcribeAudio(filePath) {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    const maxFileSize = 25 * 1024 * 1024; // 25MB

    if (fileSizeInBytes > maxFileSize) {
        throw new Error('File size exceeds the 25MB limit.');
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), 'audio.wav');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openAIKey}`
        },
        body: formData
    });

    const data = await response.json();
    if (response.ok) {
        return data.text;
    } else {
        throw new Error(data.error.message);
    }
}

// 处理上传的音频文件
app.post('/upload-audio', upload.single('file'), async (req, res) => {
    try {
        const uploadDir = './uploads';
        
        // 檢查目錄是否存在，如果不存在則創建
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileBuffer = req.file.buffer;
        const tempFilePath = `${uploadDir}/${uuidv4()}.wav`;
        fs.writeFileSync(tempFilePath, fileBuffer);

        const segmentDuration = 240; // 根據需要調整片段時長
        const tempDir = await splitAudio(tempFilePath, segmentDuration);
        const files = fs.readdirSync(tempDir);
        let finalText = '';

        for (const file of files) {
            const filePath = `${tempDir}/${file}`;
            const stats = fs.statSync(filePath);
            const fileSizeInBytes = stats.size;
            const maxFileSize = 25 * 1024 * 1024; // 25MB

            if (fileSizeInBytes > maxFileSize) {
                // 如果片段大小仍超過限制，進一步分割片段
                const furtherSplitDir = await splitAudio(filePath, segmentDuration / 2);
                const furtherSplitFiles = fs.readdirSync(furtherSplitDir);

                for (const splitFile of furtherSplitFiles) {
                    const splitFilePath = `${furtherSplitDir}/${splitFile}`;
                    const text = await transcribeAudio(splitFilePath);
                    finalText += text + ' ';
                }

                // 清理進一步分割的臨時文件
                fs.rmSync(furtherSplitDir, { recursive: true, force: true });
            } else {
                const text = await transcribeAudio(filePath);
                finalText += text + ' ';
            }
        }

        // 清理临时文件
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.unlinkSync(tempFilePath);

        res.json({ text: finalText });
    } catch (error) {
        console.error('Error processing audio upload:', error);
        res.status(500).json({ error: error.message });
    }
});





app.post('/upload-doc', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        let text = '';

        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            text = result.value;
        } else if (file.mimetype === 'text/plain') {
            text = file.buffer.toString('utf-8');
        } else {
            return res.status(400).json({ error: 'Unsupported file type' });
        }

        res.json({ text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




app.post('/summarize-text', async (req, res) => {
    const { text, language } = req.body;

    let systemMessage;
    switch (language) {
        case 'en':
            systemMessage = 'You are an assistant who helps to summarize the text.';
            break;
        case 'ja':
            systemMessage = 'あなたはテキストを要約するアシスタントです。';
            break;
        case 'zh-TW':
            systemMessage = '你是一個幫助生成摘要的助手，請確保輸出為繁體中文。';
            break;
        case 'id':
            systemMessage = 'Anda adalah asisten yang membantu meringkas teks.';
            break;
        case 'vi':
            systemMessage = 'Bạn là trợ lý giúp tóm tắt văn bản.';
            break;
        default:
            systemMessage = '你是一個幫助生成摘要的助手，請確保輸出為繁體中文。';
    }

    const userMessage = language === 'en'
        ? `Please summarize the following content:\n\n${text}`
        : language === 'ja'
        ? `次の内容を要約してください:\n\n${text}`
        : language === 'id'
        ? `Silakan ringkas konten berikut:\n\n${text}`
        : language === 'vi'
        ? `Vui lòng tóm tắt nội dung sau:\n\n${text}`
        : `請總結以下內容:\n\n${text}`;

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAIKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 2000,
                stop: null
            })
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ summarizedText: data.choices[0].message.content.trim() });
        } else {
            res.status(500).json({ error: data.error.message });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/highlight-text', async (req, res) => {
    const { text, language } = req.body;

    let systemMessage;
    switch (language) {
        case 'en':
            systemMessage = 'You are an assistant who helps to extract key points from the text.';
            break;
        case 'ja':
            systemMessage = 'あなたはテキストから要点を抽出するアシスタントです。';
            break;
        case 'zh-TW':
            systemMessage = '你是一個幫助提取重點的助手，請確保輸出為繁體中文。';
            break;
        case 'id':
            systemMessage = 'Anda adalah asisten yang membantu mengekstrak poin utama dari teks.';
            break;
        case 'vi':
            systemMessage = 'Bạn là trợ lý giúp trích xuất các điểm chính từ văn bản.';
            break;
        default:
            systemMessage = '你是一個幫助提取重點的助手，請確保輸出為繁體中文。';
    }

    const userMessage = language === 'en'
        ? `Please extract three key points from the following content:\n\n${text}`
        : language === 'ja'
        ? `次の内容から三つの要点を抽出してください:\n\n${text}`
        : language === 'id'
        ? `Silakan ekstrak tiga poin utama dari konten berikut:\n\n${text}`
        : language === 'vi'
        ? `Vui lòng trích xuất ba điểm chính từ nội dung sau:\n\n${text}`
        : `請從以下內容中提取三個重點:\n\n${text}`;

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAIKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 2000,
                stop: null
            })
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ highlightedText: data.choices[0].message.content.trim() });
        } else {
            res.status(500).json({ error: data.error.message });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.post('/polish-text', async (req, res) => {
    const { text, language } = req.body;

    let systemMessage;
    switch (language) {
        case 'en':
            systemMessage = 'You are an assistant who helps to polish the text.';
            break;
        case 'ja':
            systemMessage = 'あなたはテキストを修飾するアシスタントです。';
            break;
        case 'zh-TW':
            systemMessage = '你是一個幫助修飾文本的助手，請確保輸出為繁體中文，並保留英文人名或詞彙。';
            break;
        case 'id':
            systemMessage = 'Anda adalah asisten yang membantu memperhalus teks.';
            break;
        case 'vi':
            systemMessage = 'Bạn là trợ lý giúp chỉnh sửa văn bản.';
            break;
        default:
            systemMessage = '你是一個幫助修飾文本的助手，請確保輸出為繁體中文。';
    }

    const userMessage = language === 'en'
        ? `Please polish the following content:\n\n${text}`
        : language === 'ja'
        ? `次の内容を修飾してください:\n\n${text}`
        : language === 'id'
        ? `Silakan perhalus konten berikut:\n\n${text}`
        : language === 'vi'
        ? `Vui lòng chỉnh sửa nội dung sau:\n\n${text}`
        : `請修飾以下內容:\n\n${text}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAIKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 2000,
                stop: null
            })
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ polishedText: data.choices[0].message.content.trim() });
        } else {
            res.status(500).json({ error: data.error.message });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
