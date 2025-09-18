# Video Proctoring System

AI-powered video proctoring solution for remote interviews and examinations.

## Features

- Real-time AI detection (focus, objects, faces)
- WebRTC video streaming
- Live monitoring dashboard
- PDF report generation
- Socket.IO real-time communication

## Tech Stack

- **Backend**: Node.js, Express, MongoDB, Socket.IO
- **Frontend**: React, Vite, TensorFlow.js, WebRTC
- **AI**: MediaPipe, COCO-SSD, BlazeFace

## Quick Start

### Backend
```bash
cd Backend
npm install
npm start
```

### Frontend
```bash
cd Frontend
npm install
npm run dev
```

## Deployment

Backend ready for Render deployment with environment variables configured.

## Usage

1. Interviewer creates session
2. Candidate joins with session ID
3. Real-time monitoring with AI detection
4. Generate PDF reports

Built for secure, reliable remote proctoring.