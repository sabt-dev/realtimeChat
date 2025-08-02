# 💬 RealtimeChat

A modern, real-time chat application built with Go and WebSockets, featuring OAuth authentication, media sharing, and a beautiful neon-themed UI.

![Chat Application](https://img.shields.io/badge/Status-Active-brightgreen)
![Go Version](https://img.shields.io/badge/Go-1.23+-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

### 🔐 Authentication
- **OAuth Integration**: Login with GitHub and Google
- **Session Management**: Secure session handling with persistent login
- **User Profiles**: Display user avatars and information

### 💬 Real-time Messaging
- **WebSocket Communication**: Instant message delivery
- **Multiple Rooms**: Join and switch between different chat rooms
- **Message History**: Persistent chat history with room-specific storage
- **Live User Count**: See active users in each room
- **Auto-reconnection**: Automatic reconnection on connection loss

### 📱 Media Sharing
- **Image Support**: Upload and share JPEG, PNG, GIF, WebP images
- **Video Support**: Upload and share MP4, WebM, MOV, AVI videos
- **Drag & Drop**: Easy file uploading with drag and drop
- **Paste Images**: Paste images directly from clipboard
- **URL Media**: Automatically detect and embed media from URLs
- **File Size Limits**: 10MB limit for optimal performance

### 🎨 Modern UI/UX
- **Neon Theme**: Beautiful glowing effects and animations
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Theme**: Eye-friendly dark interface
- **Smooth Animations**: Polished user interactions
- **Message Bubbles**: Distinct styling for own vs others' messages
- **Avatar Positioning**: Avatars outside message bubbles
- **Spinning Glow Effects**: Dynamic visual effects

### 🛠️ Advanced Features
- **Message Deletion**: Delete your own messages
- **Scroll Management**: Smart auto-scrolling with manual override
- **Link Processing**: Automatic clickable links in messages
- **Upload Progress**: Visual feedback during file uploads
- **Connection Status**: Real-time connection status indicator
- **New Message Notifications**: Notification when scrolled up

## 🚀 Quick Start

### Prerequisites
- Go 1.23 or higher
- OAuth applications set up (GitHub and/or Google)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sabt-dev/realtimeChat.git
   cd realtimeChat
   ```

2. **Install dependencies**
   ```bash
   go mod download
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your OAuth credentials:
   ```env
   # GitHub OAuth (https://github.com/settings/developers)
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   
   # Google OAuth (https://console.cloud.google.com/apis/credentials)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   # Session secret (generate a random string)
   SESSION_SECRET=your_secure_session_secret
   ```

4. **Run the application**
   ```bash
   go run main.go
   ```

5. **Open your browser**
   Navigate to `http://localhost:8080`

## 🏗️ Project Structure

```
realtimeChat/
├── main.go                 # Application entry point
├── go.mod                  # Go module dependencies
├── go.sum                  # Dependency checksums
├── .env.example           # Environment variables template
├── .gitignore             # Git ignore rules
├── handlers/              # HTTP and WebSocket handlers
│   ├── handleWSConnection.go  # WebSocket connection management
│   ├── persistMessage.go     # Message persistence
│   └── upload.go         # File upload handlers
├── middleware/            # HTTP middleware
│   └──auth.go           # Authentication middleware
├── models/               # Data models
│   └── message.go        # Message structures
├── persistence/          # Data persistence 
├── static/               # Frontend assets
│   ├── index.html        # Main HTML page
│   ├── styles.css        # Application styles
│   └── chat.js           # Chat functionality
└── uploads/              # File upload directory
```

## 🔧 Configuration

### OAuth Setup

#### GitHub OAuth App
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL to: `http://localhost:8080/auth/github/callback`
4. Copy Client ID and Client Secret to `.env`

#### Google OAuth App
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:8080/auth/google/callback`
4. Copy Client ID and Client Secret to `.env`

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth App Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth App Client Secret | Yes |
| `SESSION_SECRET` | Secret key for session encryption | Yes |
| `PORT` | Server port (default: 8080) | No |

## 📡 API Endpoints

### Authentication
- `GET /auth/github` - GitHub OAuth login
- `GET /auth/google` - Google OAuth login
- `GET /auth/github/callback` - GitHub OAuth callback
- `GET /auth/google/callback` - Google OAuth callback
- `POST /auth/logout` - User logout
- `GET /auth/check` - Check authentication status

### Chat
- `GET /ws` - WebSocket connection for real-time chat
- `GET /api/rooms` - Get list of active rooms
- `GET /api/rooms/{room}/messages` - Get message history for a room

### File Upload
- `POST /upload` - Upload media files

### Static Files
- `GET /static/*` - Serve static assets
- `GET /uploads/*` - Serve uploaded files
- `GET /` - Main application page

## 🔌 WebSocket Events

### Client to Server
```javascript
// Join a room
{
  "username": "user123",
  "room": "general"
}

// Send a text message
{
  "type": "message",
  "text": "Hello, world!"
}

// Send a media message
{
  "type": "media",
  "mediaUrl": "/uploads/image.jpg",
  "mediaType": "image",
  "fileName": "image.jpg",
  "text": "Optional caption"
}

// Delete a message
{
  "type": "delete",
  "messageId": "uuid"
}

// Heartbeat ping
{
  "type": "ping"
}
```

### Server to Client
```javascript
// Regular message
{
  "id": "uuid",
  "type": "message",
  "text": "Hello, world!",
  "sender": "user123",
  "timestamp": "2025-01-01T12:00:00Z",
  "avatar": "https://avatar-url.com/avatar.jpg"
}

// Media message
{
  "id": "uuid",
  "type": "media",
  "mediaUrl": "/uploads/image.jpg",
  "mediaType": "image",
  "fileName": "image.jpg",
  "text": "Optional caption",
  "sender": "user123",
  "timestamp": "2025-01-01T12:00:00Z",
  "avatar": "https://avatar-url.com/avatar.jpg"
}

// System message (join/leave)
{
  "type": "join",
  "text": "user123 joined the room",
  "timestamp": "2025-01-01T12:00:00Z"
}

// Message deletion
{
  "type": "delete",
  "id": "uuid"
}
```

## 🎨 UI Features

### Responsive Design
- **Desktop**: Full-featured experience with large chat container
- **Tablet**: Optimized layout for medium screens
- **Mobile**: Touch-friendly interface with adapted controls

### Accessibility
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader Support**: Proper ARIA labels and semantics
- **High Contrast**: Clear visual hierarchy
- **Focus Management**: Visible focus indicators

### Visual Effects
- **Neon Glow**: Animated glowing borders and effects
- **Smooth Animations**: CSS transitions and keyframes
- **Message Animations**: Slide-in effects for new messages
- **Loading States**: Visual feedback during uploads and connections

## 🛡️ Security Features

- **OAuth Authentication**: Secure third-party authentication
- **Session Management**: Encrypted session cookies
- **File Upload Validation**: Type and size restrictions
- **XSS Protection**: HTML escaping and sanitization
- **CSRF Protection**: Session-based request validation
- **Secure Headers**: Security-focused HTTP headers

## 🚀 Performance Optimizations

- **WebSocket Connection Pooling**: Efficient connection management
- **File Size Limits**: 10MB upload limit for optimal performance
- **Image Lazy Loading**: Efficient media loading
- **Message Pagination**: Smart message history loading
- **Connection Recovery**: Automatic reconnection with exponential backoff

## 🔄 Development

### Running in Development
```bash
# Install air for hot reloading (optional)
go install github.com/cosmtrek/air@latest

# Run with hot reload
air

# Or run directly
go run main.go
```

### Building for Production
```bash
# Build binary
go build -o realtimeChat

# Run production binary
./realtimeChat
```

### Docker Deployment
```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
COPY --from=builder /app/static ./static
EXPOSE 8080
CMD ["./main"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow Go conventions and best practices
- Add tests for new features
- Update documentation for API changes
- Ensure responsive design for UI changes
- Test on multiple browsers and devices

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Gin Web Framework](https://github.com/gin-gonic/gin) - HTTP web framework
- [Gorilla WebSocket](https://github.com/gorilla/websocket) - WebSocket implementation
- [Goth](https://github.com/markbates/goth) - OAuth authentication
- [Google Fonts](https://fonts.google.com) - Typography
- [CSS Animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations) - Visual effects

## 🔮 Future Enhancements

- [ ] Message reactions and emojis
- [ ] Private messaging
- [ ] Voice and video calls
- [ ] Message search functionality
- [ ] User roles and permissions
- [ ] Bot integration
- [ ] Message encryption
- [ ] Database persistence (MongoDB)
- [ ] Redis for scaling
- [ ] Mobile applications (React Native/Flutter)

---

Made with ❤️ by [sabt-dev](https://github.com/sabt-dev)
