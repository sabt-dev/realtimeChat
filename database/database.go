package database

import (
	"log"
	"path/filepath"

	"github/sabt-dev/realtimeChat/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	// Import the modernc.org SQLite driver
	_ "modernc.org/sqlite"
)

var DB *gorm.DB

// InitDatabase initializes the SQLite database connection and runs migrations
func InitDatabase() error {
	// Create database file path
	dbPath := filepath.Join(".", "db.db")

	// Open database connection using modernc.org/sqlite (pure Go, no CGO)
	db, err := gorm.Open(sqlite.Dialector{
		DriverName: "sqlite",
		DSN:        dbPath,
	}, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return err
	}

	// Set global DB variable
	DB = db

	// Auto-migrate the schemas
	err = db.AutoMigrate(
		&models.Room{},
		&models.User{},
		&models.Message{},
		&models.RoomMember{},
		&models.MessageReaction{},
	)
	if err != nil {
		return err
	}

	// Add unique index for message reactions (one emoji per user per message)
	err = db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_unique ON message_reactions(message_id, user_id, emoji)").Error
	if err != nil {
		log.Printf("Warning: Failed to create unique index for message reactions: %v", err)
	}

	log.Println("Database initialized and migrated successfully")
	return nil
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}
