package models

import (
	"time"
)

// Message represents a chat message
type Message struct {
	ID        string    `json:"id"`
	Sender    string    `json:"sender"`
	Avatar    string    `json:"avatar,omitempty"` // User avatar URL
	Receiver  string    `json:"receiver,omitempty"`
	Room      string    `json:"room"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
	Type      string    `json:"type"` // "join", "leave", "message"
}

// Client represents a connected WebSocket client
type Client struct {
	ID     string      `json:"id"`
	Name   string      `json:"name"`
	Avatar string      `json:"avatar,omitempty"` // User avatar URL
	Room   string      `json:"room"`
	Conn   interface{} `json:"-"` // WebSocket connection (interface{} to avoid import cycle)
}

// Room represents a chat room
type Room struct {
	ID      string             `json:"id"`
	Name    string             `json:"name"`
	Clients map[string]*Client `json:"clients"`
}

// JoinRoomRequest represents a request to join a room
type JoinRoomRequest struct {
	UserName string `json:"username"`
	RoomName string `json:"room"`
}
