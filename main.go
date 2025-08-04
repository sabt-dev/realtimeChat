package main

import (
	"log"

	"github/sabt-dev/realtimeChat/database"
	"github/sabt-dev/realtimeChat/handlers"
	"github/sabt-dev/realtimeChat/middleware"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: .env file not found, using default values")
	}

	// Initialize database
	if err := database.InitDatabase(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize authentication
	middleware.InitAuth()

	// Start the chat hub
	handlers.StartHub()

	r := gin.Default()

	// 50MB limit for file uploads
	r.MaxMultipartMemory = 50 << 20

	// Serve static files (for the chat client)
	r.Static("/static", "./static")

	// Serve uploaded files
	r.Static("/uploads", "./uploads")

	// Authentication routes
	r.GET("/auth/:provider", middleware.BeginAuth)
	r.GET("/auth/:provider/callback", middleware.AuthCallback)
	r.POST("/auth/logout", middleware.Logout)
	r.GET("/auth/user", middleware.GetCurrentUser)
	r.GET("/auth/check", middleware.CheckAuth)

	// File upload route (requires authentication)
	r.POST("/upload", middleware.AuthMiddleware(), handlers.HandleFileUpload)

	// WebSocket endpoint (protected by auth)
	r.GET("/ws", middleware.AuthMiddleware(), handlers.HandleWSConnection)

	// Serve the chat page from static files
	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})
	// API endpoints for getting room information (protected by auth)
	r.GET("/api/rooms", middleware.AuthMiddleware(), handlers.GetRooms)
	r.GET("/api/rooms/:room/messages", middleware.AuthMiddleware(), handlers.GetRoomMessages)

	// New API endpoints for private rooms
	r.GET("/api/users/search", middleware.AuthMiddleware(), handlers.SearchUsers)
	r.POST("/api/rooms/private", middleware.AuthMiddleware(), handlers.CreatePrivateRoom)
	r.POST("/api/rooms/public", middleware.AuthMiddleware(), handlers.CreatePublicRoom)

	log.Println("Server starting on :8080")
	r.Run(":8080")
}
