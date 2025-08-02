package models

import (
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
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Relationships
	Messages []Message    `gorm:"foreignKey:RoomID" json:"-"`
	Members  []RoomMember `gorm:"foreignKey:RoomID" json:"-"`
}

// Message represents a chat message
type Message struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UUID      string         `gorm:"uniqueIndex;not null" json:"uuid"` // For client-side identification
	SenderID  uint           `gorm:"not null" json:"sender_id"`
	RoomID    uint           `gorm:"not null" json:"room_id"`
	Text      string         `json:"text"`
	Type      string         `gorm:"not null;default:message" json:"type"` // "join", "leave", "message", "media", "delete"
	MediaURL  string         `json:"media_url,omitempty"`
	MediaType string         `json:"media_type,omitempty"` // "image", "video"
	FileName  string         `json:"file_name,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Sender User `gorm:"foreignKey:SenderID" json:"sender"`
	Room   Room `gorm:"foreignKey:RoomID" json:"room"`
}

// RoomMember represents the many-to-many relationship between users and rooms
type RoomMember struct {
	ID       uint      `gorm:"primaryKey" json:"id"`
	UserID   uint      `gorm:"not null" json:"user_id"`
	RoomID   uint      `gorm:"not null" json:"room_id"`
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
}

// JoinRoomRequest represents a request to join a room
type JoinRoomRequest struct {
	UserName string `json:"username"`
	RoomName string `json:"room"`
}

// MessageResponse represents a message response for JSON serialization
type MessageResponse struct {
	ID        string    `json:"id"`     // UUID for client compatibility
	Sender    string    `json:"sender"` // Sender name
	Avatar    string    `json:"avatar,omitempty"`
	Receiver  string    `json:"receiver,omitempty"`
	Room      string    `json:"room"` // Room name
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
	Type      string    `json:"type"`
	MediaURL  string    `json:"mediaUrl,omitempty"`
	MediaType string    `json:"mediaType,omitempty"`
	FileName  string    `json:"fileName,omitempty"`
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
	}
}
