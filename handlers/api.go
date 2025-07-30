package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github/sabt-dev/realtimeChat/models"

	"github.com/gin-gonic/gin"
)

// GetRooms returns all active rooms
func GetRooms(c *gin.Context) {
	chatHub.mutex.RLock()
	defer chatHub.mutex.RUnlock()

	rooms := make([]gin.H, 0)
	for _, room := range chatHub.rooms {
		clientNames := make([]string, 0)
		for _, client := range room.Clients {
			clientNames = append(clientNames, client.Name)
		}

		rooms = append(rooms, gin.H{
			"id":      room.ID,
			"name":    room.Name,
			"clients": clientNames,
			"count":   len(room.Clients),
		})
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

	// Read messages from persistence folder
	folderPath := filepath.Join("persistence", roomName)
	messages := make([]*models.Message, 0)

	// Check if folder exists
	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		c.JSON(http.StatusOK, gin.H{
			"room":     roomName,
			"messages": messages,
		})
		return
	}

	// Read all message files in the room folder
	err := filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories and non-JSON files
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".json") {
			return nil
		}

		// Read and parse message file
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		var message models.Message
		if err := json.Unmarshal(data, &message); err != nil {
			return err
		}

		messages = append(messages, &message)
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read messages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"room":     roomName,
		"messages": messages,
	})
}
