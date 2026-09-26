# 🎯 Rehearse AI – Web-Powered Mock Interview Platform

An intelligent, web-augmented AI Mock Interviewer built with **Google Gemini 2.5 Flash** and **Firecrawl**. Rehearse AI analyzes your PDF resume, researches real-world interview questions and engineering culture for your target company, and conducts an interactive voice-enabled mock interview with detailed real-time scoring.

---

## ✨ Key Features

- 📄 **PDF Resume Parser & Drag & Drop**: Drag & drop your PDF resume for instant text extraction.
- 🌐 **Real-time Web Research**: Automatically searches the web via Firecrawl for reported interview questions and tech stack insights for your target role & company.
- 🎙️ **Voice-Enabled Mock Interview**: Speech-to-Text answer recording + Text-to-Speech voice prompts for realistic interview practice.
- 📊 **Detailed Evaluation & Feedback**: Instant 0–10 scoring with detailed analysis of strengths, areas for improvement, and sample answers.
- 🌓 **Dark & Light Mode**: Sleek UI with seamless theme switching and responsive glassmorphism aesthetic.
- 📈 **Performance Report**: Comprehensive summary report generated upon interview completion.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or higher
- **Gemini API Key**: Get your free key at [Google AI Studio](https://aistudio.google.com/)
- **Firecrawl API Key** *(Optional)*: Get a key at [Firecrawl](https://firecrawl.dev/) for real-time web research

### 2. Installation & Setup

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/Vastav02/ai-interview-mvp.git

# Navigate into the project directory
cd ai-interview-mvp

# Install dependencies
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory (or copy from `.env.example`):

```env
GEMINI_API_KEY=your_gemini_api_key_here
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
PORT=3000
```

### 4. Run the Application

```bash
# Start the development server
npm start
```

Open your browser and navigate to `http://localhost:3000`.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: Vanilla JavaScript (Modular ES Modules), HTML5, Custom CSS with Light/Dark Mode variables, Web Speech API.
- **Backend**: Node.js, Express.js.
- **AI Models**: Google Gemini 2.5 Flash (`@google/genai`).
- **Research Engine**: Firecrawl Search API.
- **PDF Extraction**: `pdf-parse`.

---

## 📜 License

MIT License. Free to use and modify!
