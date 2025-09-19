import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Square, Copy, Download } from 'lucide-react';
import Editor from '@monaco-editor/react';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Initialize audio visualization
  const initializeAudioVisualization = (stream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 256;
    microphone.connect(analyser);
    analyserRef.current = analyser;
    
    const updateAudioLevel = () => {
      if (!analyserRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      setAudioLevel(Math.min(average / 128, 1));
      
      if (isRecording) {
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      }
    };
    
    updateAudioLevel();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = () => {
        processAudio();
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      initializeAudioVisualization(stream);
      setIsRecording(true);
      toast.success('Recording started! Speak your code request...');
      
    } catch (error) {
      toast.error('Microphone access denied. Please allow microphone access.');
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioLevel(0);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      toast.success('Recording stopped. Processing your request...');
    }
  };

  const processAudio = async () => {
    setIsProcessing(true);
    
    try {
      // Create audio blob
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Convert to base64 for API call
      const base64Audio = await blobToBase64(audioBlob);
      
      // Call our backend API
      const response = await fetch('https://us-central1-verbalize-472619.cloudfunctions.net/processVoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: base64Audio,
          language: language
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setTranscript(result.transcript);
        setGeneratedCode(result.code);
        toast.success('Code generated successfully!');
      } else {
        toast.error(result.error || 'Failed to process audio');
      }
      
    } catch (error) {
      console.error('Error processing audio:', error);
      toast.error('Failed to process your request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    toast.success('Code copied to clipboard!');
  };

  const downloadCode = () => {
    const extensions = {
      javascript: 'js',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      html: 'html',
      css: 'css'
    };
    
    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verbalize_output.${extensions[language] || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Code downloaded!');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="app">
      <Toaster position="top-right" />
      
      <header className="header">
        <h1>Verbalize</h1>
        <p>Transform your voice into code instantly</p>
      </header>

      <main className="main">
        {/* Recording Section */}
        <section className="recording-section">
          <div className="language-selector">
            <label>Target Language:</label>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isRecording || isProcessing}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>
          </div>

          <div className="recording-controls">
            <button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
            >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            
            {isRecording && (
              <div className="audio-visualizer">
                <div 
                  className="audio-level" 
                  style={{ 
                    height: `${Math.max(audioLevel * 100, 5)}%`,
                    backgroundColor: `hsl(${120 - (audioLevel * 60)}, 70%, 50%)`
                  }}
                />
              </div>
            )}
          </div>

          {isProcessing && (
            <div className="processing">
              <div className="spinner"></div>
              <p>Processing your voice input...</p>
            </div>
          )}
        </section>

        {/* Results Section */}
        {(transcript || generatedCode) && (
          <section className="results-section">
            {transcript && (
              <div className="transcript">
                <h3>What you said:</h3>
                <p>"{transcript}"</p>
              </div>
            )}

            {generatedCode && (
              <div className="code-output">
                <div className="code-header">
                  <h3>Generated Code ({language}):</h3>
                  <div className="code-actions">
                    <button onClick={copyToClipboard} title="Copy to clipboard">
                      <Copy size={16} />
                    </button>
                    <button onClick={downloadCode} title="Download file">
                      <Download size={16} />
                    </button>
                  </div>
                </div>
                <Editor
                  height="400px"
                  defaultLanguage={language}
                  value={generatedCode}
                  theme="vs-dark"
                  options={{
                    readOnly: false,
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on'
                  }}
                  onChange={(value) => setGeneratedCode(value)}
                />
              </div>
            )}
          </section>
        )}

        {/* Getting Started Section */}
        {!transcript && !generatedCode && !isRecording && !isProcessing && (
          <section className="getting-started">
            <h2>Getting Started</h2>
            <div className="examples">
              <h3>Try saying:</h3>
              <ul>
                <li>"Create a React component for a user login form"</li>
                <li>"Write a Python function to calculate fibonacci numbers"</li>
                <li>"Build a REST API endpoint for user authentication"</li>
                <li>"Generate CSS for a responsive navigation bar"</li>
                <li>"Create a JavaScript function to validate email addresses"</li>
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;