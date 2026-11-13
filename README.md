# Digital Archive

[![Deploy to Firebase Hosting](https://github.com/Senoia-Area-Historical-Society/SAHS-archive-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/Senoia-Area-Historical-Society/SAHS-archive-app/actions/workflows/deploy.yml)

An open-source digital archive for museums and historical societies. Staff
catalogue photographs, documents, artifacts, books and oral histories; the public
browses, searches and maps them. Each museum runs its own install, with its own
name, branding and Firebase project.

Built and used by the **Senoia Area Historical Society**. See it running at
**[archives.senoiahistory.com](https://archives.senoiahistory.com)**.

## ✨ Features
- **Search and browse** across items, collections and the book library.
- **Collections** of items grouped by theme or period, public or private.
- **Maps** of items by historical address, and an interactive floor plan of the museum.
- **Privacy per item and per collection**, enforced by Firestore and Storage rules.
- **Staff roles** (admin and curator) granted inside the app.
- **First-run Setup Wizard** that brands a new install as the adopting museum's own.
- **Research folders** that members can keep and share.

## 🛠️ Tech stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Backend**: Firebase Auth (Google sign-in), Firestore, Storage and Cloud Functions
- **Maps**: Leaflet
- **Icons**: Lucide React

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

## 📄 License

Copyright © 2026 Senoia Area Historical Society and contributors.

This software is released under the MIT License. See [LICENSE](LICENSE) for the
full text.

The license covers the software only. Photographs, logos and other collection
content belonging to the Senoia Area Historical Society, including everything in
`deploy/`, are not covered and may not be reused without permission.
