package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github/sabt-dev/realtimeChat/database"
	"github/sabt-dev/realtimeChat/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserService handles user-related database operations
type UserService struct {
	db *gorm.DB
}

// NewUserService creates a new UserService
func NewUserService() *UserService {
	return &UserService{db: database.GetDB()}
}

// CreateOrGetUser creates a new user or returns existing one
func (s *UserService) CreateOrGetUser(name, email, avatar string) (*models.User, error) {
	var user models.User

	// Try to find existing user by email
	result := s.db.Where("email = ?", email).First(&user)
	if result.Error == nil {
		// User exists, update name and avatar if needed
		if user.Name != name || user.Avatar != avatar {
			user.Name = name
			user.Avatar = avatar
			s.db.Save(&user)
		}
		return &user, nil
	}

	// Create new user
	user = models.User{
		Name:   name,
		Email:  email,
		Avatar: avatar,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}

	return &user, nil
}

// GetUserByID gets a user by ID
func (s *UserService) GetUserByID(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// RoomService handles room-related database operations
type RoomService struct {
	db *gorm.DB
}

// NewRoomService creates a new RoomService
func NewRoomService() *RoomService {
	return &RoomService{db: database.GetDB()}
}

// CreateOrGetRoom creates a new room or returns existing one
func (s *RoomService) CreateOrGetRoom(name string) (*models.Room, error) {
	var room models.Room

	// Try to find existing room
	result := s.db.Where("name = ?", name).First(&room)
	if result.Error == nil {
		return &room, nil
	}

	// Create new room
	room = models.Room{
		Name: name,
	}

	if err := s.db.Create(&room).Error; err != nil {
		return nil, err
	}

	return &room, nil
}

// GetRoomByName gets a room by name
func (s *RoomService) GetRoomByName(name string) (*models.Room, error) {
	var room models.Room
	if err := s.db.Where("name = ?", name).First(&room).Error; err != nil {
		return nil, err
	}
	return &room, nil
}

// GetAllRooms returns all rooms with their member counts
func (s *RoomService) GetAllRooms() ([]map[string]interface{}, error) {
	var rooms []models.Room
	if err := s.db.Find(&rooms).Error; err != nil {
		return nil, err
	}

	var result []map[string]interface{}
	for _, room := range rooms {
		// Count active members
		var memberCount int64
		s.db.Model(&models.RoomMember{}).Where("room_id = ? AND is_active = ?", room.ID, true).Count(&memberCount)

		result = append(result, map[string]interface{}{
			"id":          room.ID,
			"name":        room.Name,
			"description": room.Description,
			"memberCount": memberCount,
		})
	}

	return result, nil
}

// JoinRoom adds a user to a room
func (s *RoomService) JoinRoom(userID, roomID uint) error {
	// Check if membership already exists
	var existing models.RoomMember
	result := s.db.Where("user_id = ? AND room_id = ?", userID, roomID).First(&existing)

	if result.Error == nil {
		// Membership exists, make sure it's active
		if !existing.IsActive {
			existing.IsActive = true
			return s.db.Save(&existing).Error
		}
		return nil
	}

	// Create new membership
	member := models.RoomMember{
		UserID:   userID,
		RoomID:   roomID,
		IsActive: true,
	}

	return s.db.Create(&member).Error
}

// LeaveRoom removes a user from a room (sets inactive)
func (s *RoomService) LeaveRoom(userID, roomID uint) error {
	return s.db.Model(&models.RoomMember{}).
		Where("user_id = ? AND room_id = ?", userID, roomID).
		Update("is_active", false).Error
}

// MessageService handles message-related database operations
type MessageService struct {
	db *gorm.DB
}

// NewMessageService creates a new MessageService
func NewMessageService() *MessageService {
	return &MessageService{db: database.GetDB()}
}

// CreateMessage creates a new message
func (s *MessageService) CreateMessage(senderID, roomID uint, text, msgType, mediaURL, mediaType, fileName string, replyToID *uint, replyToSender, replyToText string) (*models.Message, error) {
	message := models.Message{
		UUID:          uuid.New().String(),
		SenderID:      senderID,
		RoomID:        roomID,
		Text:          text,
		Type:          msgType,
		MediaURL:      mediaURL,
		MediaType:     mediaType,
		FileName:      fileName,
		ReplyToID:     replyToID,
		ReplyToSender: replyToSender,
		ReplyToText:   replyToText,
	}

	if err := s.db.Create(&message).Error; err != nil {
		return nil, err
	}

	// Load the message with associations
	return s.GetMessageByUUID(message.UUID)
}

// GetMessageByUUID gets a message by UUID with associations
func (s *MessageService) GetMessageByUUID(uuid string) (*models.Message, error) {
	var message models.Message
	if err := s.db.Preload("Sender").Preload("Room").Preload("ReplyTo").Where("uuid = ?", uuid).First(&message).Error; err != nil {
		return nil, err
	}
	return &message, nil
}

// GetRoomMessages gets all messages for a room
func (s *MessageService) GetRoomMessages(roomName string, limit, offset int) ([]models.Message, error) {
	var messages []models.Message

	if err := s.db.Preload("Sender").Preload("Room").Preload("ReplyTo").
		Joins("JOIN rooms ON messages.room_id = rooms.id").
		Where("rooms.name = ?", roomName).
		Order("messages.created_at ASC").
		Limit(limit).Offset(offset).
		Find(&messages).Error; err != nil {
		return nil, err
	}

	return messages, nil
}

// GetMessageIDByUUID gets a message ID by UUID
func (s *MessageService) GetMessageIDByUUID(uuid string) (uint, error) {
	var message models.Message
	if err := s.db.Select("id").Where("uuid = ?", uuid).First(&message).Error; err != nil {
		return 0, err
	}
	return message.ID, nil
}

// DeleteMessage soft deletes a message (only if user is the sender)
func (s *MessageService) DeleteMessage(uuid string, userID uint) error {
	var message models.Message

	// First check if message exists and user is the sender
	if err := s.db.Where("uuid = ? AND sender_id = ?", uuid, userID).First(&message).Error; err != nil {
		return fmt.Errorf("message not found or not authorized: %w", err)
	}

	// If this is a media message, delete the associated file
	if message.Type == "media" && message.MediaURL != "" {
		if err := s.deleteMediaFile(message.MediaURL); err != nil {
			// Log the error but don't fail the message deletion
			fmt.Printf("Warning: Failed to delete media file %s: %v\n", message.MediaURL, err)
		}
	}

	// Soft delete the message
	return s.db.Delete(&message).Error
}

// deleteMediaFile removes the physical file from the uploads directory
func (s *MessageService) deleteMediaFile(mediaURL string) error {
	// Extract filename from URL (e.g., "/uploads/filename.jpg" -> "filename.jpg")
	if !strings.HasPrefix(mediaURL, "/uploads/") {
		return fmt.Errorf("invalid media URL format: %s", mediaURL)
	}

	// Remove "/uploads/" prefix to get just the filename
	filename := strings.TrimPrefix(mediaURL, "/uploads/")
	if filename == "" {
		return fmt.Errorf("empty filename in media URL: %s", mediaURL)
	}

	// Construct full file path
	filePath := filepath.Join("uploads", filename)

	// Check if file exists before attempting to delete
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File doesn't exist, which is fine (maybe already deleted)
		return nil
	}

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("failed to delete file %s: %w", filePath, err)
	}

	fmt.Printf("Successfully deleted media file: %s\n", filePath)
	return nil
}

// GetMessageForDeletion gets a message for deletion verification
func (s *MessageService) GetMessageForDeletion(uuid string, userID uint) (*models.Message, error) {
	var message models.Message
	if err := s.db.Preload("Sender").Preload("Room").
		Where("uuid = ? AND sender_id = ?", uuid, userID).
		First(&message).Error; err != nil {
		return nil, err
	}
	return &message, nil
}
