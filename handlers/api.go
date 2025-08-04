package handlers

import (
	"net/http"
	"strconv"

	"github/sabt-dev/realtimeChat/middleware"
	"github/sabt-dev/realtimeChat/models"
	"github/sabt-dev/realtimeChat/services"

	"github.com/gin-gonic/gin"
)

// GetRooms returns all available rooms (now user-specific for private rooms)
func GetRooms(c *gin.Context) {
	// Get user from auth middleware
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	user, ok := userInterface.(*middleware.SessionUser)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user data"})
		return
	}

	roomService := services.NewRoomService()
	userService := services.NewUserService()

	// Get user from database to get the ID
	dbUser, err := userService.CreateOrGetUser(user.Name, user.Email, user.Avatar)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user"})
		return
	}

	// Get user-accessible rooms (public + their private rooms)
	dbRooms, err := roomService.GetUserRooms(dbUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rooms"})
		return
	}

	// Combine database rooms with active client information
	chatHub.mutex.RLock()
	defer chatHub.mutex.RUnlock()

	rooms := make([]gin.H, 0)

	// Add rooms from database with their active client counts
	for _, dbRoom := range dbRooms {
		roomName := dbRoom["name"].(string)
		clientNames := make([]string, 0)
		clientCount := 0

		// Check if room has active clients
		if activeRoom, exists := chatHub.rooms[roomName]; exists {
			for _, client := range activeRoom {
				clientNames = append(clientNames, client.Name)
			}
			clientCount = len(activeRoom)
		}

		rooms = append(rooms, gin.H{
			"id":          dbRoom["id"],
			"name":        roomName,
			"description": dbRoom["description"],
			"clients":     clientNames,
			"count":       clientCount,
			"memberCount": dbRoom["memberCount"], // Total members from DB
			"is_private":  dbRoom["is_private"],
		})
	}

	// Add any active public rooms that might not be in the database yet
	for roomName, activeRoom := range chatHub.rooms {
		// Check if this room is already in our list
		found := false
		for _, room := range rooms {
			if room["name"] == roomName {
				found = true
				break
			}
		}

		if !found {
			// Check if user can access this room (in case it's a private room)
			canAccess, err := roomService.CanUserAccessRoom(dbUser.ID, roomName)
			if err != nil || !canAccess {
				continue // Skip rooms user can't access
			}

			clientNames := make([]string, 0)
			for _, client := range activeRoom {
				clientNames = append(clientNames, client.Name)
			}

			rooms = append(rooms, gin.H{
				"id":          roomName,
				"name":        roomName,
				"description": "",
				"clients":     clientNames,
				"count":       len(activeRoom),
				"memberCount": 0,
				"is_private":  false, // Assume false for rooms not in DB
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"rooms": rooms,
	})
}

// GetRoomMessages returns persisted messages for a specific room
func GetRoomMessages(c *gin.Context) {
	roomName := c.Param("room")
	if roomName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room name is required"})
		return
	}

	// SECURITY: Get user from auth middleware to validate access
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	user, ok := userInterface.(*middleware.SessionUser)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user data"})
		return
	}

	// Get user from database to get the ID
	userService := services.NewUserService()
	dbUser, err := userService.CreateOrGetUser(user.Name, user.Email, user.Avatar)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user"})
		return
	}

	// SECURITY: Validate that user has access to this room before serving messages
	roomService := services.NewRoomService()
	canAccess, err := roomService.CanUserAccessRoom(dbUser.ID, roomName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify room access"})
		return
	}

	if !canAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied to this room"})
		return
	}

	// Parse pagination parameters
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 50
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		offset = 0
	}

	messageService := services.NewMessageService()
	messages, err := messageService.GetRoomMessages(roomName, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	// Convert messages to response format
	var messageResponses []interface{}
	for _, msg := range messages {
		messageResponses = append(messageResponses, msg.ToResponse())
	}

	c.JSON(http.StatusOK, gin.H{
		"room":     roomName,
		"messages": messageResponses,
	})
}

// SearchUsers searches for users by name or email
func SearchUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	limitStr := c.DefaultQuery("limit", "10")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 10
	}

	userService := services.NewUserService()
	users, err := userService.SearchUsers(query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search users"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"users": users,
	})
}

// CreatePrivateRoom creates a new private room with specified members
func CreatePrivateRoom(c *gin.Context) {
	// Get user from auth middleware
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	user, ok := userInterface.(*middleware.SessionUser)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user data"})
		return
	}

	var req models.CreatePrivateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	// Validate room name
	if len(req.RoomName) < 3 || len(req.RoomName) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room name must be between 3 and 50 characters"})
		return
	}

	// Validate user emails
	if len(req.UserEmails) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one user email is required"})
		return
	}

	userService := services.NewUserService()
	roomService := services.NewRoomService()

	// Get creator user from database
	creator, err := userService.CreateOrGetUser(user.Name, user.Email, user.Avatar)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get creator user"})
		return
	}

	// Get users by emails
	invitedUsers, err := userService.GetUsersByEmails(req.UserEmails)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get invited users"})
		return
	}

	// Check if all emails were found
	if len(invitedUsers) != len(req.UserEmails) {
		foundEmails := make(map[string]bool)
		for _, user := range invitedUsers {
			foundEmails[user.Email] = true
		}

		missingEmails := make([]string, 0)
		for _, email := range req.UserEmails {
			if !foundEmails[email] {
				missingEmails = append(missingEmails, email)
			}
		}

		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "Some users not found",
			"missing_emails": missingEmails,
		})
		return
	}

	// Collect user IDs (including creator)
	memberIDs := make([]uint, len(invitedUsers)+1)
	memberIDs[0] = creator.ID
	for i, user := range invitedUsers {
		memberIDs[i+1] = user.ID
	}

	// Create private room
	room, err := roomService.CreatePrivateRoom(req.RoomName, req.Description, creator.ID, memberIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create private room"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"room": gin.H{
			"id":          room.ID,
			"name":        room.Name,
			"description": room.Description,
			"is_private":  room.IsPrivate,
			"creator_id":  room.CreatorID,
		},
	})
}

// CreatePublicRoom creates a new public room
func CreatePublicRoom(c *gin.Context) {
	// Get user from auth middleware
	_, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	var req struct {
		RoomName string `json:"roomName" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate room name
	if len(req.RoomName) == 0 || len(req.RoomName) > 30 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room name must be between 1 and 30 characters"})
		return
	}

	roomService := services.NewRoomService()

	// Check if room already exists
	existingRoom, err := roomService.GetRoomByName(req.RoomName)
	if err == nil && existingRoom != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Room already exists"})
		return
	}

	// Create public room
	room, err := roomService.CreateOrGetRoom(req.RoomName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create public room"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"room": gin.H{
			"id":         room.ID,
			"name":       room.Name,
			"is_private": room.IsPrivate,
		},
	})

	// Broadcast room update to all connected clients
	go broadcastRoomUpdate(room.Name)
}
