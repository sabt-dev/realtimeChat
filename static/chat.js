let ws = null;
let username = '';
let currentRoom = '';
let isConnected = false;
let isAuthenticated = false;
let currentUser = null;
let isReconnecting = false;
let connectionTimeout = null;
let heartbeatInterval = null;

const authSection = document.getElementById('authSection');
const loginOptions = document.getElementById('loginOptions');
const userInfo = document.getElementById('userInfo');
const joinForm = document.getElementById('joinForm');
const roomnameInput = document.getElementById('roomname');
const joinBtn = document.getElementById('joinBtn');
const loginScreen = document.getElementById('loginScreen');
const chatInterface = document.getElementById('chatInterface');
const roomTitle = document.getElementById('roomTitle');
const connectionStatus = document.getElementById('connectionStatus');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const roomsList = document.getElementById('rooms');

// Debug logging function (console only)
function debugLog(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Check if all required elements exist
function checkRequiredElements() {
    const required = {
        'authSection': authSection,
        'loginOptions': loginOptions,
        'userInfo': userInfo,
        'joinForm': joinForm,
        'roomnameInput': roomnameInput,
        'joinBtn': joinBtn,
        'loginScreen': loginScreen,
        'chatInterface': chatInterface
    };
    
    for (const [name, element] of Object.entries(required)) {
        if (!element) {
            console.error(`Required element missing: ${name}`);
        } else {
            console.log(`Element found: ${name}`);
        }
    }
}

// Authentication functions
function loginWith(provider) {
    console.log('LOGIN BUTTON CLICKED - Provider:', provider);
    debugLog(`Attempting to login with ${provider}`);
    window.location.href = `/auth/${provider}`;
}

function logout() {
    debugLog('Logging out...');
    
    // Stop heartbeat and close WebSocket connection before logout
    stopHeartbeat();
    if (ws) {
        ws._intentionalClose = true;
        ws.close(1000, 'User logout');
    }
    
    fetch('/auth/logout', { method: 'POST' })
        .then(() => {
            isAuthenticated = false;
            currentUser = null;
            currentRoom = '';
            isConnected = false;
            updateAuthUI();
        })
        .catch(error => {
            debugLog(`Logout error: ${error}`);
        });
}

function checkAuth() {
    debugLog('Checking authentication status...');
    return fetch('/auth/check')
        .then(response => response.json())
        .then(data => {
            debugLog(`Auth check response: ${JSON.stringify(data)}`);
            isAuthenticated = data.authenticated;
            if (data.authenticated) {
                currentUser = data.user;
                username = data.user.name;
            }
            updateAuthUI();
            return data.authenticated;
        })
        .catch(error => {
            debugLog(`Auth check error: ${error}`);
            isAuthenticated = false;
            updateAuthUI();
            return false;
        });
}

function updateAuthUI() {
    if (isAuthenticated && currentUser) {
        loginOptions.classList.add('hidden');
        userInfo.classList.remove('hidden');
        joinForm.classList.remove('hidden');
        
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userEmail').textContent = currentUser.email || '';
        
        debugLog(`Setting up avatar. Avatar URL: ${currentUser.avatar}`);
        if (currentUser.avatar) {
            const avatarElement = document.getElementById('userAvatar');
            avatarElement.style.backgroundImage = `url(${currentUser.avatar})`;
            debugLog(`Avatar set successfully to: ${currentUser.avatar}`);
        } else {
            debugLog('No avatar URL found in user data');
        }
    } else {
        loginOptions.classList.remove('hidden');
        userInfo.classList.add('hidden');
        joinForm.classList.add('hidden');
        chatInterface.classList.add('hidden');
        loginScreen.classList.remove('hidden');
    }
}

// Join room
joinBtn.addEventListener('click', joinRoom);
roomnameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function joinRoom() {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    const room = roomnameInput.value.trim();

    if (!room) {
        alert('Please enter a room name');
        return;
    }

    // Check if already in the same room
    if (currentRoom === room && isConnected && ws && ws.readyState === WebSocket.OPEN) {
        debugLog(`Already in room: ${room}, refreshing messages`);
        // Clear and reload messages for a fresh view
        clearMessages();
        loadRoomHistory(false); // Don't clear again since we just did
        return;
    }

    debugLog(`Switching from room "${currentRoom}" to room "${room}"`);
    
    // Cancel any pending connection timeout
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    // Reset connection flags
    isReconnecting = false;
    
    currentRoom = room;
    
    // Reset connection status
    isConnected = false;
    updateConnectionStatus('Connecting...');

    debugLog(`Attempting to join room: ${room} as user: ${username}`);
    connectWebSocket();
}

function connectWebSocket() {
    if (isReconnecting) {
        debugLog('Connection already in progress, skipping...');
        return;
    }
    
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    debugLog(`Connecting to WebSocket: ${wsUrl}`);

    isReconnecting = true;

    // Close existing connection if any and wait for it to fully close
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        debugLog('Closing existing WebSocket connection...');
        // Set a flag to indicate this is an intentional close
        ws._intentionalClose = true;
        
        // Clean close with proper reason
        ws.close(1000, 'Switching rooms');
        
        // Wait longer for the connection to close properly before creating new one
        connectionTimeout = setTimeout(() => {
            if (isReconnecting) { // Only proceed if still in reconnecting state
                createNewWebSocket(wsUrl);
            }
        }, 300);
    } else {
        createNewWebSocket(wsUrl);
    }
}

function createNewWebSocket(wsUrl) {
    debugLog('Creating new WebSocket connection...');
    
    // Clear any existing WebSocket reference
    ws = null;
    
    try {
        ws = new WebSocket(wsUrl);
    } catch (error) {
        debugLog(`Error creating WebSocket: ${error}`);
        isReconnecting = false;
        updateConnectionStatus('Connection failed');
        return;
    }

    ws.onopen = function() {
        debugLog('WebSocket connected successfully');
        isReconnecting = false;
        
        // Send join request
        const joinRequest = {
            username: username,
            room: currentRoom
        };
        debugLog(`Sending join request: ${JSON.stringify(joinRequest)}`);
        
        try {
            ws.send(JSON.stringify(joinRequest));
            isConnected = true;
            
            // Start heartbeat
            startHeartbeat();
            
            // Update UI and status after successful join
            updateUI();
            
            // Load room history after a short delay to avoid disrupting the connection
            setTimeout(() => {
                if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
                    loadRoomHistory(true);
                }
            }, 500);
        } catch (error) {
            debugLog(`Error sending join request: ${error}`);
            isReconnecting = false;
        }
    };

    ws.onmessage = function(event) {
        debugLog(`Received WebSocket message: ${event.data}`);
        try {
            const message = JSON.parse(event.data);
            debugLog(`Parsed message: ${JSON.stringify(message)}`);
            displayMessage(message);
        } catch (error) {
            debugLog(`Error parsing message: ${error}`);
        }
    };

    ws.onclose = function(event) {
        debugLog(`WebSocket disconnected: Code ${event.code}, Reason: ${event.reason}`);
        isConnected = false;
        isReconnecting = false;
        stopHeartbeat();
        
        // Don't show "Disconnected" for intentional closes (room switching)
        const wasIntentional = this._intentionalClose || event.code === 1000;
        
        if (!wasIntentional) {
            updateConnectionStatus('Disconnected');
        }
        
        // Only try to reconnect if it was an unexpected disconnection and we're still in a room
        if (!wasIntentional && currentRoom && isAuthenticated) {
            debugLog('Unexpected disconnection, will attempt to reconnect...');
            setTimeout(() => {
                if (!isConnected && !isReconnecting && currentRoom && isAuthenticated) {
                    debugLog('Attempting to reconnect...');
                    updateConnectionStatus('Reconnecting...');
                    connectWebSocket();
                }
            }, 3000);
        } else {
            debugLog('Not reconnecting - intentional close or normal closure');
        }
    };

    ws.onerror = function(error) {
        debugLog(`WebSocket error: ${error}`);
        updateConnectionStatus('Connection error');
        isConnected = false;
        isReconnecting = false;
        stopHeartbeat();
    };
}

function startHeartbeat() {
    // Stop any existing heartbeat
    stopHeartbeat();
    
    // Send a ping every 30 seconds to keep connection alive
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                // Send a simple ping message
                ws.send(JSON.stringify({ type: 'ping' }));
                debugLog('Heartbeat ping sent');
            } catch (error) {
                debugLog(`Heartbeat ping failed: ${error}`);
                isConnected = false;
                updateConnectionStatus('Connection lost');
            }
        } else {
            debugLog('WebSocket not open during heartbeat check');
            isConnected = false;
            updateConnectionStatus('Connection lost');
            stopHeartbeat();
        }
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        debugLog('Heartbeat stopped');
    }
}

function sendMessage() {
    const text = messageInput.value.trim();
    debugLog(`sendMessage called with text: "${text}"`);
    debugLog(`isConnected: ${isConnected}`);
    debugLog(`WebSocket readyState: ${ws ? ws.readyState : 'null'}`);
    
    if (!text || text.length === 0) {
        debugLog('No text to send - empty or whitespace only');
        return;
    }
    
    // Check WebSocket state
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        debugLog(`WebSocket is not open. ReadyState: ${ws ? ws.readyState : 'null'}`);
        alert('Connection lost. Please refresh and try again.');
        return;
    }

    const message = {
        text: text,
        type: 'message'
    };

    debugLog(`Sending message: ${JSON.stringify(message)}`);
    try {
        ws.send(JSON.stringify(message));
        messageInput.value = '';
        debugLog('Message sent successfully');
    } catch (error) {
        debugLog(`Error sending message: ${error}`);
        alert('Failed to send message. Please try again.');
    }
}

function displayMessage(message) {
    debugLog(`Displaying message: ${JSON.stringify(message)}`);
    debugLog(`Current username: "${username}", Message sender: "${message.sender}"`);
    
    // Filter out empty or invalid messages
    if (!message || !message.text || typeof message.text !== 'string' || message.text.trim() === '') {
        debugLog('Skipping empty or invalid message');
        return;
    }
    
    const messageEl = document.createElement('div');
    
    if (message.type === 'join' || message.type === 'leave') {
        messageEl.className = 'message system';
        messageEl.innerHTML = `<div>${escapeHtml(message.text)}</div>`;
        debugLog('Created system message element');
    } else {
        const isOwnMessage = message.sender === username;
        messageEl.className = `message ${isOwnMessage ? 'own' : 'other'}`;
        
        // Use shorter time format (just hours:minutes)
        const time = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Get avatar URL - use current user's avatar for own messages, or try to get from message data
        let avatarUrl = '';
        if (isOwnMessage && currentUser && currentUser.avatar) {
            avatarUrl = currentUser.avatar;
        } else if (message.avatar) {
            avatarUrl = message.avatar;
        }
        
        // Create avatar element
        const avatarHtml = avatarUrl ? 
            `<div class="message-avatar" style="background-image: url(${escapeHtml(avatarUrl)})"></div>` :
            `<div class="message-avatar-placeholder">${escapeHtml(message.sender.charAt(0).toUpperCase())}</div>`;
        
        if (isOwnMessage) {
            messageEl.innerHTML = `
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    <div>${escapeHtml(message.text)}</div>
                </div>
                ${avatarHtml}
            `;
        } else {
            messageEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    <div>${escapeHtml(message.text)}</div>
                </div>
            `;
        }
        
        debugLog(`Created ${isOwnMessage ? 'own' : 'other'} message element with avatar`);
    }

    debugLog(`Messages container exists: ${!!messagesContainer}`);
    debugLog(`Appending message element to container`);
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    debugLog(`Total messages in container now: ${messagesContainer.children.length}`);
    debugLog(`Message successfully displayed in UI`);
}

function clearMessages() {
    debugLog('Clearing all messages from UI');
    messagesContainer.innerHTML = '';
    debugLog('Messages cleared successfully');
}

function updateUI() {
    loginScreen.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    roomTitle.textContent = `Room: ${currentRoom}`;
    updateConnectionStatus('Connected');
    messageInput.focus();
}

function updateConnectionStatus(status) {
    connectionStatus.textContent = status;
    
    if (status === 'Connected') {
        connectionStatus.style.color = '#27ae60';
    } else if (status === 'Disconnected' || status === 'Connection error') {
        connectionStatus.style.color = '#e74c3c';
    } else {
        connectionStatus.style.color = '#f39c12';
    }
}

function loadRoomHistory(clearFirst = true) {
    if (!isAuthenticated) {
        debugLog('Not authenticated, skipping room history load');
        return;
    }
    
    // Clear existing messages when joining a new room (optional)
    if (clearFirst) {
        clearMessages();
    }
    
    debugLog(`Loading room history for: ${currentRoom}`);
    fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/messages`)
        .then(response => {
            if (response.status === 401) {
                debugLog('Unauthorized - redirecting to login');
                isAuthenticated = false;
                updateAuthUI();
                return;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            debugLog(`Room history response: ${JSON.stringify(data)}`);
            if (data.messages && data.messages.length > 0) {
                // Sort messages by timestamp
                data.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // Display historical messages - filter out empty ones
                data.messages.forEach(message => {
                    // Only display messages with valid text content
                    if (message && message.text && typeof message.text === 'string' && message.text.trim() !== '') {
                        displayMessage(message);
                    }
                });
            }
        })
        .catch(error => {
            debugLog(`Error loading room history: ${error}`);
        });
}

function loadActiveRooms() {
    if (!isAuthenticated) {
        document.getElementById('rooms').innerHTML = '<div style="opacity: 0.6; font-size: 14px;">Login to see active rooms</div>';
        return;
    }
    
    fetch('/api/rooms')
        .then(response => {
            if (response.status === 401) {
                debugLog('Unauthorized - redirecting to login');
                isAuthenticated = false;
                updateAuthUI();
                return;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            const roomsContainer = document.getElementById('rooms');
            roomsContainer.innerHTML = '';
            
            if (data.rooms && data.rooms.length > 0) {
                data.rooms.forEach(room => {
                    const roomEl = document.createElement('div');
                    roomEl.className = 'room-item';
                    if (room.name === currentRoom) {
                        roomEl.classList.add('active');
                    }
                    roomEl.innerHTML = `
                        <div><strong>${escapeHtml(room.name)}</strong></div>
                        <div style="font-size: 12px; opacity: 0.8;">${room.count} users online</div>
                    `;
                    roomsContainer.appendChild(roomEl);
                });
            } else {
                roomsContainer.innerHTML = '<div style="opacity: 0.6; font-size: 14px;">No active rooms</div>';
            }
        })
        .catch(error => {
            debugLog(`Error loading active rooms: ${error}`);
        });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load active rooms every 10 seconds
setInterval(loadActiveRooms, 10000);

// Initialize debug log
debugLog('Chat application initialized');

// Check authentication on page load
window.addEventListener('load', () => {
    console.log('=== PAGE LOADED - STARTING INITIALIZATION ===');
    checkRequiredElements();
    debugLog('Page loaded, checking authentication...');
    checkAuth().then(authenticated => {
        if (authenticated) {
            debugLog('User is authenticated');
            // Check if user was redirected after auth
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('authenticated') === 'true') {
                debugLog('User just completed authentication');
                // Clear the URL parameters
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } else {
            debugLog('User not authenticated');
        }
    });
    
    // Initial load of active rooms
    loadActiveRooms();
});
