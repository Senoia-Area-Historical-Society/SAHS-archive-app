# SAHS Archive Application

[![Deploy to Firebase Hosting](https://github.com/Senoia-Area-Historical-Society/SAHS-archive-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/Senoia-Area-Historical-Society/SAHS-archive-app/actions/workflows/deploy.yml)

The official digital archives platform for the **Senoia Area Historical Society (SAHS)**. This application provides a modern, high-performance interface for browsing, searching, and managing historical documents, artifacts, figures, and organizations related to the rich history of Senoia, Georgia.

## 🚀 Live Site
- Visit us online at: **[senoiahistory.com](https://senoiahistory.com)**
- Visit the public archive at: **[archives.senoiahistory.com](https://archives.senoiahistory.com)**

## ✨ Key Features
- **Unified Search**: Quickly find documents, artifacts, and historical figures across the entire archive.
- **Curated Collections**: Explore categorized groups of items focused on specific themes or time periods.
- **Modern UI**: A premium, responsive design built with React 19 and Tailwind CSS.
- **Firebase Backend**: Real-time data management with Firestore and media storage with Firebase Storage.
- **AI-Powered Metadata**: Integrated with Google Gemini for automated metadata extraction from historical documents.

## 🛠️ Tech Stack
- **Frontend**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS
- **Backend / Database**: Firebase Firestore & Storage
- **Icons**: Lucide React
- **AI**: Google Generative AI (Gemini)

## 🐳 Try it with Docker

Run a private, blank copy for your own museum with `docker compose up`, with no
Firebase account needed. See [docs/DOCKER.md](docs/DOCKER.md).

## 📦 Development

### Prerequisites
- Node.js (Latest LTS recommended)
- Firebase Account & Project Configuration

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Firebase configuration.
4. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production
```bash
npm run build
```

---
© 2026 Senoia Area Historical Society

## 📄 License

Copyright © 2026 Senoia Area Historical Society and contributors.

This software is released under the MIT License. See [LICENSE](LICENSE) for the
full text.

The license covers the software only. Photographs, logos and other collection
content belonging to the Senoia Area Historical Society are not covered and may
not be reused without permission.
