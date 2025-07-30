package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github/sabt-dev/realtimeChat/middleware"
	"github/sabt-dev/realtimeChat/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Hub maintains the set of active clients and broadcasts messages to the clients
type Hub struct {
	// Registered clients per room
	rooms map[string]*models.Room

	// Register requests from the clients
	register chan *models.Client

	// Unregister requests from clients
	unregister chan *models.Client

	// Inbound messages from the clients
	broadcast chan *models.Message

	// Mutex to protect concurrent access
	mutex sync.RWMutex
}

var chatHub = &Hub{
	rooms:      make(map[string]*models.Room),
	register:   make(chan *models.Client),
	unregister: make(chan *models.Client),
	broadcast:  make(chan *models.Message),
}

// StartHub runs the chat hub
func StartHub() {
	go chatHub.run()
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case message := <-h.broadcast:
			h.broadcastMessage(message)
		}
	}
}

func (h *Hub) registerClient(client *models.Client) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	// Create room if it doesn't exist
	if _, exists := h.rooms[client.Room]; !exists {
		h.rooms[client.Room] = &models.Room{
			ID:      client.Room,
			Name:    client.Room,
			Clients: make(map[string]*models.Client),
		}
	}

	// Add client to room
	h.rooms[client.Room].Clients[client.ID] = client

	log.Printf("Client %s (ID: %s) joined room %s", client.Name, client.ID, client.Room)
	log.Printf("Room %s now has %d clients", client.Room, len(h.rooms[client.Room].Clients))

	// Send join message
	joinMessage := &models.Message{
		ID:        generateMessageID(),
		Sender:    "System",
		Room:      client.Room,
		Text:      fmt.Sprintf("%s joined the room", client.Name),
		Timestamp: time.Now(),
		Type:      "join",
	}

	log.Printf("Created join message: %+v", joinMessage)

	// Persist join message and broadcast via channel to avoid deadlock
	go PersistMessage(joinMessage)
	log.Printf("About to broadcast join message to room %s via channel", client.Room)

	// Use channel broadcast to avoid deadlock
	go func() {
		chatHub.broadcast <- joinMessage
	}()
}

func (h *Hub) unregisterClient(client *models.Client) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.rooms[client.Room]; exists {
		if _, exists := room.Clients[client.ID]; exists {
			delete(room.Clients, client.ID)

			// Close connection
			if conn, ok := client.Conn.(*websocket.Conn); ok {
				conn.Close()
			}

			log.Printf("Client %s left room %s", client.Name, client.Room)

			// Send leave message
			leaveMessage := &models.Message{
				ID:        generateMessageID(),
				Sender:    "System",
				Room:      client.Room,
				Text:      fmt.Sprintf("%s left the room", client.Name),
				Timestamp: time.Now(),
				Type:      "leave",
			}

			// Persist and broadcast leave message via channel to avoid deadlock
			go PersistMessage(leaveMessage)
			go func() {
				chatHub.broadcast <- leaveMessage
			}()

			// Remove room if empty
			if len(room.Clients) == 0 {
				delete(h.rooms, client.Room)
			}
		}
	}
}

func (h *Hub) broadcastMessage(message *models.Message) {
	// Persist message
	go PersistMessage(message)

	// Broadcast to room
	h.broadcastToRoom(message.Room, message)
}

func (h *Hub) broadcastToRoom(roomID string, message *models.Message) {
	log.Printf("ENTER broadcastToRoom: roomID=%s", roomID)

	h.mutex.RLock()
	log.Printf("ACQUIRED RLock for room %s", roomID)
	defer func() {
		h.mutex.RUnlock()
		log.Printf("RELEASED RLock for room %s", roomID)
	}()

	log.Printf("Broadcasting message to room %s: %+v", roomID, message)

	if room, exists := h.rooms[roomID]; exists {
		log.Printf("Room %s exists, proceeding with broadcast", roomID)
		messageBytes, err := json.Marshal(message)
		if err != nil {
			log.Printf("Error marshaling message: %v", err)
			return
		}

		log.Printf("Room %s has %d clients", roomID, len(room.Clients))
		for clientID, client := range room.Clients {
			log.Printf("Processing client %s (%s) in room %s", clientID, client.Name, roomID)
			if conn, ok := client.Conn.(*websocket.Conn); ok {
				log.Printf("Sending message to client %s (%s)", clientID, client.Name)
				if err := conn.WriteMessage(websocket.TextMessage, messageBytes); err != nil {
					log.Printf("Error sending message to client %s: %v", client.Name, err)
					// Remove client on error
					go func(c *models.Client) {
						h.unregister <- c
					}(client)
				} else {
					log.Printf("Message sent successfully to client %s", client.Name)
				}
			} else {
				log.Printf("Invalid connection type for client %s", client.Name)
			}
		}
	} else {
		log.Printf("Room %s not found in rooms map", roomID)
		log.Printf("Available rooms: %v", func() []string {
			rooms := make([]string, 0, len(h.rooms))
			for k := range h.rooms {
				rooms = append(rooms, k)
			}
			return rooms
		}())
	}
}

// HandleWSConnection handles WebSocket connections
func HandleWSConnection(c *gin.Context) {
	// Get user from auth middleware
	userInterface, exists := c.Get("user")
	if !exists {
		log.Printf("No user found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	// Convert user to SessionUser
	user, ok := userInterface.(*middleware.SessionUser)
	if !ok {
		log.Printf("Invalid user type in context")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user data"})
		return
	}

	userName := user.Name
	if userName == "" {
		// Use email as fallback if name is empty
		userName = user.Email
		// Extract username from email if possible
		if atIndex := strings.Index(userName, "@"); atIndex > 0 {
			userName = userName[:atIndex]
		}
	}
	if userName == "" {
		log.Printf("No name found in user data")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user name"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	// Read initial join message
	var joinReq models.JoinRoomRequest
	if err := conn.ReadJSON(&joinReq); err != nil {
		log.Printf("Error reading join request: %v", err)
		conn.Close()
		return
	}

	// Use authenticated user's name instead of the one from the request
	client := &models.Client{
		ID:   generateClientID(),
		Name: userName,
		Room: joinReq.RoomName,
		Conn: conn,
	}

	// Register client
	chatHub.register <- client

	// Handle messages from this client
	go handleClientMessages(client, conn)
}

func handleClientMessages(client *models.Client, conn *websocket.Conn) {
	defer func() {
		log.Printf("Client %s (%s) disconnecting from room %s", client.ID, client.Name, client.Room)
		chatHub.unregister <- client
	}()

	for {
		var message models.Message
		if err := conn.ReadJSON(&message); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received message from client %s: %+v", client.Name, message)

		// Set message metadata
		message.ID = generateMessageID()
		message.Sender = client.Name
		message.Room = client.Room
		message.Timestamp = time.Now()
		message.Type = "message"

		log.Printf("Processed message: %+v", message)

		// Broadcast message
		chatHub.broadcast <- &message
	}
}

func generateClientID() string {
	return fmt.Sprintf("client_%d", time.Now().UnixNano())
}

func generateMessageID() string {
	return fmt.Sprintf("msg_%d", time.Now().UnixNano())
}
