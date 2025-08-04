package models

import (
	"sync"
	"time"

	"gorm.io/gorm"
)

// User represents a user in the system
type User struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Email     string    `gorm:"uniqueIndex;not null" json:"email"`
	Avatar    string    `json:"avatar,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relationships
	Messages    []Message    `gorm:"foreignKey:SenderID" json:"-"`
	RoomMembers []RoomMember `gorm:"foreignKey:UserID" json:"-"`
}

// Room represents a chat room
type Room struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"uniqueIndex;not null" json:"name"`
	Description string    `json:"description,omitempty"`
	IsPrivate   bool      `gorm:"default:false" json:"is_private"`
	CreatorID   *uint     `json:"creator_id,omitempty"` // Moderator/creator of the room
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Relationships
	Messages []Message    `gorm:"foreignKey:RoomID" json:"-"`
	Members  []RoomMember `gorm:"foreignKey:RoomID" json:"-"`
	Creator  *User        `gorm:"foreignKey:CreatorID" json:"creator,omitempty"`
}

// Message represents a chat message
type Message struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	UUID      string `gorm:"uniqueIndex;not null" json:"uuid"` // For client-side identification
	SenderID  uint   `gorm:"not null" json:"sender_id"`
	RoomID    uint   `gorm:"not null" json:"room_id"`
	Text      string `json:"text"`
	Type      string `gorm:"not null;default:message" json:"type"` // "join", "leave", "message", "media", "delete"
	MediaURL  string `json:"media_url,omitempty"`
	MediaType string `json:"media_type,omitempty"` // "image", "video"
	FileName  string `json:"file_name,omitempty"`

	// Reply functionality
	ReplyToID     *uint  `json:"reply_to_id,omitempty"`     // ID of the message being replied to
	ReplyToSender string `json:"reply_to_sender,omitempty"` // Sender name of the original message
	ReplyToText   string `json:"reply_to_text,omitempty"`   // Text of the original message

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Sender    User              `gorm:"foreignKey:SenderID" json:"sender"`
	Room      Room              `gorm:"foreignKey:RoomID" json:"room"`
	ReplyTo   *Message          `gorm:"foreignKey:ReplyToID" json:"reply_to,omitempty"`
	Reactions []MessageReaction `gorm:"foreignKey:MessageID" json:"reactions"`
}

// MessageReaction represents a reaction to a message
type MessageReaction struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	MessageID uint      `gorm:"not null" json:"message_id"`
	UserID    uint      `gorm:"not null" json:"user_id"`
	Emoji     string    `gorm:"not null" json:"emoji"` // The emoji used for reaction
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relationships
	Message Message `gorm:"foreignKey:MessageID" json:"message"`
	User    User    `gorm:"foreignKey:UserID" json:"user"`
}

// Ensure unique constraint for user-message-emoji combination
func (MessageReaction) TableName() string {
	return "message_reactions"
}

// RoomMember represents the many-to-many relationship between users and rooms
type RoomMember struct {
	ID       uint      `gorm:"primaryKey" json:"id"`
	UserID   uint      `gorm:"not null" json:"user_id"`
	RoomID   uint      `gorm:"not null" json:"room_id"`
	Role     string    `gorm:"default:member" json:"role"` // "creator", "moderator", "member"
	JoinedAt time.Time `gorm:"autoCreateTime" json:"joined_at"`
	IsActive bool      `gorm:"default:true" json:"is_active"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"user"`
	Room Room `gorm:"foreignKey:RoomID" json:"room"`
}

// Client represents a connected WebSocket client (not stored in DB)
type Client struct {
	ID     string      `json:"id"`
	UserID uint        `json:"user_id"`
	Name   string      `json:"name"`
	Avatar string      `json:"avatar,omitempty"`
	Room   string      `json:"room"`
	Conn   interface{} `json:"-"` // WebSocket connection
	Mutex  sync.Mutex  `json:"-"` // Mutex for safe concurrent WebSocket writes
}

// JoinRoomRequest represents a request to join a room
type JoinRoomRequest struct {
	UserName string `json:"username"`
	RoomName string `json:"room"`
}

// CreatePrivateRoomRequest represents a request to create a private room
type CreatePrivateRoomRequest struct {
	RoomName    string   `json:"room_name" binding:"required"`
	Description string   `json:"description"`
	UserEmails  []string `json:"user_emails" binding:"required"`
}

// SearchUsersRequest represents a request to search for users
type SearchUsersRequest struct {
	Query string `json:"query" binding:"required"`
	Limit int    `json:"limit"`
}

// UserSearchResult represents a user in search results
type UserSearchResult struct {
	ID     uint   `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Avatar string `json:"avatar,omitempty"`
}

// ReplyInfo represents reply information for a message
type ReplyInfo struct {
	ID     string `json:"id"`
	Sender string `json:"sender"`
	Text   string `json:"text"`
}

// ReactionSummary represents aggregated reaction data for a message
type ReactionSummary struct {
	Emoji  string   `json:"emoji"`
	Count  int      `json:"count"`
	Users  []string `json:"users"`   // User names who reacted
	UserID []uint   `json:"userIds"` // User IDs for backend logic
}

// MessageResponse represents a message response for JSON serialization
type MessageResponse struct {
	ID        string            `json:"id"`     // UUID for client compatibility
	Sender    string            `json:"sender"` // Sender name
	Avatar    string            `json:"avatar,omitempty"`
	Receiver  string            `json:"receiver,omitempty"`
	Room      string            `json:"room"` // Room name
	Text      string            `json:"text"`
	Timestamp time.Time         `json:"timestamp"`
	Type      string            `json:"type"`
	MediaURL  string            `json:"mediaUrl,omitempty"`
	MediaType string            `json:"mediaType,omitempty"`
	FileName  string            `json:"fileName,omitempty"`
	ReplyTo   *ReplyInfo        `json:"replyTo,omitempty"`
	Reactions []ReactionSummary `json:"reactions,omitempty"`
}

// ToResponse converts a Message to MessageResponse for JSON output
func (m *Message) ToResponse() MessageResponse {
	// Handle cases where sender might not be loaded
	senderName := ""
	senderAvatar := ""
	if m.Sender.Name != "" {
		senderName = m.Sender.Name
		senderAvatar = m.Sender.Avatar
	}

	// Handle cases where room might not be loaded
	roomName := ""
	if m.Room.Name != "" {
		roomName = m.Room.Name
	}

	// Handle reply information
	var replyInfo *ReplyInfo
	if m.ReplyToSender != "" {
		replyInfo = &ReplyInfo{
			ID:     "", // We'll need the original message UUID, for now use empty
			Sender: m.ReplyToSender,
			Text:   m.ReplyToText,
		}

		// If we have the reply relationship loaded, get the UUID
		if m.ReplyTo != nil {
			replyInfo.ID = m.ReplyTo.UUID
		}
	}

	// Process reactions into summary format
	reactionMap := make(map[string]*ReactionSummary)
	for _, reaction := range m.Reactions {
		if summary, exists := reactionMap[reaction.Emoji]; exists {
			summary.Count++
			summary.Users = append(summary.Users, reaction.User.Name)
			summary.UserID = append(summary.UserID, reaction.UserID)
		} else {
			reactionMap[reaction.Emoji] = &ReactionSummary{
				Emoji:  reaction.Emoji,
				Count:  1,
				Users:  []string{reaction.User.Name},
				UserID: []uint{reaction.UserID},
			}
		}
	}

	// Convert map to slice
	var reactions []ReactionSummary
	for _, summary := range reactionMap {
		reactions = append(reactions, *summary)
	}

	return MessageResponse{
		ID:        m.UUID,
		Sender:    senderName,
		Avatar:    senderAvatar,
		Room:      roomName,
		Text:      m.Text,
		Timestamp: m.CreatedAt,
		Type:      m.Type,
		MediaURL:  m.MediaURL,
		MediaType: m.MediaType,
		FileName:  m.FileName,
		ReplyTo:   replyInfo,
		Reactions: reactions,
	}
}
