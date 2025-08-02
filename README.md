# 💬 RealtimeChat

A modern, real-time chat application built with Go and WebSockets, featuring OAuth authentication, media sharing, message management, and a beautiful neon-themed UI with advanced scrolling and media handling.

![Chat Application](https://img.shields.io/badge/Status-Active-brightgreen)
![Go Version](https://img.shields.io/badge/Go-1.23+-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

### 🔐 Authentication
- **OAuth Integration**: Login with GitHub and Google
- **Session Management**: Secure session handling with persistent login
- **User Profiles**: Display user avatars and information

### 💬 Real-time Messaging
- **WebSocket Communication**: Instant message delivery with heartbeat monitoring
- **Multiple Rooms**: Join and switch between different chat rooms
- **Message History**: Persistent chat history with room-specific storage using GORM
- **Live User Count**: See active users in each room
- **Auto-reconnection**: Automatic reconnection on connection loss with exponential backoff
- **Message Management**: Delete your own messages with confirmation
- **Smart Scrolling**: Enhanced auto-scrolling with manual override detection

### 📱 Media Sharing
- **Image Support**: Upload and share JPEG, PNG, GIF, WebP images
- **Video Support**: Upload and share MP4, WebM, MOV, AVI videos
- **Drag & Drop**: Easy file uploading with drag and drop interface
- **Paste Images**: Paste images directly from clipboard
- **URL Media Detection**: Automatically detect and embed media from URLs
- **File Management**: Automatic file cleanup when messages are deleted
- **File Size Limits**: 10MB limit for optimal performance
- **Preview System**: Media preview before sending with removal option

### 🎨 Modern UI/UX
- **Neon Theme**: Beautiful glowing effects and animations
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Dark Theme**: Eye-friendly dark interface with neon accents
- **Smooth Animations**: Polished user interactions and transitions
- **Message Bubbles**: Distinct styling for own vs others' messages
- **Avatar System**: User avatars positioned outside message bubbles
- **Visual Feedback**: Loading indicators and connection status
- **Enhanced Scrolling**: Smart auto-scroll with ResizeObserver and MutationObserver

### 🛠️ Advanced Features
- **Message Deletion**: Delete your own messages with database and file cleanup
- **Intelligent Scrolling**: 
  - Auto-scroll for new messages when user is at bottom
  - Manual scroll detection with notification for new messages
  - Enhanced media loading detection with multiple fallback scrolls
  - ResizeObserver for media size changes
  - MutationObserver for DOM changes
- **Link Processing**: Automatic clickable links in messages with security
- **Upload Progress**: Visual feedback during file uploads with progress bars
- **Connection Management**: Real-time connection status with automatic recovery
- **New Message Notifications**: Notification counter when scrolled up
- **Media File Cleanup**: Automatic deletion of media files from filesystem when messages are deleted
- **Join/Leave Messages**: System messages for user room activity
- **Enhanced Debugging**: Comprehensive logging for troubleshooting

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
├── main.go                     # Application entry point with Gin server setup
├── go.mod                      # Go module dependencies
├── go.sum                      # Dependency checksums
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── LICENSE                    # MIT License
├── README.md                  # Project documentation
├── database/                  # Database configuration and setup
├── handlers/                  # HTTP and WebSocket handlers
│   ├── api.go                 # REST API endpoints
│   ├── fileUpload.go          # File upload handlers with validation
│   ├── handleWSConnection.go  # WebSocket connection and message management
│   └── persistMessage.go     # Message persistence logic
├── middleware/                # HTTP middleware
│   └── auth.go               # OAuth authentication middleware
├── models/                    # Data models and structures
│   └── message.go            # Message, User, Room models with GORM
├── services/                  # Business logic services
│   └── database_service.go   # Database operations (User, Room, Message services)
├── static/                    # Frontend assets
│   ├── index.html            # Main HTML page with responsive design
│   ├── styles.css            # Application styles with neon theme
│   └── chat.js               # Enhanced chat functionality with advanced scrolling
└── uploads/                   # File upload directory (auto-created)
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
| `DB_HOST` | Database host (default: localhost) | No |
| `DB_PORT` | Database port (default: 5432) | No |
| `DB_NAME` | Database name (default: realtimechat) | No |
| `DB_USER` | Database user (default: postgres) | No |
| `DB_PASSWORD` | Database password | No |

## 🗃️ Database Integration

### GORM Models
The application uses GORM (Go Object-Relational Mapping) for database operations with the following models:

#### User Model
```go
type User struct {
    ID        uint      `gorm:"primaryKey"`
    Name      string    `gorm:"not null"`
    Email     string    `gorm:"uniqueIndex;not null"`
    Avatar    string
    CreatedAt time.Time
    UpdatedAt time.Time
    Messages    []Message    `gorm:"foreignKey:SenderID"`
    RoomMembers []RoomMember `gorm:"foreignKey:UserID"`
}
```

#### Room Model
```go
type Room struct {
    ID          uint      `gorm:"primaryKey"`
    Name        string    `gorm:"uniqueIndex;not null"`
    Description string
    CreatedAt   time.Time
    UpdatedAt   time.Time
    Messages []Message    `gorm:"foreignKey:RoomID"`
    Members  []RoomMember `gorm:"foreignKey:RoomID"`
}
```

#### Message Model
```go
type Message struct {
    ID        uint           `gorm:"primaryKey"`
    UUID      string         `gorm:"uniqueIndex;not null"`
    SenderID  uint           `gorm:"not null"`
    RoomID    uint           `gorm:"not null"`
    Text      string
    Type      string         `gorm:"not null;default:message"`
    MediaURL  string
    MediaType string
    FileName  string
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"`
    Sender User `gorm:"foreignKey:SenderID"`
    Room   Room `gorm:"foreignKey:RoomID"`
}
```

### Database Services
- **UserService**: Handles user creation, authentication, and profile management
- **RoomService**: Manages chat rooms and user memberships
- **MessageService**: Handles message CRUD operations with media file cleanup

### Features
- **Soft Deletes**: Messages are soft-deleted, maintaining data integrity
- **Automatic Migrations**: Database schema automatically created and updated
- **Foreign Key Relationships**: Proper relational data modeling
- **File Cleanup**: Orphaned media files automatically removed when messages are deleted

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

// Send a media message (file upload)
{
  "type": "media",
  "mediaUrl": "/uploads/image.jpg",
  "mediaType": "image",
  "fileName": "image.jpg",
  "text": "Optional caption"
}

// Send a media message (URL)
{
  "type": "media",
  "mediaUrl": "https://example.com/image.jpg",
  "mediaType": "image", 
  "fileName": "image.jpg",
  "text": "Optional caption"
}

// Delete a message (with automatic file cleanup)
{
  "type": "delete",
  "messageId": "uuid"
}

// Heartbeat ping (connection monitoring)
{
  "type": "ping"
}
```

### Server to Client
```javascript
// Regular text message
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
  "type": "join", // or "leave"
  "text": "user123 joined the room",
  "timestamp": "2025-01-01T12:00:00Z"
}

// Message deletion notification
{
  "type": "delete",
  "id": "uuid",
  "sender": "user123",
  "timestamp": "2025-01-01T12:00:00Z"
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

- **OAuth Authentication**: Secure third-party authentication with GitHub and Google
- **Session Management**: Encrypted session cookies with secure handling
- **File Upload Validation**: Comprehensive type, size, and security restrictions
- **File Cleanup**: Automatic removal of orphaned media files when messages are deleted
- **XSS Protection**: HTML escaping and sanitization for all user inputs
- **CSRF Protection**: Session-based request validation
- **Secure Headers**: Security-focused HTTP headers
- **Path Traversal Protection**: Safe file path handling in uploads directory
- **Authorization Checks**: Message deletion restricted to message owners
- **Input Validation**: Server-side validation for all WebSocket messages

## 🚀 Performance Optimizations

- **WebSocket Connection Pooling**: Efficient connection management with heartbeat monitoring
- **File Size Limits**: 10MB upload limit for optimal performance and bandwidth
- **Smart Scrolling**: 
  - ResizeObserver for tracking media loading and layout changes
  - MutationObserver for DOM change detection
  - Multiple fallback scroll attempts with progressive delays
  - Instant scrolling mode for history loading
- **Image Optimization**: Efficient media loading with proper event handling
- **Message Pagination**: Smart message history loading to reduce initial load time
- **Connection Recovery**: Automatic reconnection with exponential backoff
- **Debounced Scrolling**: Optimized scroll event handling to prevent performance issues
- **File Cleanup**: Background file deletion to prevent disk space issues
- **Database Optimization**: GORM with proper indexing and soft deletes
- **Memory Management**: Proper cleanup of object URLs and event listeners

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

### 🎯 Planned Features
- [ ] Message reactions and emojis
- [ ] Private messaging between users
- [ ] Voice and video calls integration
- [ ] Advanced message search functionality
- [ ] User roles and permissions (admin, moderator)
- [ ] Bot integration and webhooks
- [ ] End-to-end message encryption
- [ ] Message threading and replies
- [ ] File sharing beyond media (documents, PDFs)
- [ ] Message formatting (markdown support)

### 🏗️ Technical Improvements
- [ ] Database migration to PostgreSQL/MongoDB
- [ ] Redis for session storage and scaling
- [ ] Horizontal scaling with load balancing
- [ ] CDN integration for media files
- [ ] Rate limiting and anti-spam measures
- [ ] Message editing functionality
- [ ] Offline mode with sync when online
- [ ] Push notifications

### 📱 Platform Expansion
- [ ] Mobile applications (React Native/Flutter)
- [ ] Desktop applications (Electron)
- [ ] Progressive Web App (PWA) features
- [ ] Browser notifications
- [ ] Dark/light theme toggle

### ✅ Recently Implemented
- [x] Message deletion with file cleanup
- [x] Enhanced auto-scrolling with media detection
- [x] URL media preview and embedding
- [x] Advanced connection management
- [x] File upload with drag & drop
- [x] Clipboard image pasting
- [x] Real-time user count and room management
- [x] Join/leave system messages
- [x] Comprehensive error handling and logging

---

Made with ❤️ by [sabt-dev](https://github.com/sabt-dev)
