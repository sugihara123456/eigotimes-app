const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// OpenAI APIクライアントの初期化
const { OpenAI } = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェアの設定
app.use(cors()); // CORS有効化（フロントエンドからのアクセスを許可）
app.use(express.json()); // JSONパーサー
app.use(express.static('public')); // 静的ファイル（HTML、CSS、JS）の配信

// メインページの配信
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'eigotimes.html'));
});

// ニュース生成API
app.post('/api/generate', async (req, res) => {
  try {
    const { toeicScore, topic } = req.body;
    
    // 入力値の検証
    if (!toeicScore || !topic) {
      return res.status(400).json({ 
        error: 'TOEICスコアとトピックは必須です' 
      });
    }

    if (toeicScore < 0 || toeicScore > 990) {
      return res.status(400).json({ 
        error: 'TOEICスコアは0から990の間で入力してください' 
      });
    }

    // TOEICスコアに基づいて難易度を決定
    let difficultyLevel;
    let difficultyText;
    let vocabularyLevel;
    
    if (toeicScore < 400) {
      difficultyLevel = "very simple";
      difficultyText = "初心者";
      vocabularyLevel = "basic elementary";
    } else if (toeicScore < 600) {
      difficultyLevel = "simple";
      difficultyText = "初級";
      vocabularyLevel = "elementary to pre-intermediate";
    } else if (toeicScore < 750) {
      difficultyLevel = "intermediate";
      difficultyText = "中級";
      vocabularyLevel = "intermediate";
    } else if (toeicScore < 900) {
      difficultyLevel = "upper-intermediate";
      difficultyText = "上級";
      vocabularyLevel = "upper-intermediate to advanced";
    } else {
      difficultyLevel = "advanced";
      difficultyText = "上級";
      vocabularyLevel = "advanced";
    }

    // OpenAI APIに送信するプロンプトを構築
    const prompt = `
あなたは英語学習者向けのニュース記事を作成する専門家です。
TOEICスコア${toeicScore}点レベル（${difficultyText}）の学習者向けに、「${topic}」についての英語ニュース記事を作成してください。

以下の要件に従って、JSON形式で回答してください：

1. 記事は${difficultyLevel}レベルの英語で書く
2. 単語は${vocabularyLevel}レベルを使用
3. 文章は短く、理解しやすい構造にする
4. 語彙リストには学習に重要な5つの単語を含める

回答は必ず以下のJSON形式で返してください：

{
  "title": "英語のタイトル",
  "article": "英語の記事本文（改行は\\n\\nで段落分け）",
  "vocabulary": [
    {
      "word": "単語",
      "meaning": "日本語の意味",
      "example": "英語の例文"
    }
  ],
  "translation": "記事の日本語訳（改行は\\n\\nで段落分け）",
  "category": "記事のカテゴリ（日本語）",
  "readingTime": "推定読解時間（例：5分）",
  "difficulty": "${difficultyText}",
  "wordCount": "約○○語"
}

注意事項：
- JSON以外の文字は含めないでください
- 記事は200-300語程度にしてください
- 実際のニュースのような自然な文章にしてください
- 学習者が興味を持てるような内容にしてください
`;

    console.log('OpenAI APIを呼び出し中...');
    
    // OpenAI APIを呼び出し
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "あなたは英語学習者向けのニュース記事を作成する専門家です。必ずJSON形式で回答してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    const responseText = completion.choices[0].message.content;
    console.log('OpenAI APIレスポンス:', responseText);

    // JSONパース
    let newsData;
    try {
      // レスポンスからJSON部分を抽出（```json タグがある場合の処理）
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newsData = JSON.parse(jsonMatch[0]);
      } else {
        newsData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      console.error('レスポンステキスト:', responseText);
      return res.status(500).json({ 
        error: 'ニュース生成中にエラーが発生しました。もう一度お試しください。' 
      });
    }

    // 必要なフィールドの存在チェック
    const requiredFields = ['title', 'article', 'vocabulary', 'translation'];
    for (const field of requiredFields) {
      if (!newsData[field]) {
        console.error(`必須フィールド ${field} が見つかりません`);
        return res.status(500).json({ 
          error: 'ニュース生成中にエラーが発生しました。もう一度お試しください。' 
        });
      }
    }

    // デフォルト値の設定
    newsData.category = newsData.category || 'ニュース';
    newsData.readingTime = newsData.readingTime || '5分';
    newsData.difficulty = newsData.difficulty || difficultyText;
    newsData.wordCount = newsData.wordCount || '約200語';

    console.log('ニュース生成成功');
    res.json(newsData);

  } catch (error) {
    console.error('API Error:', error);
    
    // OpenAI APIのエラーハンドリング
    if (error.code === 'insufficient_quota') {
      return res.status(500).json({ 
        error: 'APIの利用制限に達しました。しばらく時間をおいてからお試しください。' 
      });
    } else if (error.code === 'invalid_api_key') {
      return res.status(500).json({ 
        error: 'API設定にエラーがあります。管理者にお問い合わせください。' 
      });
    } else {
      return res.status(500).json({ 
        error: 'サーバーエラーが発生しました。しばらく時間をおいてからお試しください。' 
      });
    }
  }
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404エラーハンドリング
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Eigo Times サーバーがポート ${PORT} で起動しました`);
  console.log(`ブラウザで http://localhost:${PORT} にアクセスしてください`);
  console.log('環境変数 OPENAI_API_KEY が設定されていることを確認してください');
});