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

// LoadMessageFromFile loads a specific message by ID from the file system
func LoadMessageFromFile(room, messageID string) (*models.Message, error) {
	folderName := filepath.Join("persistence", room)

	// Read all files in the room folder
	files, err := os.ReadDir(folderName)
	if err != nil {
		return nil, err
	}

	// Look for the file containing this message ID
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		// Check if filename contains the message ID
		if filepath.Ext(file.Name()) == ".json" &&
			len(file.Name()) > len("message_"+messageID) &&
			file.Name()[8:8+len(messageID)] == messageID {

			// Read and parse the file
			filePath := filepath.Join(folderName, file.Name())
			data, err := os.ReadFile(filePath)
			if err != nil {
				continue
			}

			var message models.Message
			if err := json.Unmarshal(data, &message); err != nil {
				continue
			}

			return &message, nil
		}
	}

	return nil, os.ErrNotExist
}

// DeleteMessageFromFile deletes a specific message by ID from the file system
func DeleteMessageFromFile(room, messageID string) error {
	folderName := filepath.Join("persistence", room)

	// Read all files in the room folder
	files, err := os.ReadDir(folderName)
	if err != nil {
		return err
	}

	// Look for the file containing this message ID
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		// Check if filename contains the message ID
		if filepath.Ext(file.Name()) == ".json" &&
			len(file.Name()) > len("message_"+messageID) &&
			file.Name()[8:8+len(messageID)] == messageID {

			// Delete the file
			filePath := filepath.Join(folderName, file.Name())
			if err := os.Remove(filePath); err != nil {
				log.Printf("Error deleting message file %s: %v", filePath, err)
				return err
			}

			log.Printf("Message file deleted: %s", filePath)
			return nil
		}
	}

	return os.ErrNotExist
}
