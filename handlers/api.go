package handlers

import (
	"net/http"
	"strconv"

	"github/sabt-dev/realtimeChat/services"

	"github.com/gin-gonic/gin"
)

// GetRooms returns all available rooms
func GetRooms(c *gin.Context) {
	roomService := services.NewRoomService()

	// Get all rooms from database
	dbRooms, err := roomService.GetAllRooms()
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
		})
	}

	// Add any active rooms that might not be in the database yet
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
