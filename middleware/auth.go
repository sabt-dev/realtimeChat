package middleware

import (
	"encoding/gob"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/github"
	"github.com/markbates/goth/providers/google"
)

// SessionUser represents user data stored in session
type SessionUser struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Avatar   string `json:"avatar"`
	Provider string `json:"provider"`
}

func init() {
	// Register types for gob encoding
	gob.Register(&SessionUser{})
	gob.Register(map[string]interface{}{})
}

var store *sessions.CookieStore

// InitAuth initializes the authentication providers
func InitAuth() {
	// Set up session store with secret from environment
	sessionSecret := getEnv("SESSION_SECRET", "your-secret-key-change-this-in-production")
	store = sessions.NewCookieStore([]byte(sessionSecret))
	gothic.Store = store

	// Initialize providers
	goth.UseProviders(
		github.New(
			getEnv("GITHUB_CLIENT_ID", "your-github-client-id"),
			getEnv("GITHUB_CLIENT_SECRET", "your-github-client-secret"),
			"http://localhost:8080/auth/github/callback",
		),
		google.New(
			getEnv("GOOGLE_CLIENT_ID", "your-google-client-id"),
			getEnv("GOOGLE_CLIENT_SECRET", "your-google-client-secret"),
			"http://localhost:8080/auth/google/callback",
		),
	)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// AuthMiddleware checks if user is authenticated
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, err := store.Get(c.Request, "auth-session")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Session error"})
			c.Abort()
			return
		}

		userData, ok := session.Values["user"]
		if !ok || userData == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
			c.Abort()
			return
		}

		// Type assert to SessionUser
		user, ok := userData.(*SessionUser)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid session data"})
			c.Abort()
			return
		}

		// Add user to context
		c.Set("user", user)
		c.Next()
	}
}

// BeginAuth starts the authentication process
func BeginAuth(c *gin.Context) {
	provider := c.Param("provider")
	log.Printf("Starting auth for provider: %s", provider)

	// Set the provider in the query params for gothic
	q := c.Request.URL.Query()
	q.Add("provider", provider)
	c.Request.URL.RawQuery = q.Encode()

	gothic.BeginAuthHandler(c.Writer, c.Request)
}

// AuthCallback handles the OAuth callback
func AuthCallback(c *gin.Context) {
	provider := c.Param("provider")

	// Set the provider in the query params for gothic
	q := c.Request.URL.Query()
	q.Add("provider", provider)
	c.Request.URL.RawQuery = q.Encode()

	user, err := gothic.CompleteUserAuth(c.Writer, c.Request)
	if err != nil {
		log.Printf("Error completing auth: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Authentication failed"})
		return
	}

	// Store user in session
	session, err := store.Get(c.Request, "auth-session")
	if err != nil {
		log.Printf("Error getting session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Session error"})
		return
	}

	// Create a display name if name is empty
	displayName := user.Name
	if displayName == "" && user.Email != "" {
		// Extract name from email (part before @)
		if atIndex := strings.Index(user.Email, "@"); atIndex > 0 {
			displayName = user.Email[:atIndex]
		} else {
			displayName = user.Email
		}
	}
	if displayName == "" {
		displayName = "User"
	}

	// Create a simplified user object for the session
	sessionUser := &SessionUser{
		ID:       user.UserID,
		Name:     displayName,
		Email:    user.Email,
		Avatar:   user.AvatarURL,
		Provider: user.Provider,
	}

	session.Values["user"] = sessionUser
	session.Options.MaxAge = 86400 * 7 // 7 days

	if err := session.Save(c.Request, c.Writer); err != nil {
		log.Printf("Error saving session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save session"})
		return
	}

	// Redirect to chat with user info
	c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("/?authenticated=true&user=%s", user.Name))
}

// Logout logs out the user
func Logout(c *gin.Context) {
	session, err := store.Get(c.Request, "auth-session")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Session error"})
		return
	}

	session.Values["user"] = nil
	session.Options.MaxAge = -1

	if err := session.Save(c.Request, c.Writer); err != nil {
		log.Printf("Error clearing session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to logout"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// GetCurrentUser returns the current authenticated user
func GetCurrentUser(c *gin.Context) {
	session, err := store.Get(c.Request, "auth-session")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Session error"})
		return
	}

	userData, ok := session.Values["user"]
	if !ok || userData == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	// Type assert to SessionUser
	user, ok := userData.(*SessionUser)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid session data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

// CheckAuth returns authentication status
func CheckAuth(c *gin.Context) {
	session, err := store.Get(c.Request, "auth-session")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}

	userData, ok := session.Values["user"]
	if !ok || userData == nil {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}

	// Type assert to SessionUser
	user, ok := userData.(*SessionUser)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"authenticated": true,
		"user":          user,
	})
}
