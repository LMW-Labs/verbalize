const functions = require('@google-cloud/functions-framework');
const speech = require('@google-cloud/speech');
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize clients
const speechClient = new speech.SpeechClient();
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'us-central1'
});

// Get the Gemini model
const model = vertexAI.preview.getGenerativeModel({
  model: 'gemini-1.5-flash'
});

functions.http('processVoice', async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { audio, language } = req.body;
    
    if (!audio) {
      res.status(400).json({ success: false, error: 'No audio data provided' });
      return;
    }

    // Step 1: Convert speech to text
    console.log('Processing speech to text...');
    const audioBytes = Buffer.from(audio, 'base64');
    
    const request = {
      audio: {
        content: audioBytes,
      },
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'latest_long',
      },
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    if (!transcription.trim()) {
      res.status(400).json({ 
        success: false, 
        error: 'No speech detected. Please try speaking more clearly.' 
      });
      return;
    }

    console.log('Transcript:', transcription);

    // Step 2: Generate code using Gemini
    console.log('Generating code with Gemini...');
    const codePrompt = createCodePrompt(transcription, language);
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: codePrompt }] }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.1,
      },
    });

    const generatedCode = result.response.candidates[0].content.parts[0].text;
    
    // Clean up the generated code (remove markdown formatting if present)
    const cleanCode = cleanGeneratedCode(generatedCode);

    console.log('Code generated successfully');

    res.json({
      success: true,
      transcript: transcription,
      code: cleanCode,
      language: language
    });

  } catch (error) {
    console.error('Error processing voice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process voice input. Please try again.'
    });
  }
});

function createCodePrompt(transcript, language) {
  const languageInstructions = {
    javascript: 'Generate clean, modern JavaScript code. Use ES6+ features when appropriate.',
    python: 'Generate clean Python code following PEP 8 standards. Use type hints when helpful.',
    java: 'Generate clean Java code with proper class structure and naming conventions.',
    cpp: 'Generate clean C++ code with proper headers and modern C++ features.',
    html: 'Generate semantic HTML5 code with proper structure and accessibility.',
    css: 'Generate modern CSS with flexbox/grid and responsive design principles.'
  };

  return `You are a code generation assistant. Convert the following natural language request into ${language} code.

Request: "${transcript}"

Requirements:
- ${languageInstructions[language] || 'Generate clean, well-structured code.'}
- Include helpful comments
- Make the code production-ready
- If the request is unclear, make reasonable assumptions
- Only return the code, no explanations or markdown formatting

Generate the ${language} code:`;
}

function cleanGeneratedCode(code) {
  // Remove markdown code blocks if present
  let cleaned = code.replace(/```[\w]*\n?/g, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // If it starts with common explanatory phrases, remove them
  const unwantedPrefixes = [
    'Here\'s the code:',
    'Here is the code:',
    'The code is:',
    'Here\'s your code:',
    'Here is your code:'
  ];
  
  for (const prefix of unwantedPrefixes) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.substring(prefix.length).trim();
      break;
    }
  }
  
  return cleaned;
}

// Export for testing
module.exports = { createCodePrompt, cleanGeneratedCode };