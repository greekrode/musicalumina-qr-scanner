# 📱 Musica Lumina QR Scanner PWA

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)

*A lightning-fast Progressive Web App for seamless event check-ins and QR code scanning*

</div>

---

## 📖 Overview

A lightweight Progressive Web App designed specifically for the **Musica Lumina** competition that provides fast, reliable QR code scanning with JWT verification and participant authentication. Built with modern web technologies, this PWA offers offline capabilities, camera access, and real-time database verification for smooth event check-ins.

---

## ✨ Features

### 📸 QR Code Scanning
- **⚡ Fast Scanning**: WebAssembly-powered QR code recognition with instant results
- **📱 Camera Integration**: Direct camera access with optimized scanning interface
- **🔍 JWT Decoding**: Automatic JWT payload extraction and signature verification
- **📊 Real-time Validation**: Cross-reference participant data with Supabase database

### 🔐 Authentication & Security
- **🛡️ Clerk Authentication**: Secure user login and session management
- **🔑 JWT Verification**: Cryptographic signature validation for QR code tokens
- **👥 Participant Verification**: Database-backed participant authenticity checks
- **💾 Smart Caching**: Local caching to avoid rate limits and improve performance

### 📱 Progressive Web App
- **🚀 Installable**: Add to home screen for native app-like experience
- **📴 Offline Ready**: Service worker enables offline functionality
- **🔄 Auto-sync**: Automatic data synchronization when connection is restored
- **📈 Performance**: Optimized for speed and reliability

### 🎯 Event Management
- **📝 Scan History**: Complete log of all scanned QR codes and results
- **🔗 Deep Links**: Optional navigation to external resources
- **📊 Real-time Results**: Instant feedback on scan success/failure
- **🎨 Themed UI**: Custom Musica Lumina branding and color palette

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| ![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react) | 18.2.0 | Frontend Framework |
| ![TypeScript](https://img.shields.io/badge/TypeScript-5.0.2-3178C6?logo=typescript) | 5.0.2 | Type Safety |
| ![Vite](https://img.shields.io/badge/Vite-4.4.5-646CFF?logo=vite) | 4.4.5 | Build Tool & Dev Server |
| ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.3.0-06B6D4?logo=tailwindcss) | 3.3.0 | Utility-first Styling |
| ![Supabase](https://img.shields.io/badge/Supabase-2.38.0-3ECF8E?logo=supabase) | 2.38.0 | Database & API |
| ![Clerk](https://img.shields.io/badge/Clerk-4.23.2-6C47FF?logo=clerk) | 4.23.2 | Authentication |
| ![qr-scanner](https://img.shields.io/badge/qr--scanner-1.4.2-FF6B6B?logo=qr-code) | 1.4.2 | WebAssembly QR Reader |

### 🏗️ Architecture
- **Frontend**: React 18 + TypeScript + Vite for fast development
- **Styling**: Tailwind CSS with custom Musica Lumina color palette
- **Authentication**: Clerk for secure user management
- **Database**: Supabase PostgreSQL with REST API
- **QR Scanning**: qr-scanner library with WebAssembly for performance
- **PWA**: Service worker for offline functionality and caching
- **Build Tool**: Vite for lightning-fast builds and HMR

---

## 🚀 How It Works

### 🔄 Application Flow

1. **🔐 User Authentication**
   - User signs in via Clerk authentication
   - Session management and role-based access control

2. **📷 Camera Access & Scanning**
   - App requests camera permissions
   - Real-time QR code detection using WebAssembly
   - Instant visual feedback for successful scans

3. **🔍 JWT Processing**
   - Automatic detection of JWT tokens in QR codes
   - Cryptographic signature verification
   - Payload decoding and extraction

4. **✅ Participant Verification**
   - Cross-reference participant data with Supabase database
   - Smart local caching to optimize performance
   - Real-time validation results

5. **📊 Results & History**
   - Instant display of scan results
   - Persistent scan history with timestamps
   - Optional deep linking to external resources

---

## 🚀 Getting Started

### 📋 Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account and project
- Clerk account and application

### ⚙️ Installation

1. **📥 Clone the repository**
   ```bash
   git clone https://github.com/your-username/musicalumina-qr-scanner.git
   cd musicalumina-qr-scanner
   ```

2. **📦 Install dependencies**
   ```bash
   npm install
   ```

3. **🔧 Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **🚀 Run development server**
   ```bash
   npm run dev
   ```

5. **🏗️ Build for production**
   ```bash
   npm run build
   ```

6. **👁️ Preview production build**
   ```bash
   npm run preview
   ```

---

## 🔐 Environment Variables

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

# JWT Configuration (optional)
VITE_JWT_SECRET=your_jwt_verification_secret
```

---

## 🏗️ Project Structure

```
musicalumina-qr-scanner/
├── 📁 public/
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker
├── 📁 src/
│   ├── 📁 components/
│   │   ├── AuthLayout.tsx     # Authentication wrapper
│   │   ├── JWTDecoder.tsx     # JWT processing component
│   │   └── QRScanner.tsx      # Main QR scanning interface
│   ├── 📁 lib/
│   │   └── supabase.ts        # Supabase client configuration
│   ├── 📁 utils/
│   │   ├── jwtDecoder.ts      # JWT utility functions
│   │   └── participantVerifier.ts # Participant validation
│   ├── App.tsx                # Main application component
│   ├── main.tsx               # Application entry point
│   └── index.css              # Global styles
├── package.json               # Dependencies and scripts
├── vite.config.ts             # Vite configuration
├── tailwind.config.js         # Tailwind configuration
└── tsconfig.json              # TypeScript configuration
```

---

## 🎯 Key Technical Features

### 1. ⚡ WebAssembly QR Scanning
**🎯 Advantage**: Ultra-fast QR code recognition using optimized WebAssembly binaries.

**✅ Implementation**: 
- qr-scanner library with WebAssembly backend
- Real-time camera stream processing
- Optimized for mobile devices and various lighting conditions

### 2. 🔐 JWT Security
**🎯 Advantage**: Cryptographic verification ensures QR code authenticity.

**✅ Implementation**:
- Automatic JWT detection in QR code payloads
- Signature verification using configured secrets
- Payload extraction and validation

### 3. 📱 Progressive Web App
**🎯 Advantage**: Native app-like experience with web accessibility.

**✅ Implementation**:
- Service worker for offline functionality
- Installable PWA with app manifest
- Optimized caching strategies

### 4. 🚀 Performance Optimization
**🎯 Advantage**: Fast loading and responsive user experience.

**✅ Implementation**:
- Vite for lightning-fast development and builds
- Smart caching to reduce database calls
- Optimized bundle size and lazy loading

---

## 🎨 Design System

The application features a carefully crafted Musica Lumina brand identity:

- **🎹 Piano Wine**: Primary brand color for headers and navigation
- **🌟 Piano Gold**: Accent color for buttons and highlights  
- **🌸 Piano Cream**: Soft background for cards and content areas
- **🎨 Modern UI**: Clean, accessible interface optimized for mobile scanning

---

## 📱 PWA Features

- **🏠 Add to Home Screen**: Install directly from browser
- **📴 Offline Support**: Core functionality works without internet
- **🔄 Background Sync**: Automatic data synchronization when online
- **📊 Fast Loading**: Optimized caching for instant app startup
- **🔔 Push Notifications**: Optional notifications for scan results

---

## 🙏 Acknowledgments

- Built with ❤️ for the Musica Lumina competition organizers
- Special thanks to the qr-scanner library for WebAssembly QR recognition
- Powered by Supabase, Clerk, and the amazing React ecosystem

___