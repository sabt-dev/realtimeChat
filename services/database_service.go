package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github/sabt-dev/realtimeChat/database"
	"github/sabt-dev/realtimeChat/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// retryOnDatabaseLock retries a database operation if it encounters SQLITE_BUSY error
func retryOnDatabaseLock(operation func() error, maxRetries int) error {
	var err error
	for i := 0; i < maxRetries; i++ {
		err = operation()
		if err == nil {
			return nil
		}

		// Check if it's a database lock error
		if strings.Contains(err.Error(), "database is locked") || strings.Contains(err.Error(), "SQLITE_BUSY") {
			if i < maxRetries-1 { // Don't sleep on the last attempt
				time.Sleep(time.Duration(i+1) * 50 * time.Millisecond) // Exponential backoff
				continue
			}
		}

		// If it's not a lock error or we've exhausted retries, return the error
		return err
	}
	return err
}

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

	// Try to find existing user by email with retry
	err := retryOnDatabaseLock(func() error {
		return s.db.Where("email = ?", email).First(&user).Error
	}, 3)

	if err == nil {
		// User exists, update name and avatar if needed
		if user.Name != name || user.Avatar != avatar {
			user.Name = name
			user.Avatar = avatar
			// Use retry for update operation
			return &user, retryOnDatabaseLock(func() error {
				return s.db.Save(&user).Error
			}, 3)
		}
		return &user, nil
	}

	// If user doesn't exist (not found), create new user
	if errors.Is(err, gorm.ErrRecordNotFound) {
		user = models.User{
			Name:   name,
			Email:  email,
			Avatar: avatar,
		}

		// Use retry for create operation
		createErr := retryOnDatabaseLock(func() error {
			return s.db.Create(&user).Error
		}, 3)

		if createErr != nil {
			return nil, createErr
		}

		return &user, nil
	}

	// Return other errors as-is
	return nil, err
}

// GetUserByID gets a user by ID
func (s *UserService) GetUserByID(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// SearchUsers searches for users by name or email
func (s *UserService) SearchUsers(query string, limit int) ([]models.UserSearchResult, error) {
	if limit <= 0 {
		limit = 10
	}

	var users []models.User
	err := s.db.Where("name LIKE ? OR email LIKE ?", "%"+query+"%", "%"+query+"%").
		Limit(limit).
		Find(&users).Error

	if err != nil {
		return nil, err
	}

	results := make([]models.UserSearchResult, len(users))
	for i, user := range users {
		results[i] = models.UserSearchResult{
			ID:     user.ID,
			Name:   user.Name,
			Email:  user.Email,
			Avatar: user.Avatar,
		}
	}

	return results, nil
}

// GetUsersByEmails gets users by their email addresses
func (s *UserService) GetUsersByEmails(emails []string) ([]models.User, error) {
	var users []models.User
	err := s.db.Where("email IN ?", emails).Find(&users).Error
	return users, err
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

// CreatePublicRoom creates a new public room and assigns the creator
func (s *RoomService) CreatePublicRoom(name, description string, creatorID uint) (*models.Room, error) {
	tx := s.db.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Ensure unique name
	var existing models.Room
	if err := tx.Where("name = ?", name).First(&existing).Error; err == nil {
		tx.Rollback()
		return nil, fmt.Errorf("room already exists")
	}

	room := models.Room{
		Name:        name,
		Description: description,
		IsPrivate:   false,
		CreatorID:   &creatorID,
	}
	if err := tx.Create(&room).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Add creator as member with creator role
	creatorMember := models.RoomMember{
		UserID:   creatorID,
		RoomID:   room.ID,
		Role:     "creator",
		IsActive: true,
	}
	if err := tx.Create(&creatorMember).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	return &room, nil
}

// CreatePrivateRoom creates a new private room with specified members
func (s *RoomService) CreatePrivateRoom(name, description string, creatorID uint, memberUserIDs []uint) (*models.Room, error) {
	// Start transaction
	tx := s.db.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Create the room
	room := models.Room{
		Name:        name,
		Description: description,
		IsPrivate:   true,
		CreatorID:   &creatorID,
	}

	if err := tx.Create(&room).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Add creator as first member with creator role
	creatorMember := models.RoomMember{
		UserID:   creatorID,
		RoomID:   room.ID,
		Role:     "creator",
		IsActive: true,
	}

	if err := tx.Create(&creatorMember).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Add other members
	for _, userID := range memberUserIDs {
		if userID != creatorID { // Don't add creator twice
			member := models.RoomMember{
				UserID:   userID,
				RoomID:   room.ID,
				Role:     "member",
				IsActive: true,
			}

			if err := tx.Create(&member).Error; err != nil {
				tx.Rollback()
				return nil, err
			}
		}
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
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

// GetRoomByID gets a room by ID
func (s *RoomService) GetRoomByID(roomID uint) (*models.Room, error) {
	var room models.Room
	if err := s.db.First(&room, roomID).Error; err != nil {
		return nil, err
	}
	return &room, nil
}

// GetAllRooms returns all rooms with their member counts
func (s *RoomService) GetAllRooms() ([]map[string]interface{}, error) {
	var rooms []models.Room
	if err := s.db.Where("is_private = ?", false).Find(&rooms).Error; err != nil {
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
			"is_private":  room.IsPrivate,
			"creator_id":  room.CreatorID,
		})
	}

	return result, nil
}

// GetUserRooms returns all rooms a user has access to (public + their private rooms)
func (s *RoomService) GetUserRooms(userID uint) ([]map[string]interface{}, error) {
	var result []map[string]interface{}

	// Get public rooms
	publicRooms, err := s.GetAllRooms()
	if err != nil {
		return nil, err
	}
	result = append(result, publicRooms...)

	// Get user's private rooms with membership status
	var privateRoomsWithStatus []struct {
		models.Room
		IsActive bool `gorm:"column:is_active"`
	}
	err = s.db.Table("rooms").
		Select("rooms.*, room_members.is_active").
		Joins("JOIN room_members ON rooms.id = room_members.room_id").
		Where("room_members.user_id = ? AND rooms.is_private = ?", userID, true).
		Find(&privateRoomsWithStatus).Error

	if err != nil {
		return nil, err
	}

	for _, roomWithStatus := range privateRoomsWithStatus {
		// Count active members
		var memberCount int64
		s.db.Model(&models.RoomMember{}).Where("room_id = ? AND is_active = ?", roomWithStatus.ID, true).Count(&memberCount)

		// Always show private rooms that the user has been a member of
		// This allows users to see and rejoin rooms they've left
		result = append(result, map[string]interface{}{
			"id":          roomWithStatus.ID,
			"name":        roomWithStatus.Name,
			"description": roomWithStatus.Description,
			"memberCount": memberCount,
			"is_private":  roomWithStatus.IsPrivate,
			"user_active": roomWithStatus.IsActive, // Add user's membership status
			"creator_id":  roomWithStatus.CreatorID,
		})
	}

	return result, nil
}

// IsUserMemberOfRoom checks if a user is a member of a room
func (s *RoomService) IsUserMemberOfRoom(userID, roomID uint) (bool, error) {
	var count int64
	err := s.db.Model(&models.RoomMember{}).
		Where("user_id = ? AND room_id = ? AND is_active = ?", userID, roomID, true).
		Count(&count).Error
	return count > 0, err
}

// CanUserAccessRoom checks if a user can access a room (public rooms or member of private room)
func (s *RoomService) CanUserAccessRoom(userID uint, roomName string) (bool, error) {
	var room models.Room
	if err := s.db.Where("name = ?", roomName).First(&room).Error; err != nil {
		return false, err
	}

	// If it's a public room, anyone can access
	if !room.IsPrivate {
		return true, nil
	}

	// For private rooms, check if user was ever a member (including inactive)
	// This allows users to rejoin private rooms they were previously in
	var count int64
	err := s.db.Model(&models.RoomMember{}).
		Where("user_id = ? AND room_id = ?", userID, room.ID).
		Count(&count).Error
	return count > 0, err
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

	// Create new membership with default role
	member := models.RoomMember{
		UserID:   userID,
		RoomID:   roomID,
		Role:     "member",
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
	if err := s.db.Preload("Sender").Preload("Room").Preload("ReplyTo").
		Preload("Reactions").Preload("Reactions.User").
		Where("uuid = ?", uuid).First(&message).Error; err != nil {
		return nil, err
	}
	return &message, nil
}

// GetRoomMessages gets all messages for a room
func (s *MessageService) GetRoomMessages(roomName string, limit, offset int) ([]models.Message, error) {
	var messages []models.Message

	if err := s.db.Preload("Sender").Preload("Room").Preload("ReplyTo").
		Preload("Reactions").Preload("Reactions.User").
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

// DeleteMessage permanently deletes a message from the database (only if user is the sender)
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

	// Handle messages that reply to this message - set their reply_to_id to NULL
	if err := s.db.Model(&models.Message{}).Where("reply_to_id = ?", message.ID).Update("reply_to_id", nil).Error; err != nil {
		return fmt.Errorf("failed to update reply references: %w", err)
	}

	// Delete all reactions associated with this message
	if err := s.db.Where("message_id = ?", message.ID).Delete(&models.MessageReaction{}).Error; err != nil {
		return fmt.Errorf("failed to delete message reactions: %w", err)
	}

	// Hard delete the message from the database (permanently remove)
	if err := s.db.Unscoped().Delete(&message).Error; err != nil {
		return fmt.Errorf("failed to delete message: %w", err)
	}

	fmt.Printf("Successfully deleted message %s and its associated data\n", uuid)
	return nil
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

// IsRoomCreator checks if the given user is the creator of the room (by Room.CreatorID or creator role membership)
func (s *RoomService) IsRoomCreator(userID, roomID uint) (bool, error) {
	var room models.Room
	if err := s.db.First(&room, roomID).Error; err != nil {
		return false, err
	}
	if room.CreatorID != nil && *room.CreatorID == userID {
		return true, nil
	}
	// Fallback: check membership with creator role
	var count int64
	if err := s.db.Model(&models.RoomMember{}).
		Where("room_id = ? AND user_id = ? AND role = ?", roomID, userID, "creator").
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// DeleteRoom deletes a room and cascades deletion to messages, reactions, media files and memberships
func (s *RoomService) DeleteRoom(roomID, userID uint) error {
	// Authorization: only creator can delete
	isCreator, err := s.IsRoomCreator(userID, roomID)
	if err != nil {
		return err
	}
	if !isCreator {
		return fmt.Errorf("not authorized to delete this room")
	}

	tx := s.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Load room
	var room models.Room
	if err := tx.First(&room, roomID).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Collect message IDs for this room
	var messages []models.Message
	if err := tx.Where("room_id = ?", roomID).Find(&messages).Error; err != nil {
		tx.Rollback()
		return err
	}
	messageIDs := make([]uint, 0, len(messages))
	for _, m := range messages {
		messageIDs = append(messageIDs, m.ID)
	}

	// Delete reactions for these messages
	if len(messageIDs) > 0 {
		if err := tx.Where("message_id IN ?", messageIDs).Delete(&models.MessageReaction{}).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to delete message reactions: %w", err)
		}
		// Clear reply references to these messages
		if err := tx.Model(&models.Message{}).Where("reply_to_id IN ?", messageIDs).Update("reply_to_id", nil).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to clear reply references: %w", err)
		}
	}

	// Delete media files for media messages
	if len(messages) > 0 {
		ms := NewMessageService()
		for _, m := range messages {
			if m.Type == "media" && m.MediaURL != "" {
				if err := ms.deleteMediaFile(m.MediaURL); err != nil {
					fmt.Printf("Warning: failed to delete media file %s: %v\n", m.MediaURL, err)
				}
			}
		}
	}

	// Hard delete messages
	if err := tx.Unscoped().Where("room_id = ?", roomID).Delete(&models.Message{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete messages: %w", err)
	}

	// Delete room memberships
	if err := tx.Where("room_id = ?", roomID).Delete(&models.RoomMember{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete room members: %w", err)
	}

	// Finally hard delete the room
	if err := tx.Unscoped().Delete(&room).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete room: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}
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

// AddReaction adds or updates a reaction to a message
func (s *MessageService) AddReaction(messageUUID string, userID uint, emoji string) (*models.Message, error) {
	// First get the message ID
	messageID, err := s.GetMessageIDByUUID(messageUUID)
	if err != nil {
		return nil, fmt.Errorf("message not found: %w", err)
	}

	// Check if user already reacted to this message with this emoji
	var existingReaction models.MessageReaction
	result := s.db.Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).First(&existingReaction)

	if result.Error == nil {
		// Reaction already exists, do nothing (or could update timestamp)
		return s.GetMessageByUUID(messageUUID)
	}

	// Create new reaction
	reaction := models.MessageReaction{
		MessageID: messageID,
		UserID:    userID,
		Emoji:     emoji,
	}

	if err := s.db.Create(&reaction).Error; err != nil {
		return nil, fmt.Errorf("failed to create reaction: %w", err)
	}

	// Return updated message with reactions
	return s.GetMessageByUUID(messageUUID)
}

// RemoveReaction removes a reaction from a message
func (s *MessageService) RemoveReaction(messageUUID string, userID uint, emoji string) (*models.Message, error) {
	// First get the message ID
	messageID, err := s.GetMessageIDByUUID(messageUUID)
	if err != nil {
		return nil, fmt.Errorf("message not found: %w", err)
	}

	// Delete the reaction
	if err := s.db.Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).Delete(&models.MessageReaction{}).Error; err != nil {
		return nil, fmt.Errorf("failed to remove reaction: %w", err)
	}

	// Return updated message with reactions
	return s.GetMessageByUUID(messageUUID)
}

// ToggleReaction toggles a reaction (add if not exists, remove if exists)
func (s *MessageService) ToggleReaction(messageUUID string, userID uint, emoji string) (*models.Message, error) {
	// First get the message ID
	messageID, err := s.GetMessageIDByUUID(messageUUID)
	if err != nil {
		return nil, fmt.Errorf("message not found: %w", err)
	}

	// Check if reaction exists
	var existingReaction models.MessageReaction
	result := s.db.Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).First(&existingReaction)

	if result.Error == nil {
		// Reaction exists, remove it
		return s.RemoveReaction(messageUUID, userID, emoji)
	} else {
		// Reaction doesn't exist, add it
		return s.AddReaction(messageUUID, userID, emoji)
	}
}
