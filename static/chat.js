let ws = null;
let username = '';
let currentRoom = '';
let isConnected = false;
let isAuthenticated = false;
let currentUser = null;

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
const debugInfo = document.getElementById('debugInfo');

// Debug logging function
function debugLog(message) {
    console.log(message);
    const timestamp = new Date().toLocaleTimeString();
    debugInfo.innerHTML += `<div>${timestamp}: ${message}</div>`;
    debugInfo.scrollTop = debugInfo.scrollHeight;
}

// Authentication functions
function loginWith(provider) {
    debugLog(`Attempting to login with ${provider}`);
    window.location.href = `/auth/${provider}`;
}

function logout() {
    debugLog('Logging out...');
    fetch('/auth/logout', { method: 'POST' })
        .then(() => {
            isAuthenticated = false;
            currentUser = null;
            updateAuthUI();
            if (ws) {
                ws.close();
            }
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

    currentRoom = room;

    debugLog(`Attempting to join room: ${room} as user: ${username}`);
    connectWebSocket();
}

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    debugLog(`Connecting to WebSocket: ${wsUrl}`);

    // Close existing connection if any
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
        debugLog('WebSocket connected successfully');
        
        // Send join request
        const joinRequest = {
            username: username,
            room: currentRoom
        };
        debugLog(`Sending join request: ${JSON.stringify(joinRequest)}`);
        
        try {
            ws.send(JSON.stringify(joinRequest));
            isConnected = true;
            updateUI();
            loadRoomHistory();
        } catch (error) {
            debugLog(`Error sending join request: ${error}`);
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
        updateConnectionStatus('Disconnected');
        
        // Try to reconnect after 3 seconds if not intentionally closed
        if (event.code !== 1000) {
            setTimeout(() => {
                if (!isConnected) {
                    debugLog('Attempting to reconnect...');
                    updateConnectionStatus('Reconnecting...');
                    connectWebSocket();
                }
            }, 3000);
        }
    };

    ws.onerror = function(error) {
        debugLog(`WebSocket error: ${error}`);
        updateConnectionStatus('Connection error');
        isConnected = false;
    };
}

function sendMessage() {
    const text = messageInput.value.trim();
    debugLog(`sendMessage called with text: "${text}"`);
    debugLog(`isConnected: ${isConnected}`);
    debugLog(`WebSocket readyState: ${ws ? ws.readyState : 'null'}`);
    
    if (!text) {
        debugLog('No text to send');
        return;
    }
    
    if (!isConnected) {
        debugLog('Not connected to WebSocket');
        alert('Not connected to chat server. Please refresh and try again.');
        return;
    }
    
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
    
    const messageEl = document.createElement('div');
    
    if (message.type === 'join' || message.type === 'leave') {
        messageEl.className = 'message system';
        messageEl.innerHTML = `<div>${escapeHtml(message.text)}</div>`;
        debugLog('Created system message element');
    } else {
        const isOwnMessage = message.sender === username;
        messageEl.className = `message ${isOwnMessage ? 'own' : 'other'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        messageEl.innerHTML = `
            <div class="message-info">${escapeHtml(message.sender)} - ${time}</div>
            <div>${escapeHtml(message.text)}</div>
        `;
        debugLog(`Created ${isOwnMessage ? 'own' : 'other'} message element`);
    }

    debugLog(`Messages container exists: ${!!messagesContainer}`);
    debugLog(`Appending message element to container`);
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    debugLog(`Total messages in container now: ${messagesContainer.children.length}`);
    debugLog(`Message successfully displayed in UI`);
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

function loadRoomHistory() {
    if (!isAuthenticated) {
        debugLog('Not authenticated, skipping room history load');
        return;
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
                
                // Display historical messages
                data.messages.forEach(message => {
                    displayMessage(message);
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
