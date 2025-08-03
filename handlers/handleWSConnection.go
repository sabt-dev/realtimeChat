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
	"github/sabt-dev/realtimeChat/services"

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
	rooms map[string]map[string]*models.Client

	// Register requests from the clients
	register chan *models.Client

	// Unregister requests from clients
	unregister chan *models.Client

	// Inbound messages from the clients
	broadcast chan *models.MessageResponse

	// Mutex to protect concurrent access
	mutex sync.RWMutex
}

var chatHub = &Hub{
	rooms:      make(map[string]map[string]*models.Client),
	register:   make(chan *models.Client),
	unregister: make(chan *models.Client),
	broadcast:  make(chan *models.MessageResponse),
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
		h.rooms[client.Room] = make(map[string]*models.Client)
	}

	// Add client to room
	h.rooms[client.Room][client.ID] = client

	log.Printf("Client %s (ID: %s, UserID: %d) joined room %s", client.Name, client.ID, client.UserID, client.Room)
	log.Printf("Room %s now has %d clients", client.Room, len(h.rooms[client.Room]))

	// Create/get room and user in database
	userService := services.NewUserService()
	roomService := services.NewRoomService()
	messageService := services.NewMessageService()

	user, err := userService.GetUserByID(client.UserID)
	if err != nil {
		log.Printf("Error getting user %d: %v", client.UserID, err)
		return
	}

	room, err := roomService.CreateOrGetRoom(client.Room)
	if err != nil {
		log.Printf("Error creating/getting room %s: %v", client.Room, err)
		return
	}

	// Join room
	if err := roomService.JoinRoom(user.ID, room.ID); err != nil {
		log.Printf("Error joining room: %v", err)
	}

	// Create join message
	joinMessage, err := messageService.CreateMessage(
		user.ID,
		room.ID,
		fmt.Sprintf("%s joined the room", user.Name),
		"join",
		"", "", "",
		nil, "", "", // No reply for join messages
	)
	if err != nil {
		log.Printf("Error creating join message: %v", err)
		return
	}

	log.Printf("Created join message: %+v", joinMessage)

	// Broadcast join message
	go func() {
		response := joinMessage.ToResponse()
		chatHub.broadcast <- &response
	}()
}

func (h *Hub) unregisterClient(client *models.Client) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.rooms[client.Room]; exists {
		if _, exists := room[client.ID]; exists {
			delete(room, client.ID)

			// Close connection
			if conn, ok := client.Conn.(*websocket.Conn); ok {
				conn.Close()
			}

			log.Printf("Client %s left room %s", client.Name, client.Room)

			// Create leave message in database
			userService := services.NewUserService()
			roomService := services.NewRoomService()
			messageService := services.NewMessageService()

			user, err := userService.GetUserByID(client.UserID)
			if err != nil {
				log.Printf("Error getting user %d: %v", client.UserID, err)
			} else {
				dbRoom, err := roomService.GetRoomByName(client.Room)
				if err != nil {
					log.Printf("Error getting room %s: %v", client.Room, err)
				} else {
					// Leave room
					if err := roomService.LeaveRoom(user.ID, dbRoom.ID); err != nil {
						log.Printf("Error leaving room: %v", err)
					}

					// Create leave message
					leaveMessage, err := messageService.CreateMessage(
						user.ID,
						dbRoom.ID,
						fmt.Sprintf("%s left the room", user.Name),
						"leave",
						"", "", "",
						nil, "", "", // No reply for leave messages
					)
					if err != nil {
						log.Printf("Error creating leave message: %v", err)
					} else {
						// Broadcast leave message
						go func() {
							response := leaveMessage.ToResponse()
							chatHub.broadcast <- &response
						}()
					}
				}
			}

			// Remove room if empty
			if len(room) == 0 {
				delete(h.rooms, client.Room)
			}
		}
	}
}

func (h *Hub) broadcastMessage(message *models.MessageResponse) {
	// Broadcast to room
	h.broadcastToRoom(message.Room, message)
}

func (h *Hub) broadcastToRoom(roomID string, message *models.MessageResponse) {
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

		log.Printf("Room %s has %d clients", roomID, len(room))
		for clientID, client := range room {
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

	// Create or get user in database
	userService := services.NewUserService()
	dbUser, err := userService.CreateOrGetUser(userName, user.Email, user.Avatar)
	if err != nil {
		log.Printf("Error creating/getting user: %v", err)
		conn.Close()
		return
	}

	// Use authenticated user's name instead of the one from the request
	client := &models.Client{
		ID:     generateClientID(),
		UserID: dbUser.ID,
		Name:   userName,
		Avatar: user.Avatar,
		Room:   joinReq.RoomName,
		Conn:   conn,
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
		var messageData map[string]interface{}
		if err := conn.ReadJSON(&messageData); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received message from client %s: %+v", client.Name, messageData)

		// Check message type
		msgType, ok := messageData["type"].(string)
		if !ok {
			msgType = "message"
		}

		messageService := services.NewMessageService()
		roomService := services.NewRoomService()

		switch msgType {
		case "ping":
			// Handle heartbeat ping - no need to broadcast
			log.Printf("Received ping from client %s", client.Name)
			continue

		case "delete":
			// Handle message deletion
			messageID, ok := messageData["messageId"].(string)
			if !ok || messageID == "" {
				log.Printf("Invalid delete request from %s: missing messageId", client.Name)
				continue
			}

			// Try to delete the message (this checks ownership too)
			if err := messageService.DeleteMessage(messageID, client.UserID); err != nil {
				log.Printf("Failed to delete message %s: %v", messageID, err)
				continue
			}

			// Create delete notification message response
			response := &models.MessageResponse{
				ID:        messageID,
				Sender:    client.Name,
				Avatar:    client.Avatar,
				Room:      client.Room,
				Text:      "",
				Timestamp: time.Now(),
				Type:      "delete",
			}

			log.Printf("Message %s deleted by %s", messageID, client.Name)

			// Broadcast delete notification
			go func() {
				chatHub.broadcast <- response
			}()

		case "media":
			// Handle media message
			mediaURL, _ := messageData["mediaUrl"].(string)
			mediaType, _ := messageData["mediaType"].(string)
			fileName, _ := messageData["fileName"].(string)
			text, _ := messageData["text"].(string) // Get optional text with media

			if mediaURL == "" {
				log.Printf("Invalid media message from %s: missing mediaUrl", client.Name)
				continue
			}

			// Get room
			room, err := roomService.GetRoomByName(client.Room)
			if err != nil {
				log.Printf("Error getting room %s: %v", client.Room, err)
				continue
			}

			// Handle reply information for media messages
			var replyToID *uint
			var replyToSender, replyToText string

			if replyData, hasReply := messageData["replyTo"].(map[string]interface{}); hasReply {
				if replyUUID, ok := replyData["id"].(string); ok && replyUUID != "" {
					if id, err := messageService.GetMessageIDByUUID(replyUUID); err == nil {
						replyToID = &id
					}
				}
				if sender, ok := replyData["sender"].(string); ok {
					replyToSender = sender
				}
				if text, ok := replyData["text"].(string); ok {
					replyToText = text
				}
			}

			// Create media message
			message, err := messageService.CreateMessage(
				client.UserID,
				room.ID,
				text, // Allow text with media messages
				"media",
				mediaURL,
				mediaType,
				fileName,
				replyToID, replyToSender, replyToText,
			)
			if err != nil {
				log.Printf("Error creating media message: %v", err)
				continue
			}

			// Broadcast message
			go func() {
				response := message.ToResponse()
				chatHub.broadcast <- &response
			}()

		default:
			// Handle regular text message
			text, ok := messageData["text"].(string)
			if !ok || strings.TrimSpace(text) == "" {
				log.Printf("Empty message from %s, skipping", client.Name)
				continue
			}

			// Get room
			room, err := roomService.GetRoomByName(client.Room)
			if err != nil {
				log.Printf("Error getting room %s: %v", client.Room, err)
				continue
			}

			// Handle reply information
			var replyToID *uint
			var replyToSender, replyToText string

			if replyData, hasReply := messageData["replyTo"].(map[string]interface{}); hasReply {
				if replyUUID, ok := replyData["id"].(string); ok && replyUUID != "" {
					if id, err := messageService.GetMessageIDByUUID(replyUUID); err == nil {
						replyToID = &id
					}
				}
				if sender, ok := replyData["sender"].(string); ok {
					replyToSender = sender
				}
				if text, ok := replyData["text"].(string); ok {
					replyToText = text
				}
			}

			// Create regular message
			message, err := messageService.CreateMessage(
				client.UserID,
				room.ID,
				text,
				"message",
				"", "", "",
				replyToID, replyToSender, replyToText,
			)
			if err != nil {
				log.Printf("Error creating message: %v", err)
				continue
			}

			log.Printf("Processed message: %+v", message)

			// Broadcast message
			go func() {
				response := message.ToResponse()
				chatHub.broadcast <- &response
			}()
		}
	}
}

func generateClientID() string {
	return fmt.Sprintf("client_%d", time.Now().UnixNano())
}
