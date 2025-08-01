package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// FileUploadResponse represents the response after file upload
type FileUploadResponse struct {
	Success  bool   `json:"success"`
	FileURL  string `json:"fileUrl,omitempty"`
	FileName string `json:"fileName,omitempty"`
	FileType string `json:"fileType,omitempty"`
	Error    string `json:"error,omitempty"`
}

// HandleFileUpload handles file uploads for chat media
func HandleFileUpload(c *gin.Context) {
	// Check authentication
	_, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	// Get the uploaded file
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		log.Printf("Error getting uploaded file: %v", err)
		c.JSON(http.StatusBadRequest, FileUploadResponse{
			Success: false,
			Error:   "No file uploaded",
		})
		return
	}
	defer file.Close()

	// Validate file type
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/jpg":  true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
		"video/mp4":  true,
		"video/webm": true,
		"video/mov":  true,
		"video/avi":  true,
	}

	contentType := header.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		c.JSON(http.StatusBadRequest, FileUploadResponse{
			Success: false,
			Error:   "File type not supported. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI) are allowed",
		})
		return
	}

	// Validate file size (50MB limit)
	const maxFileSize = 50 * 1024 * 1024 // 50MB
	if header.Size > maxFileSize {
		c.JSON(http.StatusBadRequest, FileUploadResponse{
			Success: false,
			Error:   "File too large. Maximum size is 50MB",
		})
		return
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := "uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("Error creating uploads directory: %v", err)
		c.JSON(http.StatusInternalServerError, FileUploadResponse{
			Success: false,
			Error:   "Failed to create upload directory",
		})
		return
	}

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	fileName := fmt.Sprintf("%s_%d%s", uuid.New().String(), time.Now().Unix(), ext)
	filePath := filepath.Join(uploadsDir, fileName)

	// Create the file
	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("Error creating file: %v", err)
		c.JSON(http.StatusInternalServerError, FileUploadResponse{
			Success: false,
			Error:   "Failed to save file",
		})
		return
	}
	defer dst.Close()

	// Copy the uploaded file to destination
	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("Error copying file: %v", err)
		c.JSON(http.StatusInternalServerError, FileUploadResponse{
			Success: false,
			Error:   "Failed to save file",
		})
		return
	}

	// Determine file type for frontend
	fileType := "image"
	if strings.HasPrefix(contentType, "video/") {
		fileType = "video"
	}

	// Generate file URL
	fileURL := fmt.Sprintf("/uploads/%s", fileName)

	log.Printf("File uploaded successfully: %s", fileName)

	c.JSON(http.StatusOK, FileUploadResponse{
		Success:  true,
		FileURL:  fileURL,
		FileName: header.Filename,
		FileType: fileType,
	})
}
