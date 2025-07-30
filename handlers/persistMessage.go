package handlers

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"github/sabt-dev/realtimeChat/models"
)

// PersistMessage handles the persistence of a message to the file system
func PersistMessage(msg *models.Message) error {
	// Create a folder for the room if it doesn't exist
	folderName := filepath.Join("persistence", msg.Room)
	if _, err := os.Stat(folderName); os.IsNotExist(err) {
		if err := os.MkdirAll(folderName, 0755); err != nil {
			log.Printf("Error creating folder: %v", err)
			return err
		}
	}

	// Create a file with a unique name based on message ID and timestamp inside the room's folder
	filename := filepath.Join(folderName, "message_"+msg.ID+"_"+msg.Timestamp.Format("2006_01_02_15_04_05")+".json")

	// Convert message to JSON
	messageJSON, err := json.MarshalIndent(msg, "", "  ")
	if err != nil {
		log.Printf("Error marshaling message to JSON: %v", err)
		return err
	}

	// Write message to file
	if err := os.WriteFile(filename, messageJSON, 0644); err != nil {
		log.Printf("Error writing message to file: %v", err)
		return err
	}

	log.Printf("Message persisted to file: %s", filename)
	return nil
}
